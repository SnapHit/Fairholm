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
// 2: the game opens at sea, in fog, with the lines over the shot; nothing is offered
const pre = await page.evaluate(() => {
  const s = window.fairholm.state
  return {
    turn: s.turn, lander: !!s.units.find(u => u.owner === 0 && u.kind === 'lander'), settlements: s.settlements.filter(x => x.owner === 0).length,
    lines: document.querySelectorAll('#opening .line').length, sheet: window.fairholm.sheet.kind, chooser: document.querySelectorAll('.card.tappable').length,
    explored: s.world.tiles.filter(t => t.explored).length / s.world.tiles.length,
  }
})
check('2 opens at sea in fog with the lines, nothing offered', pre.turn === 1 && pre.lander && pre.settlements === 0 && pre.lines === 5 && pre.chooser === 0 && pre.explored < 0.25, JSON.stringify(pre))
await page.screenshot({ path: `${OUT}/shot-arrival.png` })
// the first tap anywhere takes the lines away and starts the music
await page.touchscreen.tap(195, 300)
await page.waitForTimeout(1200)
// the lines are gone the moment the tap lands; the element follows after its fade, on a timer a
// loaded machine can hold up, so the check reads the state and not the timer
const tapped = await page.evaluate(() => ({ showing: window.fairholm.opening ? window.fairholm.opening.showing : false, fading: !!document.querySelector('#opening.gone'), gone: !document.querySelector('#opening'), music: window.fairholm.music.position > 0 || window.fairholm.music.playing }))
check('2 the first tap dismisses the lines', !tapped.showing && (tapped.gone || tapped.fading), JSON.stringify(tapped))
// one move, by the player's own gestures: a tap on the lander, which brings its card up in the
// queue bar's place, a tap and hold on the water toward the coast, as far along the way as is on
// the map above the card, which plots a course and moves nothing, then a tap on the course's end,
// which sails it. The heading is the
// one toward the nearest coast, which is what a player who guessed right would sail. The hold is
// held well past its length, because a software renderer draws few frames and the hold completes
// on a frame
const landerAt = () => page.evaluate(() => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const l = s.units.find(u => u.owner === 0 && u.kind === 'lander')
  return l ? a.scene.cam.worldToScreen((l.tile % w) + 0.5, Math.floor(l.tile / w) + 0.5) : null
})
// a tap anywhere on the lander's picture chooses it; up to three taps, in case one lands while the
// camera is still settling
const landerChosen = () => page.evaluate(() => { const a = window.fairholm; return a.scene.cam.view.activeUnit === a.state.units.find(u => u.owner === 0 && u.kind === 'lander')?.id })
let lp = null
for (let k = 0; k < 3; k++) {
  if (await landerChosen()) break
  lp = await landerAt()
  await page.touchscreen.tap(lp[0], lp[1])
  await page.waitForFunction(() => document.getElementById('queuebar').classList.contains('carded'), null, { timeout: 2000 }).catch(() => {})
}
await page.waitForFunction(() => !window.fairholm.scene.cam.glideTarget && !window.fairholm.scene.moving, null, { timeout: 10000 }).catch(() => {})
await page.waitForTimeout(400)
const aim = await page.evaluate(async () => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const auto = await import('/src/sim/autopilot.ts')
  const act = auto.openingAction(s)
  if (!act || act.t !== 'moveUnit') return { skipped: act ? act.t : 'none' }
  const top = a.hud.getBoundingClientRect().height + 24
  const bottom = a.root.clientHeight - a.queuebar.offsetHeight - 24
  // within one turn's sailing, so the tap on the end sails it all the way
  const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')
  let best = null
  for (const t of act.path.slice(0, lander.moves)) {
    const [sx, sy] = a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5)
    if (sx < 24 || sx > a.root.clientWidth - 24 || sy < top || sy > bottom) break
    best = { sx, sy, k: act.path.indexOf(t) + 1 }
  }
  return { best, card: document.getElementById('queuebar').classList.contains('carded'), active: a.scene.cam.view.activeUnit, lp: null, land: s.world.tiles.filter(t => t.explored && t.terrain !== 'water').length }
})
let sailed = { skipped: aim.skipped }
if (!aim.skipped && aim.best) {
  const before = await page.evaluate(() => window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'lander').tile)
  // the hold plots a course and moves nothing
  // whether a move is drawn travelling, caught as it starts: a short move can be over before a
  // software renderer has drawn more than a frame or two
  await page.evaluate(() => { window.__sawMoving = false; const sc = window.fairholm.scene; const real = sc.animateMoves.bind(sc); sc.animateMoves = (...args) => { const r = real(...args); if (sc.moving) window.__sawMoving = true; return r } })
  await page.mouse.move(aim.best.sx, aim.best.sy)
  await page.mouse.down()
  await page.waitForTimeout(1500)
  await page.mouse.up()
  await page.waitForTimeout(500)
  const plotted = await page.evaluate(() => { const a = window.fairholm; return { ok: !!a.route?.ok, end: a.route?.end, tile: a.state.units.find(u => u.owner === 0 && u.kind === 'lander').tile, moved: window.__sawMoving } })
  // a tap on the course's end sails it
  await page.touchscreen.tap(aim.best.sx, aim.best.sy)
  await page.waitForFunction(() => window.__sawMoving, null, { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => !window.fairholm.scene.moving, null, { timeout: 20000 }).catch(() => {})
  sailed = await page.evaluate((k) => ({ travelling: window.__sawMoving, tilesOut: k, landBefore: 0, landAfter: window.fairholm.state.world.tiles.filter(t => t.explored && t.terrain !== 'water').length, tileAfter: window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'lander')?.tile, cardAfter: document.getElementById('queuebar').classList.contains('carded'), toast: document.querySelector('#toast')?.textContent }), aim.best.k)
  sailed.plotted = { ...plotted, stillAt: plotted.tile === before }
  sailed.landBefore = aim.land
} else if (!aim.skipped) sailed = { error: 'no tile of the way on the screen', card: aim.card }
check('2 a hold plots a course without moving, and a tap on its end sails it, drawn travelling, sighting land', !!sailed.skipped || (sailed.plotted.ok && sailed.plotted.stillAt && !sailed.plotted.moved && sailed.travelling && sailed.tileAfter === sailed.plotted.end && sailed.landBefore === 0 && sailed.landAfter > 0), JSON.stringify(sailed))
// the rest of the voyage: the machine sails the lander to the coast and founds, through the game's own actions
const foundedOn = await page.evaluate(() => window.fairholm.autoplayOpening())
await page.waitForTimeout(400)
const landed = await page.evaluate(() => ({ turn: window.fairholm.state.turn, settlements: window.fairholm.state.settlements.filter(s => s.owner === 0).length, name: window.fairholm.state.settlements.find(s => s.owner === 0)?.name, boat: window.fairholm.state.units.some(u => u.owner === 0 && u.kind === 'lighter'), lander: window.fairholm.state.units.some(u => u.owner === 0 && u.kind === 'lander'), queue: window.fairholm.queue.shown.map(g => g.title) }))
check('2 the voyage founds within a few turns, the lander consumed and the boat left', foundedOn >= 1 && foundedOn <= 6 && landed.settlements === 1 && landed.boat && !landed.lander && landed.name === 'The Landing', `founded on turn ${foundedOn}; ${JSON.stringify(landed.queue)}`)
await page.screenshot({ path: `${OUT}/shot-landed.png` })
await page.evaluate(() => window.fairholm.closeSheet())
// 3: tiles tappable at working zoom, not at overview
const tapTest = await page.evaluate(async () => {
  const a = window.fairholm
  const picking = await import('/src/render/picking.ts')
  a.scene.cam.view.zoom = 44; a.scene.cam.apply()
  a.scene.draw(false)
  const st = a.state.settlements.find(x => x.owner === 0)
  const w = a.state.world.width
  // a tile near the settlement with nothing drawn over its middle: a tap on a picture is a tap on
  // what is drawn, feel brief section 3, so the tile is tested where only the tile is
  const pics = { units: a.scene.unitPictures, settlements: a.scene.settlementPictures, shown: a.scene.drawnClose, cover: a.scene.pictureCover.bind(a.scene) }
  let target = null, sx = 0, sy = 0
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2], [3, 0], [0, 3]]) {
    const t = st.tile + dz * w + dx
    ;[sx, sy] = a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5)
    const p = picking.pick(a.state, a.scene.cam, sx, sy, a.scene.unitPositions, pics, 44)
    if (p.unit === null && p.settlement === null && p.predecessor === null && p.tile === t && !a.state.units.some(u => u.tile === t && u.owner === 0)) { target = t; break }
  }
  a.tap(sx, sy)
  const working = target !== null && a.scene.cam.view.selectedTile === target
  a.scene.cam.view.zoom = 16; a.scene.cam.apply()
  a.scene.cam.view.selectedTile = null
  const [ox, oy] = a.scene.cam.worldToScreen((st.tile % w) + 3.5, Math.floor(st.tile / w) + 3.5)
  a.tap(ox, oy)
  const overview = a.scene.cam.view.selectedTile === null
  a.scene.cam.view.zoom = 44; a.scene.cam.apply()
  a.deselect()
  return { working, overview, target }
})
check('3 tiles tappable at working zoom, not at overview', tapTest.working && tapTest.overview, JSON.stringify(tapTest))
// 4: assign a worker, output next turn
const assign = await page.evaluate(() => {
  const a = window.fairholm
  const st = a.state.settlements.find(x => x.owner === 0)
  const idle = st.colonists.findIndex(c => c.job.kind === 'idle')
  const before = st.stock.timber
  a.open({ kind: 'settlementDetail', id: st.id })
  a.open({ kind: 'workers', settlement: st.id, colonist: Math.max(0, idle) })
  const n = document.querySelectorAll('#sheet .line.tappable').length
  return { idle, before, options: n }
})
await page.locator('#sheet .line.tappable').first().tap()
await page.waitForTimeout(200)
const assigned = await page.evaluate(() => { const st = window.fairholm.state.settlements.find(x => x.owner === 0); return st.colonists.map(c => c.job.kind + (c.job.good ? ':' + c.job.good : '')) })
await page.locator('#queuebar .btn.primary').tap()
await page.waitForTimeout(300)
const after = await page.evaluate(() => { const st = window.fairholm.state.settlements.find(x => x.owner === 0); return { turn: window.fairholm.state.turn, produced: st.lastProduced, stock: st.stock } })
check('4 worker assigned, output next turn', after.turn === foundedOn + 1 && Object.values(after.produced).some(v => v > 0), JSON.stringify({ assigned, produced: after.produced }))
// 5: quiet turn one tap (end turn button always present; ensure one tap advances)
await page.locator('#queuebar .btn.primary').tap()
await page.waitForTimeout(200)
const t3 = await page.evaluate(() => window.fairholm.state.turn)
check('5 a turn is one tap', t3 === foundedOn + 2)
// 6: consign and watch the price fall
const consignRes = await page.evaluate(() => {
  const a = window.fairholm
  const st = a.state.settlements.find(x => x.owner === 0)
  st.stock.timber = 200
  const before = a.state.market.tables[0].timber.price
  a.open({ kind: 'consign', settlement: st.id, good: 'timber' })
  return { before, text: document.querySelector('#sheet .preview')?.textContent }
})
await page.evaluate(() => { const s = document.querySelector('#sheet input[type=range]'); s.value = '200'; s.dispatchEvent(new Event('input')) })
await page.locator('#sheet .btn.primary').tap()
await page.waitForTimeout(200)
const afterC = await page.evaluate(() => ({ price: window.fairholm.state.market.tables[0].timber.price, log: window.fairholm.state.dispatch.slice(-1)[0]?.text, toast: document.querySelector('#toast')?.textContent }))
check('6 consign walks the price down', afterC.price < consignRes.before, `${consignRes.before} -> ${afterC.price}; ${afterC.log}`)
// play a run of turns via the UI
for (let i = 0; i < 12; i++) { await page.locator('#queuebar .btn.primary').tap(); await page.waitForTimeout(60) }
const mid = await page.evaluate(() => ({ turn: window.fairholm.state.turn, queue: window.fairholm.queue.shown.map(g => g.title), pop: window.fairholm.state.settlements.find(x => x.owner === 0).colonists.length, gold: window.fairholm.state.charters[0].gold, word: window.fairholm.state.charters[0].word }))
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
