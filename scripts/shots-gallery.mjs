// Look at the gallery. Art direction brief sections 6 and 7.
//
// The gallery at /?gallery stands every drawing on the real map under the real light. This shoots
// it: the land rows, the hulls and the settlements, at working and detail zoom, in summer and in
// winter, on a phone held sideways so a whole row fits, and leaves the pictures for a person to
// look at. The questions they answer are the ones the art direction brief asks: one family, one
// scale, shadows that lie with the trees', a ship that sits in the water.
//
// Run with:  node scripts/shots-gallery.mjs
//            OUT=shots/gallery CHROMIUM=/opt/pw-browsers/chromium node scripts/shots-gallery.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/gallery'
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5191, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const W = 844, H = 390
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', e => problems.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')))
page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()) })

await page.goto('http://localhost:5191/?gallery')
await page.waitForFunction(() => !!window.gallery && !!window.gallery.scene, null, { timeout: 30000 })
await page.waitForTimeout(1200)

/** Where to look: a tile, and the zoom. */
const VIEWS = {
  land: { x: 8, z: 14, zoom: 44 },
  landClose: { x: 6, z: 13, zoom: 72 },
  company: { x: 6, z: 17, zoom: 72 },
  hulls: { x: 8, z: 4, zoom: 44 },
  hullsClose: { x: 6, z: 3, zoom: 72 },
  settlements: { x: 11, z: 10, zoom: 44 },
  settlementClose: { x: 11, z: 10, zoom: 72 },
  arrival: { x: 20, z: 7, zoom: 44 },
  wood: { x: 24, z: 13, zoom: 44 },
  overview: { x: 15, z: 10, zoom: 16 },
}
const SEASONS = { summer: 1, winter: 3 }
const rows = []
for (const [seasonName, k] of Object.entries(SEASONS)) {
  await page.evaluate((k) => window.gallery.season(k), k)
  await page.waitForTimeout(900)
  for (const [viewName, v] of Object.entries(VIEWS)) {
    await page.evaluate((v) => {
      const g = window.gallery
      g.scene.cam.glideTarget = null
      g.scene.cam.stop()
      g.scene.cam.centreOn(v.z * g.state.world.width + v.x, v.zoom)
      g.scene.requestDraw()
    }, v)
    await page.waitForFunction(() => !window.gallery.scene.loopRunning, null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => ({ calls: window.gallery.scene.renderer.info.render.calls, tris: window.gallery.scene.renderer.info.render.triangles }))
    await page.screenshot({ path: `${OUT}/${seasonName}-${viewName}.png`, clip: { x: 0, y: 0, width: W, height: H } })
    rows.push({ season: seasonName, view: viewName, calls: m.calls, tris: m.tris })
  }
}

const head = ['season', 'view', 'calls', 'tris']
console.log(head.join('\t'))
for (const r of rows) console.log(head.map(k => r[k]).join('\t'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 2500) : '\nno page errors')

await browser.close()
await server.close()
