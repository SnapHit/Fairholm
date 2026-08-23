// Look at a settlement. Art direction brief section 6 and section 10.
//
// The composition is meant to grow: two buildings when two people live there, all seven by the time
// twelve do, and the footprint spilling past the tile as it goes. Nothing in a test can tell you
// whether that reads, so this shoots the same place at a run of sizes and at three zooms and leaves
// the pictures for a person to look at.
//
// Run with:  node scripts/shots-settlement.mjs
//            OUT=shots-settlement CHROMIUM=/opt/pw-browsers/chromium node scripts/shots-settlement.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots-settlement'
const TAG = process.env.TAG || ''
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5188, strictPort: true }, logLevel: 'silent' })
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

await page.goto('http://localhost:5188/')
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

// the season the sprites were drawn for, so the buildings are judged against summer light
await page.evaluate(() => {
  const a = window.fairholm
  a.state.turn = 4
  a.scene.applySeason(a.state)
  a.closeSheet()
})

const SIZES = [2, 4, 6, 10, 16]
const ZOOMS = { working: 44, detail: 72 }
const rows = []
for (const size of SIZES) {
  await page.evaluate((n) => {
    const a = window.fairholm
    const st = a.state.settlements[0]
    // the render layer reads how many people live here off the length of this, and nothing else
    while (st.colonists.length > 1) st.colonists.pop()
    while (st.colonists.length < n) st.colonists.push(st.colonists[0])
    a.scene.rebuild(a.state, 'dynamic')
    a.scene.requestDraw()
  }, size)
  await page.waitForTimeout(300)
  for (const [name, zoom] of Object.entries(ZOOMS)) {
    await page.evaluate((z) => {
      const a = window.fairholm
      const st = a.state.settlements[0]
      a.scene.cam.glideTarget = null
      a.scene.cam.stop()
      a.scene.cam.centreOn(st.tile, z)
      a.scene.requestDraw()
    }, zoom)
    await page.waitForFunction(() => !window.fairholm.scene.loopRunning, null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => ({
      calls: window.fairholm.scene.renderer.info.render.calls,
      tris: window.fairholm.scene.renderer.info.render.triangles,
      dpr: +window.fairholm.scene.renderer.getPixelRatio().toFixed(2),
    }))
    await page.screenshot({ path: `${OUT}/${TAG ? TAG + '-' : ''}size-${String(size).padStart(2, '0')}-${name}.png`, clip: { x: 0, y: 0, width: 390, height: 844 } })
    rows.push({ size, zoom: name, ...m })
  }
}

// and once at overview, where a settlement should be a mark and nothing else
await page.evaluate(() => {
  const a = window.fairholm
  a.scene.cam.glideTarget = null
  a.scene.cam.stop()
  a.scene.cam.centreOn(a.state.settlements[0].tile, 16)
  a.scene.requestDraw()
})
await page.waitForFunction(() => !window.fairholm.scene.loopRunning, null, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/${TAG ? TAG + '-' : ''}size-16-overview.png`, clip: { x: 0, y: 0, width: 390, height: 844 } })

const head = ['size', 'zoom', 'calls', 'tris', 'dpr']
console.log(head.join('\t'))
for (const r of rows) console.log(head.map(k => r[k]).join('\t'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 2500) : '\nno page errors')

await browser.close()
await server.close()
