// Look at the map. Art direction brief sections 2, 3, 8 and 10.
//
// Shoots the map at overview, working and detail zoom, in every season, and reports the draw call
// count, the triangle count and the settled device pixel ratio. It also measures the things you
// cannot judge from code: the spread of luminance in the frame, how many distinct hues are on
// screen, and how much local contrast there is at three different scales.
//
// Run with:  node scripts/shots-map.mjs
//            OUT=shots-map CHROMIUM=/opt/pw-browsers/chromium node scripts/shots-map.mjs
//            SEED=abc node scripts/shots-map.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots-map'
const TAG = process.env.TAG || ''
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5187, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', e => problems.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')))
page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()) })

await page.goto('http://localhost:5187/')
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.waitForTimeout(600)

// one fixed world, so two runs of this script can be compared
await page.evaluate(async (seed) => {
  const a = window.fairholm
  const actions = await import('/src/sim/actions.ts')
  a.state = actions.createGame(seed, { size: 'small', shape: 'continent', firstGame: false }, 1)
  a.undoStack = []
  a.scene.cam.view.selectedTile = null
  a.scene.arrivalProgress = 0
  a.scene.arrivalSite = null
  a.scene.rebuild(a.state, 'full')
  a.beginArrival()
}, process.env.SEED || 'fairholm-shots')
await page.waitForTimeout(800)

// land, so there is a settlement, some units and a worked tile to look at
await page.locator('.card.tappable').first().tap()
await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
await page.waitForTimeout(400)

// give the settlement something to be: buildings, walls, a wharf, a few turns of growth
await page.evaluate(() => {
  const a = window.fairholm
  const st = a.state.settlements[0]
  st.buildings.carpenter = 2; st.buildings.smelter = 2; st.buildings.toolworks = 1
  st.buildings.meeting = 1; st.buildings.storage = 2; st.buildings.works = 2
  st.buildings.school = 1; st.buildings.linenWorks = 1
  if (a.state.world.tiles.some(t => t.terrain === 'water')) st.buildings.wharf = 1
  a.dispatch({ t: 'autoAssign', settlement: 0 })
  a.closeSheet()
})
await page.waitForTimeout(400)

const ZOOMS = { overview: 16, working: 44, detail: 72 }
// the refine timer in the renderer, plus a margin
const C_SETTLE = 400
const SEASONS = ['new-green', 'deep-summer', 'turn-of-the-leaf', 'bare-ground']

/** Everything about a frame that a person would otherwise have to squint at. */
async function measure() {
  return page.evaluate(() => {
    const a = window.fairholm
    const W = 260, H = 520
    const d = a.scene.readFrame(W, H)
    const lum = new Float32Array(W * H)
    const hues = new Set()
    let min = 1, max = 0, sum = 0
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4] / 255, gg = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255
      const l = 0.299 * r + 0.587 * gg + 0.114 * b
      lum[i] = l
      if (l < min) min = l
      if (l > max) max = l
      sum += l
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b)
      if (mx - mn > 0.05) {
        let hue
        if (mx === r) hue = ((gg - b) / (mx - mn) + 6) % 6
        else if (mx === gg) hue = (b - r) / (mx - mn) + 2
        else hue = (r - gg) / (mx - mn) + 4
        hues.add(Math.round(hue * 60 / 20))   // 20 degree buckets
      }
    }
    const mean = sum / (W * H)
    let variance = 0
    for (let i = 0; i < W * H; i++) variance += (lum[i] - mean) ** 2
    const sd = Math.sqrt(variance / (W * H))
    // local contrast at three scales: the mean absolute difference between a texel and the one n away
    const scaleContrast = (n) => {
      let acc = 0, count = 0
      for (let y = 0; y + n < H; y += 2) for (let x = 0; x + n < W; x += 2) {
        acc += Math.abs(lum[y * W + x] - lum[y * W + x + n]) + Math.abs(lum[y * W + x] - lum[(y + n) * W + x])
        count += 2
      }
      return acc / count
    }
    // how much of the frame is genuinely dark and genuinely light
    let dark = 0, light = 0
    for (let i = 0; i < W * H; i++) { if (lum[i] < 0.22) dark++; if (lum[i] > 0.72) light++ }
    return {
      min: +min.toFixed(3), max: +max.toFixed(3), mean: +mean.toFixed(3), sd: +sd.toFixed(3),
      darkPct: +(dark / (W * H) * 100).toFixed(1), lightPct: +(light / (W * H) * 100).toFixed(1),
      hues: hues.size,
      fine: +scaleContrast(1).toFixed(4), mid: +scaleContrast(6).toFixed(4), broad: +scaleContrast(24).toFixed(4),
      calls: a.scene.renderer.info.render.calls,
      tris: a.scene.renderer.info.render.triangles,
      dpr: +a.scene.renderer.getPixelRatio().toFixed(2),
      devicePR: window.devicePixelRatio,
      props: a.scene.propCount ?? -1,
    }
  })
}

const rows = []
for (let season = 0; season < 4; season++) {
  await page.evaluate((sn) => {
    const a = window.fairholm
    // the season turns every three turns, so put the turn where that season begins
    a.state.turn = 1 + sn * 3
    a.scene.applySeason(a.state)
    a.scene.rebuild(a.state, 'full')
    a.scene.requestDraw()
  }, season)
  await page.waitForTimeout(1200)
  for (const [name, zoom] of Object.entries(ZOOMS)) {
    await page.evaluate((z) => {
      const a = window.fairholm
      const st = a.state.settlements[0]
      a.scene.cam.glideTarget = null    // otherwise the landing glide drags the zoom back
      a.scene.cam.stop()
      a.scene.cam.centreOn(st.tile, z)
      a.scene.requestDraw()
    }, zoom)
    // wait for the map to go idle: nothing moving, nothing drawing. If it never does, that is
    // itself the bug, and the resolution reported below will say so
    await page.waitForFunction(() => !window.fairholm.scene.loopRunning, null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(C_SETTLE)
    const m = await measure()
    const file = `${OUT}/${TAG ? TAG + '-' : ''}${SEASONS[season]}-${name}.png`
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 390, height: 844 } })
    // and a crop of the middle at native pixels, because a shadow on the ground is the kind of thing
    // that survives being looked at and does not survive being scaled down
    await page.screenshot({ path: file.replace('.png', '-crop.png'), clip: { x: 97, y: 300, width: 196, height: 196 } })
    rows.push({ season: SEASONS[season], zoom: name, ...m })
  }
}

const head = ['season', 'zoom', 'min', 'max', 'mean', 'sd', 'darkPct', 'lightPct', 'hues', 'fine', 'mid', 'broad', 'calls', 'tris', 'dpr', 'devicePR', 'props']
console.log(head.join('\t'))
for (const r of rows) console.log(head.map(k => r[k]).join('\t'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 2500) : '\nno page errors')

await browser.close()
await server.close()
