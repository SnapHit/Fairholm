// Is the map the same colour at every zoom?
//
// It was not. The wide shot came out yellow-green and washed out and the close shot deep and
// saturated, which is a shading term that varies with how much world a pixel covers rather than an
// honest level of detail difference. This measures the two apart: the same patch of open ground is
// read at three zooms with the props drawn and with the props held off, so what the camera distance
// does to the shading can be told from what culling a tier does to the picture.
//
// Run with:  node scripts/zoom-colour.mjs
//            CHROMIUM=/opt/pw-browsers/chromium node scripts/zoom-colour.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { inflateSync } from 'node:zlib'
import { readFileSync, mkdirSync } from 'node:fs'

/** Just enough png to read back a screenshot: eight bit truecolour, not interlaced. */
function readPng(path) {
  const buf = readFileSync(path)
  let p = 8, w = 0, h = 0, ctype = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9] }
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    p += 12 + len
  }
  const ch = ctype === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let q = 0
  for (let y = 0; y < h; y++) {
    const f = raw[q++]
    const row = raw.subarray(q, q + stride); q += stride
    const cur = out.subarray(y * stride, y * stride + stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, (y - 1) * stride + stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= ch ? prev[x - ch] : 0
      let v = row[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const g = a + b - c
        const pa = Math.abs(g - a), pb = Math.abs(g - b), pc = Math.abs(g - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 255
    }
  }
  return { w, h, px: out, ch }
}

function measure(path) {
  const { w, h, px, ch } = readPng(path)
  let r = 0, g = 0, b = 0
  for (let i = 0; i < w * h; i++) { r += px[i * ch]; g += px[i * ch + 1]; b += px[i * ch + 2] }
  const n = w * h * 255
  r /= n; g /= n; b /= n
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return {
    r: +r.toFixed(4), g: +g.toFixed(4), b: +b.toFixed(4),
    lum: +(0.299 * r + 0.587 * g + 0.114 * b).toFixed(4),
    sat: +(mx ? (mx - mn) / mx : 0).toFixed(4),
    hue: +(Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI).toFixed(1),
  }
}

const OUT = process.env.OUT || 'shots-zoom'
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5189, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', e => problems.push('PAGEERROR ' + e.message))

await page.addInitScript(() => {
  window.makeGrey = (a) => {
    if (window.__grey) return window.__grey
    const t = a.scene.detail.grain.value.constructor
    const tex = new t(new Uint8Array([128]), 1, 1, 6403)
    tex.unpackAlignment = 1
    tex.needsUpdate = true
    window.__grey = tex
    return tex
  }
})
await page.goto('http://localhost:5189/')
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.waitForTimeout(600)
await page.evaluate(async (seed) => {
  const a = window.fairholm
  const actions = await import('/src/sim/actions.ts')
  a.state = actions.createGame(seed, { size: 'small', shape: 'continent', firstGame: false }, 1)
  a.scene.rebuild(a.state, 'full')
  a.beginArrival()
}, process.env.SEED || 'fairholm-shots')
await page.waitForTimeout(700)
await page.locator('.card.tappable').first().tap()
await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
await page.evaluate(() => window.fairholm.closeSheet())
await page.waitForTimeout(400)

// the biggest patch of open, unforested, unwatered ground on the map, so the reading is of country
// rather than of whatever happens to be near the settlement
const target = await page.evaluate(() => {
  const s = window.fairholm.state, w = s.world.width, h = s.world.height
  let best = -1, bestScore = -1
  for (let z = 3; z < h - 3; z++) for (let x = 3; x < w - 3; x++) {
    let score = 0
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const t = s.world.tiles[(z + dz) * w + (x + dx)]
      if (t.terrain !== 'water' && !t.forest) score++
    }
    if (score > bestScore) { bestScore = score; best = z * w + x }
  }
  return best
})

const ZOOMS = { overview: 16, working: 44, detail: 72 }
/** How much country each reading covers, in tiles. The same at every zoom, or the reading is of the
 *  composition rather than of the shading. */
const TILES_READ = 4
const rows = []
for (const [name, zoom] of Object.entries(ZOOMS)) {
  for (const variant of ['props', 'bare', 'flat']) {
    await page.evaluate(async ([tile, z, kind]) => {
      const wantProps = kind === 'props'
      const a = window.fairholm
      // 'flat' holds the tiling detail textures at a featureless grey, which takes away both the
      // tooth and the normal it bends: those are sampled with mipmaps, so how much of them survives
      // depends on how much world a pixel covers
      if (!window.__realGrain) { window.__realGrain = a.scene.detail.grain.value; window.__realRock = a.scene.detail.rock.value }
      if (kind === 'flat') {
        a.scene.detail.grain.value = window.makeGrey(a)
        a.scene.detail.rock.value = window.makeGrey(a)
      } else {
        a.scene.detail.grain.value = window.__realGrain
        a.scene.detail.rock.value = window.__realRock
      }
      a.scene.cam.glideTarget = null
      a.scene.cam.stop()
      a.scene.cam.centreOn(tile, z)
      a.scene.lockLod = true
      if (a.scene.props) a.scene.props.visible = wantProps
      if (a.scene.propsFine) a.scene.propsFine.visible = false
      a.scene.draw(false)
      await new Promise(r => requestAnimationFrame(r))
    }, [target, zoom, variant])
    await page.waitForTimeout(250)
    // the middle of the frame, at the pixels the phone draws, over the same four tiles of ground at
    // every zoom. Holding the pixel count instead would read four times as much country at overview
    // as at detail, and then the cloud shadows and the cast shadows alone would move the answer
    const side = Math.round(TILES_READ * zoom)
    const shot = `${OUT}/zoom-${name}-${variant}.png`
    await page.screenshot({ path: shot, clip: { x: 195 - side / 2, y: 372 - side / 2, width: side, height: side } })
    rows.push({ zoom: name, variant, ...measure(shot) })
  }
}
await page.evaluate(() => { window.fairholm.scene.lockLod = false })

const head = ['zoom', 'variant', 'r', 'g', 'b', 'lum', 'sat', 'hue']
console.log(head.join('\t'))
for (const r of rows) console.log(head.map(k => r[k]).join('\t'))
for (const v of ['props', 'bare', 'flat']) {
  const set = rows.filter(r => r.variant === v)
  const spread = (k) => (Math.max(...set.map(r => r[k])) - Math.min(...set.map(r => r[k])))
  console.log(`${v.padEnd(6)} across three zooms: luminance spread ${spread('lum').toFixed(4)}, saturation spread ${spread('sat').toFixed(4)}, hue spread ${spread('hue').toFixed(1)} degrees`)
}
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno page errors')

await browser.close()
await server.close()
