// Headless browser smoke test against the acceptance checks in build-specification section 15.
// Run with: node scripts/smoke.mjs   (needs playwright's chromium installed)
// Screenshots land in ./shots unless OUT says otherwise; CHROMIUM points at a browser if
// playwright's own download is missing. scripts/shots.mjs is the companion that looks at the
// layout and the settlement screen rather than the acceptance checks.
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT || 'shots'
mkdirSync(OUT, { recursive: true })
const server = await createServer({ server: { port: 5179, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')))
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
  return { ctx, page }
}
const results = []
const check = (name, ok, note = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`) }

let { ctx, page } = await newPage({ width: 390, height: 844 })
const t0 = Date.now()
await page.goto('http://localhost:5179/')
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
const bootMs = Date.now() - t0
check('1 coastline within about a second', bootMs < 2500, bootMs + ' ms to boot')
await page.waitForTimeout(800)
const pre = await page.evaluate(() => ({ turn: window.fairholm.state.turn, sites: window.fairholm.state.world.landingSites.length, sheet: window.fairholm.sheet.kind }))
check('2 three landing sites', pre.sites === 3 && pre.sheet === 'landing')
await page.screenshot({ path: `${OUT}/shot-arrival.png` })
// one tap starts: tap the first card
await page.locator('.card.tappable').first().tap()
await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 10000 })
await page.waitForTimeout(400)
const landed = await page.evaluate(() => ({ turn: window.fairholm.state.turn, settlements: window.fairholm.state.settlements.filter(s => s.owner === 0).length, sheet: window.fairholm.sheet.kind, queue: window.fairholm.queue.shown.map(g => g.title) }))
check('2 one tap starts', landed.turn === 1 && landed.settlements === 1, JSON.stringify(landed.queue))
await page.screenshot({ path: `${OUT}/shot-landed.png` })
// 3: tiles tappable at working zoom, not at overview
const tapTest = await page.evaluate(async () => {
  const a = window.fairholm
  a.scene.cam.view.zoom = 44; a.scene.cam.apply()
  const st = a.state.settlements[0]
  const w = a.state.world.width
  const [sx, sy] = a.scene.cam.worldToScreen((st.tile % w) + 1.5, Math.floor(st.tile / w) + 0.5)
  a.tap(sx, sy)
  const working = a.scene.cam.view.selectedTile === st.tile + 1
  a.scene.cam.view.zoom = 16; a.scene.cam.apply()
  a.scene.cam.view.selectedTile = null
  const [ox, oy] = a.scene.cam.worldToScreen((st.tile % w) + 3.5, Math.floor(st.tile / w) + 3.5)
  a.tap(ox, oy)
  const overview = a.scene.cam.view.selectedTile === null
  a.scene.cam.view.zoom = 44; a.scene.cam.apply()
  return { working, overview }
})
check('3 tiles tappable at working zoom, not at overview', tapTest.working && tapTest.overview, JSON.stringify(tapTest))
// 4: assign a worker, output next turn
const assign = await page.evaluate(() => {
  const a = window.fairholm
  const st = a.state.settlements[0]
  const idle = st.colonists.findIndex(c => c.job.kind === 'idle')
  const before = st.stock.timber
  a.open({ kind: 'settlementDetail', id: 0 })
  a.open({ kind: 'workers', settlement: 0, colonist: Math.max(0, idle) })
  const n = document.querySelectorAll('#sheet .line.tappable').length
  return { idle, before, options: n }
})
await page.locator('#sheet .line.tappable').first().tap()
await page.waitForTimeout(200)
const assigned = await page.evaluate(() => { const st = window.fairholm.state.settlements[0]; return st.colonists.map(c => c.job.kind + (c.job.good ? ':' + c.job.good : '')) })
await page.locator('#queuebar .btn.primary').tap()
await page.waitForTimeout(300)
const after = await page.evaluate(() => { const st = window.fairholm.state.settlements[0]; return { turn: window.fairholm.state.turn, produced: st.lastProduced, stock: st.stock } })
check('4 worker assigned, output next turn', after.turn === 2 && Object.values(after.produced).some(v => v > 0), JSON.stringify({ assigned, produced: after.produced }))
// 5: quiet turn one tap (end turn button always present; ensure one tap advances)
await page.locator('#queuebar .btn.primary').tap()
await page.waitForTimeout(200)
const t3 = await page.evaluate(() => window.fairholm.state.turn)
check('5 a turn is one tap', t3 === 3)
// 6: consign and watch the price fall
const consignRes = await page.evaluate(() => {
  const a = window.fairholm
  const st = a.state.settlements[0]
  st.stock.timber = 200
  const before = a.state.market.tables[0].timber.price
  a.open({ kind: 'consign', settlement: 0, good: 'timber' })
  return { before, text: document.querySelector('#sheet .preview')?.textContent }
})
await page.evaluate(() => { const s = document.querySelector('#sheet input[type=range]'); s.value = '200'; s.dispatchEvent(new Event('input')) })
await page.locator('#sheet .btn.primary').tap()
await page.waitForTimeout(200)
const afterC = await page.evaluate(() => ({ price: window.fairholm.state.market.tables[0].timber.price, log: window.fairholm.state.dispatch.slice(-1)[0]?.text, toast: document.querySelector('#toast')?.textContent }))
check('6 consign walks the price down', afterC.price < consignRes.before, `${consignRes.before} -> ${afterC.price}; ${afterC.log}`)
// play a run of turns via the UI
for (let i = 0; i < 12; i++) { await page.locator('#queuebar .btn.primary').tap(); await page.waitForTimeout(60) }
const mid = await page.evaluate(() => ({ turn: window.fairholm.state.turn, queue: window.fairholm.queue.shown.map(g => g.title), pop: window.fairholm.state.settlements[0].colonists.length, gold: window.fairholm.state.charters[0].gold, word: window.fairholm.state.charters[0].word }))
console.log('mid game', JSON.stringify(mid))
await page.screenshot({ path: `${OUT}/shot-midgame.png` })
// 7: save and reload
const savedTurn = mid.turn
await page.evaluate(() => window.fairholm.save())
await page.reload()
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.waitForTimeout(500)
const resumed = await page.evaluate(() => ({ turn: window.fairholm.state.turn, screen: document.querySelector('#overlay.show') !== null, text: document.querySelector('#overlay .screen')?.textContent?.slice(0, 200) }))
check('7 save and reload resumes', resumed.turn === savedTurn && resumed.screen, `turn ${resumed.turn}`)
await page.screenshot({ path: `${OUT}/shot-return.png` })
await page.locator('#overlay .btn.primary').tap()
// 8: export/import round trip
const rt = await page.evaluate(async () => {
  const a = window.fairholm
  const mod = await import('/src/io/save.ts')
  const text = await mod.exportText(a.state)
  const save = await mod.importText(text)
  const s2 = mod.fromSave(save, Date.now())
  const same = JSON.stringify(s2.settlements) === JSON.stringify(a.state.settlements) && s2.turn === a.state.turn && JSON.stringify(s2.world.tiles) === JSON.stringify(a.state.world.tiles)
  return { len: text.length, same }
})
check('8 export/import round-trips', rt.same, `${rt.len} chars`)
// 9: portrait and landscape
await page.setViewportSize({ width: 844, height: 390 })
await page.waitForTimeout(400)
const land = await page.evaluate(() => ({
  landscape: document.getElementById('app').classList.contains('landscape'),
  canvasW: document.getElementById('map').clientWidth,
  canvasH: document.getElementById('map').clientHeight,
  w: window.innerWidth, h: window.innerHeight,
  barVisible: document.getElementById('queuebar').clientHeight > 20,
}))
check('9 portrait and landscape, map edge to edge in both', land.landscape && land.canvasW === land.w && land.canvasH === land.h && land.barVisible, JSON.stringify(land))
await page.screenshot({ path: `${OUT}/shot-landscape.png` })
await page.setViewportSize({ width: 390, height: 844 })
// 10: background and restore
const ctxLoss = await page.evaluate(async () => {
  const a = window.fairholm
  const gl = a.scene.renderer.getContext()
  const ext = gl.getExtension('WEBGL_lose_context')
  if (!ext) return { skipped: true }
  ext.loseContext()
  await new Promise(r => setTimeout(r, 200))
  ext.restoreContext()
  await new Promise(r => setTimeout(r, 800))
  a.scene.draw(false)
  return { skipped: false, calls: a.scene.renderer.info.render.calls, lost: a.scene.renderer.getContext().isContextLost() }
})
check('10 background and restore without losing context', ctxLoss.skipped || (!ctxLoss.lost && ctxLoss.calls > 0), JSON.stringify(ctxLoss))
const perf = await page.evaluate(() => ({ calls: window.fairholm.scene.renderer.info.render.calls, tris: window.fairholm.scene.renderer.info.render.triangles }))
console.log('draw calls', JSON.stringify(perf))
console.log(results.join('\n'))
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n').slice(0, 4000) : 'no page errors')
await browser.close(); await server.close()
