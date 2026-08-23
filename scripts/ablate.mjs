// Which parts of the look actually change the picture.
//
// Renders the same frame with one thing switched off at a time and reports what it cost in
// luminance range, local contrast at three scales, and hue count, alongside a screenshot of each.
// The point is to be able to say honestly which items earned their place and which quietly did not.
//
// Run with: CHROMIUM=/opt/pw-browsers/chromium node scripts/ablate.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots-ablate'
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5191, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', e => problems.push('PAGEERROR ' + e.message))

await page.goto('http://localhost:5191/')
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.evaluate(async (seed) => {
  const a = window.fairholm
  const actions = await import('/src/sim/actions.ts')
  a.state = actions.createGame(seed, { size: 'small', shape: 'continent', firstGame: false }, 1)
  a.scene.rebuild(a.state, 'full')
  a.beginArrival()
}, 'fairholm-shots')
await page.waitForTimeout(700)
await page.locator('.card.tappable').first().tap()
await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
await page.waitForTimeout(400)
await page.evaluate(() => {
  const a = window.fairholm
  const st = a.state.settlements[0]
  st.buildings.carpenter = 2; st.buildings.smelter = 2; st.buildings.toolworks = 1
  st.buildings.meeting = 1; st.buildings.storage = 2; st.buildings.works = 2
  st.buildings.school = 1; st.buildings.linenWorks = 1
  if (a.state.world.tiles.some(t => t.terrain === 'water')) st.buildings.wharf = 1
  a.dispatch({ t: 'autoAssign', settlement: 0 })
  a.closeSheet()
  a.state.turn = 4          // deep summer
  a.scene.applySeason(a.state)
  a.scene.cam.glideTarget = null
  a.scene.cam.stop()
  a.scene.cam.centreOn(st.tile, 72)
  a.scene.requestDraw()
})

/** Everything switchable, as a pair of functions run in the page. */
const CASES = [
  ['baseline', 'nothing off', () => {}],
  ['no-textures', 'item 15, the tiling detail textures', () => {
    const a = window.fairholm, d = a.scene.detail
    window.__keep = { g: d.grain.value, r: d.rock.value, p: d.ripple.value }
    const flat = a.scene.terrain.material.uniforms.uGrain.value.constructor
    void flat
    d.grain.value = window.__flat; d.rock.value = window.__flat; d.ripple.value = window.__flat
  }],
  ['no-grain', 'item 17, the fine procedural grain', () => { window.fairholm.scene.light.uFilm.value = 0 }],
  ['no-shadows', 'items 3 and 14, the baked cast and contact shadows', () => { window.fairholm.scene.light.uShadowStrength.value = 0 }],
  ['no-rim', 'item 6, the rim light on sun-facing edges', () => { window.fairholm.scene.light.uRimStrength.value = 0 }],
  ['no-cool-fill', 'item 2, the cool ambient from the sky', () => {
    const l = window.fairholm.scene.light
    const c = l.uAmbientColour.value
    const grey = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    c.setRGB(grey, grey, grey)
    l.uShadowColour.value.setRGB(grey * 0.8, grey * 0.8, grey * 0.8)
  }],
  ['sun-overhead', 'item 1, the warm key at a low elevation', () => {
    const l = window.fairholm.scene.light
    l.uSunDir.value.set(0, 1, 0)
    l.uKeyColour.value.setRGB(1, 1, 1)
  }],
  ['no-contrast', 'item 5, the widened value range', () => {
    const l = window.fairholm.scene.light
    l.uContrast.value = 1; l.uLift.value = 0
  }],
  ['no-fine-props', 'item 10, the smallest of the three scales', () => { window.fairholm.scene.propsFine.visible = false; window.fairholm.scene.lockLod = true }],
  ['no-props', 'item 9, every prop', () => {
    const s = window.fairholm.scene
    s.props.visible = false; s.propsFine.visible = false; s.lockLod = true
  }],
  ['no-occlusion', 'item 4, occlusion baked into the vertex colours', async () => {
    const look = await import('/src/render/look.ts')
    look.SHADOW.aoStrength = 0
    window.fairholm.scene.lastWorldKey = ''
    window.fairholm.scene.rebuild(window.fairholm.state, 'full')
  }, async () => {
    const look = await import('/src/render/look.ts')
    look.SHADOW.aoStrength = window.__ao
  }],
  ['no-elevation', 'item 12, real terrain elevation', async () => {
    const look = await import('/src/render/look.ts')
    for (const k of Object.keys(look.SURFACE.height)) if (k !== 'water') look.SURFACE.height[k] = 0.1
    look.SURFACE.landform.amplitude = 0
    look.SURFACE.landform.detail = 0
    for (const k of Object.keys(look.SURFACE.roughness)) look.SURFACE.roughness[k] = 0
    window.fairholm.scene.lastWorldKey = ''
    window.fairholm.scene.rebuild(window.fairholm.state, 'full')
  }, async () => {
    const look = await import('/src/render/look.ts')
    Object.assign(look.SURFACE.height, window.__height)
    Object.assign(look.SURFACE.roughness, window.__rough)
    Object.assign(look.SURFACE.landform, window.__landform)
  }],
  ['flat-roofs', 'item 13, props with actual form', async () => {
    const look = await import('/src/render/look.ts')
    look.BUILD.pitch = 0.995
    window.fairholm.scene.rebuild(window.fairholm.state, 'dynamic')
  }, async () => {
    const look = await import('/src/render/look.ts')
    look.BUILD.pitch = window.__pitch
  }],
  ['no-variation', 'item 11, per-instance scale, rotation and hue', async () => {
    const look = await import('/src/render/look.ts')
    look.PROPS.hueJitter = 0
    look.PROPS.valueJitter = 0
    look.PROPS.emergentEvery = 1e9
    for (const k of Object.keys(look.PROPS.canopy)) {
      const [lo, hi] = look.PROPS.canopy[k]
      const mid = (lo + hi) / 2
      look.PROPS.canopy[k] = [mid, mid]
    }
    window.fairholm.scene.lastWorldKey = ''
    window.fairholm.scene.rebuild(window.fairholm.state, 'full')
  }, async () => {
    const look = await import('/src/render/look.ts')
    look.PROPS.hueJitter = window.__hue
    look.PROPS.valueJitter = window.__value
    look.PROPS.emergentEvery = window.__emergent
    Object.assign(look.PROPS.canopy, window.__canopy)
  }],
]

// remember what has to be put back
await page.evaluate(async () => {
  const look = await import('/src/render/look.ts')
  const THREE = window.fairholm.scene.terrain.material.uniforms.uGrain.value
  window.__flat = THREE.clone ? THREE.clone() : THREE
  window.__ao = look.SHADOW.aoStrength
  window.__height = { ...look.SURFACE.height }
  window.__rough = { ...look.SURFACE.roughness }
  window.__landform = { ...look.SURFACE.landform }
  window.__pitch = look.BUILD.pitch
  window.__hue = look.PROPS.hueJitter
  window.__value = look.PROPS.valueJitter
  window.__emergent = look.PROPS.emergentEvery
  window.__canopy = JSON.parse(JSON.stringify(look.PROPS.canopy))
  // a genuinely flat stand-in for the detail textures
  const t = window.fairholm.scene.detail
  window.__flat = t.grain.value.clone()
  window.__flat.image = { data: new Uint8Array([128]), width: 1, height: 1 }
  window.__flat.needsUpdate = true
})

async function measure() {
  return page.evaluate(() => {
    const a = window.fairholm
    const W = 260, H = 520
    const d = a.scene.readFrame(W, H)
    const lum = new Float32Array(W * H)
    const hues = new Set()
    let min = 1, max = 0, sum = 0
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255
      const l = 0.299 * r + 0.587 * g + 0.114 * b
      lum[i] = l
      if (l < min) min = l
      if (l > max) max = l
      sum += l
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      if (mx - mn > 0.05) {
        let hue
        if (mx === r) hue = ((g - b) / (mx - mn) + 6) % 6
        else if (mx === g) hue = (b - r) / (mx - mn) + 2
        else hue = (r - g) / (mx - mn) + 4
        hues.add(Math.round(hue * 60 / 20))
      }
    }
    const mean = sum / (W * H)
    let variance = 0
    for (let i = 0; i < W * H; i++) variance += (lum[i] - mean) ** 2
    const contrast = (n) => {
      let acc = 0, count = 0
      for (let y = 0; y + n < H; y += 2) for (let x = 0; x + n < W; x += 2) {
        acc += Math.abs(lum[y * W + x] - lum[y * W + x + n]) + Math.abs(lum[y * W + x] - lum[(y + n) * W + x])
        count += 2
      }
      return acc / count
    }
    return {
      mean: +mean.toFixed(3), sd: +Math.sqrt(variance / (W * H)).toFixed(3),
      range: +(max - min).toFixed(3), hues: hues.size,
      fine: +contrast(1).toFixed(4), mid: +contrast(6).toFixed(4), broad: +contrast(24).toFixed(4),
    }
  })
}

const reset = async () => {
  await page.evaluate(async () => {
    const a = window.fairholm
    const look = await import('/src/render/look.ts')
    // put every switched value back
    look.SHADOW.aoStrength = window.__ao
    Object.assign(look.SURFACE.height, window.__height)
    Object.assign(look.SURFACE.roughness, window.__rough)
    Object.assign(look.SURFACE.landform, window.__landform)
    look.BUILD.pitch = window.__pitch
    look.PROPS.hueJitter = window.__hue
    look.PROPS.valueJitter = window.__value
    look.PROPS.emergentEvery = window.__emergent
    Object.assign(look.PROPS.canopy, window.__canopy)
    const d = a.scene.detail
    if (window.__keep) { d.grain.value = window.__keep.g; d.rock.value = window.__keep.r; d.ripple.value = window.__keep.p }
    a.scene.lockLod = false
    a.scene.lastSeason = -1
    a.scene.lastWorldKey = ''
    a.scene.rebuild(a.state, 'full')
    a.state.turn = 4
    a.scene.applySeason(a.state)
    a.scene.cam.glideTarget = null
    a.scene.cam.stop()
    a.scene.cam.centreOn(a.state.settlements[0].tile, 72)
    a.scene.draw(false)
  })
  await page.waitForTimeout(500)
}

const rows = []
for (const [name, what, off] of CASES) {
  await page.evaluate(off)
  await page.evaluate(() => window.fairholm.scene.draw(false))
  await page.waitForTimeout(500)
  await page.evaluate(() => window.fairholm.scene.draw(false))
  const m = await measure()
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 110, width: 390, height: 620 } })
  rows.push({ case: name, what, ...m })
  await reset()
}

const base = rows[0]
const head = ['case', 'mean', 'sd', 'range', 'hues', 'fine', 'mid', 'broad']
console.log([...head, 'change', 'what'].join('\t'))
for (const r of rows) {
  const drift = r.case === 'baseline' ? '' :
    ['mean', 'sd', 'fine', 'mid', 'broad'].map(k => `${k} ${(((r[k] - base[k]) / (base[k] || 1)) * 100).toFixed(0)}%`).join(' ')
  console.log([...head.map(k => r[k]), drift, r.what].join('\t'))
}
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 2000) : '\nno page errors')

await browser.close()
await server.close()
