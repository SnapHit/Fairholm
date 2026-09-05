// Look at the people. Art direction brief section 7.
//
// A colonist is a drawn figure now, standing on its tile with an owner ring under its feet, in one
// layer with the early era buildings. Nothing in a test can say whether it reads as a person or as a
// smudge, whether its shadow lies with the trees' shadows, whether the ring is there without
// shouting, or whether it sits in the same light as the barn beside it. This shoots the settlement
// with a colonist, a militia block and an improver standing in it, at working and detail zoom, in
// summer and in winter, with a crop of the figures at native pixels, and leaves the pictures for a
// person to look at.
//
// Run with:  node scripts/shots-units.mjs
//            OUT=shots-units CHROMIUM=/opt/pw-browsers/chromium node scripts/shots-units.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots-units'
const TAG = process.env.TAG || ''
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5190, strictPort: true }, logLevel: 'silent' })
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

await page.goto('http://localhost:5190/')
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.waitForTimeout(600)

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
await page.locator('.card.tappable').first().tap()
await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
await page.waitForTimeout(400)

// people to look at: the colonist the landing left standing, plus a militia block and an improver
// equipped from the roster through the real action, so the stock is spent the way it would be.
// One of them is then walked out onto open ground, because a figure standing in a settlement stands
// in the settlement's own shadow, and the question this script exists to answer is whether a figure
// casts a shadow of its own that can be told from a tree's
const made = await page.evaluate(() => {
  const a = window.fairholm
  const st = a.state.settlements[0]
  st.stock.arms = (st.stock.arms ?? 0) + 50
  st.stock.tooling = (st.stock.tooling ?? 0) + 50
  const before = a.state.units.length
  try { a.dispatch({ t: 'equip', settlement: 0, colonist: 0, as: 'militia' }) } catch (e) { return 'militia failed: ' + e.message }
  try { a.dispatch({ t: 'equip', settlement: 0, colonist: 0, as: 'improver' }) } catch (e) { return 'improver failed: ' + e.message }
  a.closeSheet()
  // This seed puts the settlement in a pocket of water and wood with no open land within four
  // tiles, and a figure standing under a wood stands in the wood's shadow, where nothing it casts
  // can be told apart from what the trees cast. So the rig clears one tile beside the settlement and
  // walks a figure onto it: open ground with wood around it, which is exactly the comparison this
  // script exists to make.
  const w = a.state.world.width
  const sx = st.tile % w, sz = Math.floor(st.tile / w)
  let best = null, bestScore = -1
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const nx = sx + dx, nz = sz + dz
    if (nx < 0 || nz < 0 || nx >= w || nz >= a.state.world.height) continue
    const i = nz * w + nx
    const t = a.state.world.tiles[i]
    if (t.terrain === 'water' || i === st.tile) continue
    // land, and away from the settlement so its own shadow pool does not swallow the figure
    const d = Math.abs(dx) + Math.abs(dz)
    const score = d === 0 ? -1 : 10 - Math.abs(d - 2)
    if (score > bestScore) { bestScore = score; best = i }
  }
  if (best !== null) {
    a.state.world.tiles[best].forest = null
    a.scene.rebuild(a.state, 'full')
  }
  const out = a.state.units.find(u => u.kind === 'improver')
  if (best !== null && out) out.tile = best
  window.__openUnit = out ? out.id : null
  return `${before} -> ${a.state.units.length} units: ${a.state.units.map(u => u.kind).join(', ')}; improver walked to ${best}`
})
console.log(made)
await page.waitForTimeout(400)

const ZOOMS = { working: 44, detail: 72 }
// summer and winter: the turn the season begins on, per the season cycle of three turns
const SEASONS = { summer: 4, winter: 10 }
const rows = []
for (const [seasonName, turn] of Object.entries(SEASONS)) {
  await page.evaluate((t) => {
    const a = window.fairholm
    a.state.turn = t
    a.scene.applySeason(a.state)
    a.scene.rebuild(a.state, 'dynamic')
    a.scene.requestDraw()
  }, turn)
  await page.waitForTimeout(900)
  for (const [zoomName, zoom] of Object.entries(ZOOMS)) {
    await page.evaluate((z) => {
      const a = window.fairholm
      a.scene.cam.glideTarget = null
      a.scene.cam.stop()
      a.scene.cam.centreOn(a.state.settlements[0].tile, z)
      a.scene.requestDraw()
    }, zoom)
    await page.waitForFunction(() => !window.fairholm.scene.loopRunning, null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => {
      const a = window.fairholm
      const w = a.state.world.width
      const st = a.state.settlements[0]
      const [sx, sy] = a.scene.cam.worldToScreen((st.tile % w) + 0.5, Math.floor(st.tile / w) + 0.5)
      const op = window.__openUnit !== null ? a.scene.unitPositions.get(window.__openUnit) : null
      const [ox, oy] = op ? a.scene.cam.worldToScreen(op[0], op[1]) : [sx, sy]
      return {
        calls: a.scene.renderer.info.render.calls,
        tris: a.scene.renderer.info.render.triangles,
        dpr: +a.scene.renderer.getPixelRatio().toFixed(2),
        cx: Math.round(sx), cy: Math.round(sy),
        ox: Math.round(ox), oy: Math.round(oy),
      }
    })
    const file = `${OUT}/${TAG ? TAG + '-' : ''}${seasonName}-${zoomName}.png`
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 390, height: 844 } })
    // the figures at native pixels: a person is the kind of thing that survives being looked at and
    // does not survive being scaled down
    const side = 130
    await page.screenshot({ path: file.replace('.png', '-crop.png'), clip: { x: Math.max(0, m.cx - side / 2), y: Math.max(0, m.cy - side / 2 + 10), width: side, height: side } })
    // and the figure standing out on open ground, where its own shadow has somewhere to fall and can
    // be compared with the trees' beside it
    await page.screenshot({ path: file.replace('.png', '-open.png'), clip: { x: Math.max(0, Math.min(390 - side, m.ox - side / 2)), y: Math.max(0, Math.min(844 - side, m.oy - side / 2 + 20)), width: side, height: side } })
    rows.push({ season: seasonName, zoom: zoomName, calls: m.calls, tris: m.tris, dpr: m.dpr })
  }
}

// and once at overview, where a person is a mark and nothing else
await page.evaluate(() => {
  const a = window.fairholm
  a.scene.cam.glideTarget = null
  a.scene.cam.stop()
  a.scene.cam.centreOn(a.state.settlements[0].tile, 16)
  a.scene.requestDraw()
})
await page.waitForFunction(() => !window.fairholm.scene.loopRunning, null, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/${TAG ? TAG + '-' : ''}winter-overview.png`, clip: { x: 0, y: 0, width: 390, height: 844 } })
const far = await page.evaluate(() => ({ calls: window.fairholm.scene.renderer.info.render.calls }))
rows.push({ season: 'winter', zoom: 'overview', calls: far.calls, tris: 0, dpr: 0 })

const head = ['season', 'zoom', 'calls', 'tris', 'dpr']
console.log(head.join('\t'))
for (const r of rows) console.log(head.map(k => r[k]).join('\t'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 2500) : '\nno page errors')

await browser.close()
await server.close()
