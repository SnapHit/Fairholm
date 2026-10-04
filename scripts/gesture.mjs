// The movement gesture, looked at (DECISIONS.md 163): press and hold the destination to see the
// route, slide to re-aim, let go to move; one gesture for every unit and every kind of movement.
// Real touch sequences through the devtools protocol, press, move and release with real timing, on
// a fixed seed at 390 points wide. A picture mid-gesture and one after the release for each case,
// and the eight answers at the end.
//
// Run with:  CHROMIUM=/opt/pw-browsers/chromium node scripts/gesture.mjs
//            OUT=shots/gesture SEED=fairholm-gesture VERBOSE=1 node scripts/gesture.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/gesture'
const SEED = process.env.SEED || 'fairholm-gesture'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/\.(png|jpg)$/.test(f)) unlinkSync(`${OUT}/${f}`)

const server = await createServer({ server: { port: 5194, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
// count the vibrations: the device here has none, so the call is counted in its place
await page.addInitScript(() => { window.__vibrations = []; Object.defineProperty(navigator, 'vibrate', { value: (ms) => { window.__vibrations.push({ ms, t: performance.now() }); return true }, configurable: true }) })
const problems = []
page.on('pageerror', e => problems.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')))
page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()) })
const notes = []
const note = (k, v) => { const l = `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`; notes.push(l); if (process.env.VERBOSE) console.log(l) }
const cdp = await ctx.newCDPSession(page)

await page.goto('http://localhost:5194/')
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.evaluate(async (seed) => {
  const a = window.fairholm
  const actions = await import('/src/sim/actions.ts')
  a.state = actions.createGame(seed, { size: 'small', shape: 'continent', firstGame: false }, 1)
  a.undoStack = []
  a.scene.cam.view.selectedTile = null
  a.scene.cam.view.activeUnit = null
  a.scene.rebuild(a.state, 'full')
  a.beginArrival()
  a.opening?.dismiss()
}, SEED)
await page.evaluate(() => {
  // every entry into the gesture, for the notes: what was called, when, and with what route
  const a = window.fairholm
  window.__log = []
  for (const k of ['pointerdown', 'pointermove', 'pointerup']) a.canvas.addEventListener(k, e => window.__log.push(`${k.slice(7)}@${Math.round(performance.now())}`), true)
  for (const k of ['hold', 'aimMove', 'release', 'cancelAim', 'commitRoute']) {
    const real = a[k].bind(a)
    a[k] = (...args) => { const out = real(...args); window.__log.push(`${k}@${Math.round(performance.now())}${a.route ? ` route:${a.route.ok ? a.route.kind + '>' + a.route.end : 'no:' + a.route.problem}` : ''}${a.aim ? ' aiming' : ''}`); return out }
  }
})
const log = () => page.evaluate(() => { const l = window.__log.slice(); window.__log = []; return l.join(' | ') })
const HOLD_MS = await page.evaluate(async () => (await import('/src/ui/theme.ts')).HOLD_MS)
const DWELL_MS = await page.evaluate(async () => (await import('/src/sim/constants.ts')).C.feel.attackDwellMs)

// ---- real touches ---------------------------------------------------------------------------------
const pts = (points) => points.map((p, i) => ({ x: p[0], y: p[1], id: i + 1, radiusX: 4, radiusY: 4, force: 1 }))
const touch = {
  async start(points) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(points) }) },
  async move(points) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(points) }) },
  async end() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) },
  async cancel() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }) },
}
/** Wait until the hold has engaged and the route is aimed, or give up after a while. */
const aimed = () => page.waitForFunction(() => !!window.fairholm.aim, null, { timeout: 4000 }).then(() => true).catch(() => false)
const settle = async (ms = 400) => { await page.waitForFunction(() => !window.fairholm.scene.moving && !window.fairholm.scene.cam.glideTarget, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms) }
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 88 })
const screenOf = (tile) => page.evaluate((t) => { const a = window.fairholm, w = a.state.world.width; return a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5) }, tile)
const tap = async (x, y) => { await touch.start([[x, y]]); await page.waitForTimeout(70); await touch.end(); await page.waitForTimeout(350); await settle(100) }
/** Press, wait for the hold to engage, and leave the finger down. */
const press = async (x, y) => { await touch.start([[x, y]]); await page.waitForTimeout(HOLD_MS + 60); await aimed(); await page.waitForTimeout(150) }
/** Slide the finger in steps, with real timing. */
const slide = async (from, to, steps = 8, ms = 40) => { for (let i = 1; i <= steps; i++) { await touch.move([[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]]); await page.waitForTimeout(ms) } }
const release = async () => { await touch.end(); await page.waitForTimeout(300); await settle(300) }
const state = () => page.evaluate(() => {
  const a = window.fairholm
  const u = a.scene.cam.view.activeUnit !== null ? a.state.units.find(x => x.id === a.scene.cam.view.activeUnit) : null
  return {
    active: a.scene.cam.view.activeUnit, tile: u ? u.tile : null, moves: u ? u.moves : null, order: u?.order?.kind ?? null,
    route: a.route ? { ok: a.route.ok, end: a.route.end, kind: a.route.kind, odds: a.route.odds, arrives: a.route.arrives, turns: a.route.turnEnds?.length ?? 0, startsNextTurn: !!a.route.startsNextTurn, problem: a.route.problem, shore: a.route.shore } : null,
    card: { title: document.querySelector('#queuebar .uc-title .t')?.textContent ?? null, tag: document.querySelector('#queuebar .uc-title .tag')?.textContent ?? null, line: document.querySelector('#queuebar .uc-line')?.textContent ?? null, actions: [...document.querySelectorAll('#queuebar .btn')].map(b => b.textContent) },
    routeDrawn: (() => { const svg = document.getElementById('route'); return !!svg && svg.style.display !== 'none' })(),
    cam: { cx: a.scene.cam.view.cx, cz: a.scene.cam.view.cz, zoom: a.scene.cam.view.zoom },
    vibrations: window.__vibrations.length, found: a.foundTarget, settlements: a.state.settlements.filter(s => s.owner === 0).length, turn: a.state.turn,
    moving: a.scene.moving,
  }
})
const unitTile = (id) => page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id)?.tile ?? null, id)
const pictureMid = async (id) => page.evaluate((id) => {
  const a = window.fairholm, sc = a.scene, z = sc.cam.view.zoom
  const p = sc.unitPictures.get(id), at = sc.unitPositions.get(id)
  if (!p || !at) return null
  const [sx, sy] = sc.cam.worldToScreen(at[0], at[1])
  return [sx + (p.box[0] + p.box[2]) / 2 * z, sy + (p.box[1] + p.box[3]) / 2 * z]
}, id)
// the camera's spring back from the map's edge is a few frames on a phone and seconds under the
// software renderer here, so the rig settles it at once rather than let the map creep under a finger
const look = async (tile, zoom) => { await page.evaluate(({ tile, zoom }) => { const sc = window.fairholm.scene; sc.cam.stop(); sc.cam.glideTarget = null; sc.cam.centreOn(tile, zoom); for (let i = 0; i < 400 && sc.cam.tick(); i++) { /* the spring */ } sc.requestDraw() }, { tile, zoom }); await settle(500) }
/** Stand a unit somewhere with its moves back and no standing order, as a fresh turn would leave it. */
const place = async (id, tile, moves) => { await page.evaluate(async ({ id, tile, moves }) => { const a = window.fairholm; const units = await import('/src/sim/units.ts'); const u = a.state.units.find(x => x.id === id); if (tile !== null) u.tile = tile; u.moves = moves ?? units.maxMoves(u); u.order = null; u.path = []; a.scene.rebuild(a.state, 'full'); a.refresh() }, { id, tile, moves: moves ?? null }); await settle(300) }
/** Every unit of the player's with its moves back, without ending the turn. */
const freshMoves = async () => { await page.evaluate(async () => { const a = window.fairholm; const units = await import('/src/sim/units.ts'); for (const u of a.state.units) if (u.owner === 0) u.moves = units.maxMoves(u); a.refresh() }); await settle(200) }
const choose = async (id) => { await page.evaluate((id) => window.fairholm.select(id), id); await settle(300) }
const answers = {}

// ---- the lander beside the shore, by the machine's own opening ----------------------------------
await page.evaluate(async () => {
  const a = window.fairholm
  const auto = await import('/src/sim/autopilot.ts')
  for (let turn = 0; turn < 30; turn++) {
    let guard = 0
    for (;;) {
      const act = auto.openingAction(a.state)
      if (!act || act.t === 'found' || guard++ > 4) break
      if (act.t === 'moveUnit') { if (!(await a.moveTo(act.unit, act.path[act.path.length - 1]))) break; continue }
      break
    }
    if (auto.openingAction(a.state)?.t === 'found') return
    a.endTurn()
    await new Promise(r => setTimeout(r, 50))
  }
})
await settle(600)
// a fresh turn so the lander has its moves
await page.evaluate(() => window.fairholm.endTurn()); await settle(800)
const landerId = await page.evaluate(() => window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'lander').id)
const geo = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const u = s.units.find(x => x.id === id)
  const land = wg.neighbours8(w, h, u.tile).filter(n => s.world.tiles[n].terrain !== 'water' && s.world.tiles[n].terrain !== 'mountain' && s.world.tiles[n].explored)
  return { tile: u.tile, aboard: u.aboard.length, shore: land[0] ?? null, moves: u.moves }
}, landerId)
await look(geo.tile, 44)
await choose(landerId)
note('setup', { ...geo, hold: HOLD_MS, dwell: DWELL_MS })

// ---- 1: a passenger goes ashore: tap the aboard count, hold the shore, let go ------------------
let before = await page.evaluate(() => window.__vibrations.length)
await page.locator('#queuebar .tag.act').tap().catch(() => {})
await page.waitForTimeout(300)
const chosenPassenger = await state()
let sp = await screenOf(geo.shore)
await press(sp[0], sp[1])
const ashoreMid = await state()
await shot('10-passenger-ashore-held')
await release()
const walker = await page.evaluate((shore) => window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'colonist' && u.tile === shore)?.id ?? null, geo.shore)
const ashoreAfter = await state()
await shot('10-passenger-ashore-released')
const aboardAfter = await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id).aboard.length, landerId)
note('passenger ashore', { chosen: chosenPassenger.card, mid: { route: ashoreMid.route, line: ashoreMid.card.line, drawn: ashoreMid.routeDrawn }, walker, aboardBefore: geo.aboard, aboardAfter, vibrated: (await page.evaluate(() => window.__vibrations.length)) - before })
answers['going ashore moves on release'] = walker !== null && aboardAfter === geo.aboard - 1
const vib1 = (await page.evaluate(() => window.__vibrations.length)) - before

// ---- 2: the colonist goes back aboard: hold the lander, let go ----------------------------------
let boarded = false
if (walker !== null) {
  await choose(walker)
  const lm = await pictureMid(landerId)
  await press(lm[0], lm[1])
  const boardMid = await state()
  await shot('09-boarding-held')
  await release()
  const gone = await page.evaluate((id) => !window.fairholm.state.units.some(u => u.id === id), walker)
  const aboardNow = await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id).aboard.length, landerId)
  await shot('09-boarding-released')
  boarded = gone && aboardNow === geo.aboard
  note('boarding', { mid: { route: boardMid.route, line: boardMid.card.line }, gone, aboardNow, boarded })
}
answers['boarding moves on release'] = boarded

// ---- 3: the founding preview: hold the shore with the lander chosen, let go, nothing moves ------
await choose(landerId)
const beforeFound = await state()
sp = await screenOf(geo.shore)
await press(sp[0], sp[1])
const foundMid = await state()
await shot('11-founding-preview-held')
await release()
const foundAfter = await state()
await shot('11-founding-preview-released')
note('founding preview', { mid: { route: foundMid.route, line: foundMid.card.line, foundTarget: foundMid.found }, after: { tile: foundAfter.tile, settlements: foundAfter.settlements, actions: foundAfter.card.actions, line: foundAfter.card.line, foundTarget: foundAfter.found } })
answers['a release never founds'] = foundAfter.settlements === beforeFound.settlements && foundAfter.tile === beforeFound.tile
answers['the card offers Found here after a release on the shore'] = foundAfter.card.actions.some(x => x === 'Found here') && foundAfter.found === geo.shore

// ---- 4: a one-turn move, and a quick drag still pans --------------------------------------------
await tap(30, 100).catch(() => {})   // put the shore's words away
await choose(landerId)
const sea = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const u = s.units.find(x => x.id === id)
  const units = await import('/src/sim/units.ts')
  // water tiles at sailing distance two, three and six, in view or not
  const out = {}
  for (let i = 0; i < s.world.tiles.length; i++) {
    if (s.world.tiles[i].terrain !== 'water') continue
    const d = Math.max(Math.abs(i % w - u.tile % w), Math.abs(Math.floor(i / w) - Math.floor(u.tile / w)))
    if (![2, 3, 6].includes(d)) continue
    const p = units.findPath(s, u, u.tile, i)
    if (!p || p.length !== d) continue
    const [sx, sy] = a.scene.cam.worldToScreen((i % w) + 0.5, Math.floor(i / w) + 0.5)
    if (!out[d] && sy > 120 && sy < 650) out[d] = { tile: i, sx, sy }
  }
  return out
}, landerId)
note('sea tiles', sea)
// a quick drag before the hold engages pans
await page.waitForTimeout(2500); await log()   // the settled frame drawn, nothing else in flight
const camBefore = (await state()).cam
// the finger lands and moves at once, as a flick does
await touch.start([[195, 400]])
await slide([195, 400], [120, 330], 6, 0)
await touch.end()
await page.waitForTimeout(400); await settle(300)
const dragged = await state()
answers['a quick drag still pans'] = Math.abs(dragged.cam.cx - camBefore.cx) > 0.5 || Math.abs(dragged.cam.cz - camBefore.cz) > 0.5
note('a quick drag', { before: camBefore, after: dragged.cam, route: dragged.route, panned: answers['a quick drag still pans'], log: await log() })
await look(geo.tile, 44)
await choose(landerId)
let one = null
{
  const s2 = await page.evaluate(async (id) => {
    const a = window.fairholm, s = a.state, w = s.world.width
    const u = s.units.find(x => x.id === id)
    const units = await import('/src/sim/units.ts')
    for (let i = 0; i < s.world.tiles.length; i++) {
      if (s.world.tiles[i].terrain !== 'water') continue
      const d = Math.max(Math.abs(i % w - u.tile % w), Math.abs(Math.floor(i / w) - Math.floor(u.tile / w)))
      if (d !== 3) continue
      const p = units.findPath(s, u, u.tile, i)
      if (!p || p.length !== 3) continue
      const [sx, sy] = a.scene.cam.worldToScreen((i % w) + 0.5, Math.floor(i / w) + 0.5)
      if (sx > 40 && sx < 350 && sy > 120 && sy < 650) return { tile: i, sx, sy }
    }
    return null
  }, landerId)
  one = s2
}
const vBefore = await page.evaluate(() => window.__vibrations.length)
const from = await unitTile(landerId)
await press(one.sx, one.sy)
const oneMid = await state()
await shot('01-one-turn-move-held')
await release()
await settle(600)
const oneAfter = await state()
await shot('01-one-turn-move-released')
const vAfter = await page.evaluate(() => window.__vibrations.length)
note('one-turn move', { from, to: one.tile, mid: { route: oneMid.route, line: oneMid.card.line, drawn: oneMid.routeDrawn, tileStill: oneMid.tile === from, actions: oneMid.card.actions }, after: { tile: oneAfter.tile, routeGone: !oneAfter.routeDrawn }, vibrations: vAfter - vBefore })
answers['holding shows the route without moving'] = oneMid.route?.ok && oneMid.routeDrawn && oneMid.tile === from
answers['release moves'] = oneAfter.tile === one.tile
answers['the vibration fires once at the hold'] = vAfter - vBefore === 1 && vib1 === 1

// ---- 5: re-aim by sliding ----------------------------------------------------------------------
await page.evaluate(() => window.fairholm.endTurn()); await settle(800)
await look(await unitTile(landerId), 44)
await choose(landerId)
const pair = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const u = s.units.find(x => x.id === id)
  const units = await import('/src/sim/units.ts')
  const found = []
  for (let i = 0; i < s.world.tiles.length && found.length < 2; i++) {
    if (s.world.tiles[i].terrain !== 'water') continue
    const d = Math.max(Math.abs(i % w - u.tile % w), Math.abs(Math.floor(i / w) - Math.floor(u.tile / w)))
    if (d !== 2) continue
    const p = units.findPath(s, u, u.tile, i)
    if (!p || p.length !== 2) continue
    const [sx, sy] = a.scene.cam.worldToScreen((i % w) + 0.5, Math.floor(i / w) + 0.5)
    if (sx > 40 && sx < 350 && sy > 120 && sy < 650 && !found.some(f => Math.hypot(f.sx - sx, f.sy - sy) < 60)) found.push({ tile: i, sx, sy })
  }
  return found
}, landerId)
const start2 = await unitTile(landerId)
await press(pair[0].sx, pair[0].sy)
const first = await state()
await slide([pair[0].sx, pair[0].sy], [pair[1].sx, pair[1].sy], 10, 40)
await page.waitForTimeout(150)
const second = await state()
await shot('02-re-aim-by-sliding-held')
await release()
await settle(600)
const reaimed = await state()
await shot('02-re-aim-by-sliding-released')
note('re-aim', { first: first.route?.end, second: second.route?.end, targets: [pair[0].tile, pair[1].tile], after: reaimed.tile, camStill: Math.abs(second.cam.cx - first.cam.cx) < 0.01 && Math.abs(second.cam.cz - first.cam.cz) < 0.01 })
answers['sliding re-aims live'] = first.route?.end === pair[0].tile && second.route?.end === pair[1].tile && reaimed.tile === pair[1].tile && start2 !== reaimed.tile
answers['sliding never pans'] = Math.abs(second.cam.cx - first.cam.cx) < 0.01 && Math.abs(second.cam.cz - first.cam.cz) < 0.01

// ---- 6: an edge scroll to a tile six away --------------------------------------------------------
await page.evaluate(() => window.fairholm.endTurn()); await settle(800)
const start6 = await unitTile(landerId)
// the longest straight run of water from the lander, in one of the four directions; the camera is
// set so that the lander sits near the opposite edge and the sixth tile is off the screen
const six = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const u = s.units.find(x => x.id === id)
  const units = await import('/src/sim/units.ts')
  let best = null
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const run = []
    let x = u.tile % w, z = Math.floor(u.tile / w)
    for (;;) { x += dx; z += dz; if (x < 0 || z < 0 || x >= w || z >= h || s.world.tiles[z * w + x].terrain !== 'water') break; run.push(z * w + x) }
    if (run.length >= 6) { const p = units.findPath(s, u, u.tile, run[5]); if (p && p.length === 6 && (!best || run.length > best.run)) best = { dx, dz, tile: run[5], run: run.length } }
  }
  if (!best) return null
  const zoom = 64
  const f = { top: a.hud.getBoundingClientRect().height, bottom: a.root.clientHeight - a.queuebar.offsetHeight, left: 0, right: a.root.clientWidth }
  const W = a.root.clientWidth, H = a.root.clientHeight
  // where the lander should sit on the screen: 36 points in from the edge the run leads away from
  const lx = best.dx > 0 ? f.left + 36 : best.dx < 0 ? f.right - 36 : W / 2
  const ly = best.dz > 0 ? f.top + 36 : best.dz < 0 ? f.bottom - 36 : (f.top + f.bottom) / 2
  a.scene.cam.view.zoom = zoom
  a.scene.cam.view.cx = (u.tile % w) + 0.5 + (W / 2 - lx) / zoom
  a.scene.cam.view.cz = Math.floor(u.tile / w) + 0.5 + (H / 2 - ly) / zoom
  a.scene.cam.stop(); a.scene.cam.glideTarget = null; a.scene.cam.softClamp(0); for (let i = 0; i < 400 && a.scene.cam.tick(); i++) { /* the spring */ } a.scene.cam.apply(); a.scene.requestDraw()
  const [sx, sy] = a.scene.cam.worldToScreen((best.tile % w) + 0.5, Math.floor(best.tile / w) + 0.5)
  // the finger holds 22 points inside the edge the run leads toward
  const fx = best.dx > 0 ? f.right - 22 : best.dx < 0 ? f.left + 22 : sx
  const fy = best.dz > 0 ? f.bottom - 22 : best.dz < 0 ? f.top + 22 : sy
  return { ...best, sx, sy, fx, fy, offScreen: sx < f.left || sx > f.right || sy < f.top || sy > f.bottom }
}, landerId)
await settle(500)
await choose(landerId)
let sixResult = { skipped: !six }
if (six) {
  await touch.start([[six.fx, six.fy]])
  await page.waitForTimeout(HOLD_MS + 60); await aimed()
  // the map scrolls under the finger until the tile six out is under it
  let under = null
  for (let k = 0; k < 160; k++) {
    under = await page.evaluate(() => window.fairholm.route?.end ?? null)
    if (under === six.tile) break
    if (k === 25) await shot('03-edge-scroll-held')
    await page.waitForTimeout(50)
  }
  const mid = await state()
  if (under !== six.tile) await shot('03-edge-scroll-held')
  await release()
  await settle(900)
  const after = await state()
  await shot('03-edge-scroll-released')
  sixResult = { target: six.tile, wasOffScreen: six.offScreen, aimedAt: under, mid: { route: mid.route, line: mid.card.line }, from: start6, to: after.tile, sailed: await page.evaluate(({ a, b }) => { const w = window.fairholm.state.world.width; return Math.max(Math.abs(a % w - b % w), Math.abs(Math.floor(a / w) - Math.floor(b / w))) }, { a: start6, b: after.tile }) }
}
note('edge scroll', sixResult)
answers['the lander reaches a tile six away in one gesture'] = !sixResult.skipped && sixResult.to === sixResult.target && sixResult.sailed >= 5

// ---- ashore: found, then a colonist, a militia and an enemy -------------------------------------
await page.evaluate(() => window.fairholm.endTurn()); await settle(600)
const founded = await page.evaluate(() => window.fairholm.autoplayOpening(12))
await settle(800)
await page.evaluate(() => window.fairholm.closeSheet())
const cast = await page.evaluate(async () => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const units = await import('/src/sim/units.ts')
  const labour = await import('/src/sim/labour.ts')
  const wg = await import('/src/sim/worldgen.ts')
  const home = s.settlements.find(x => x.owner === 0)
  const ok = i => i >= 0 && i < s.world.tiles.length && wg.isLand(s.world.tiles[i]) && s.world.tiles[i].terrain !== 'mountain' && !s.settlements.some(x => x.tile === i)
  // a colonist two tiles from home with open ground four more tiles beyond it
  let col = -1, far = -1
  for (let i = 0; i < s.world.tiles.length && col < 0; i++) {
    if (!ok(i) || wg.dist(w, i, home.tile) !== 2) continue
    const dx = Math.sign((i % w) - (home.tile % w)) || 1
    const j = i + dx * 3
    if (Math.floor(j / w) !== Math.floor(i / w) || !ok(j)) continue
    const probe = units.makeUnit(s, 0, 'colonist', i, labour.makeColonist(s, 'free'))
    const p = units.findPath(s, probe, i, j)
    if (p && p.length >= 3) { col = i; far = j }
  }
  const colonist = units.makeUnit(s, 0, 'colonist', col, labour.makeColonist(s, 'free'))
  s.units.push(colonist)
  // a militia with a Company regular two tiles from it and open ground beyond
  let mil = -1, foe = -1, beyond = -1
  for (let i = 0; i < s.world.tiles.length && mil < 0; i++) {
    if (!ok(i) || wg.dist(w, i, home.tile) < 3 || wg.dist(w, i, home.tile) > 5 || i === col) continue
    const dx = Math.sign((i % w) - (home.tile % w)) || 1
    const f = i + dx * 2, b = i + dx * 3
    if (Math.floor(f / w) !== Math.floor(i / w) || !ok(f) || !ok(b)) continue
    mil = i; foe = f; beyond = b
  }
  const militia = units.makeUnit(s, 0, 'militia', mil, labour.makeColonist(s, 'free'))
  militia.quality = 'hardened'
  const regular = units.makeUnit(s, -1, 'regulars', foe, null)
  s.units.push(militia, regular)
  // the war is over as far as the Company is concerned, so its regular stands where it is put and
  // the militia keeps its arms from one case to the next
  s.declaration = { declared: true, turnDeclared: s.turn, waves: [], interventionProgress: 0, nextWaveId: 1, won: true, lost: false, intervened: null }
  for (const t of [col, far, mil, foe, beyond]) for (const n of [t, ...wg.neighbours8(w, h, t)]) s.world.tiles[n].explored = true
  a.scene.rebuild(s, 'full')
  a.refresh()
  return { home: home.tile, colonist: colonist.id, col, far, militia: militia.id, mil, foe, beyond, regular: regular.id }
})
note('cast', { founded, ...cast })

// ---- 7: a multi-turn route --------------------------------------------------------------------
await look(cast.col, 44)
await choose(cast.colonist)
let fp = await screenOf(cast.far)
await press(fp[0], fp[1])
const multiMid = await state()
await shot('04-multi-turn-route-held')
await release()
await settle(600)
const multiAfter = await state()
await shot('04-multi-turn-route-released')
note('multi-turn route', { mid: { route: multiMid.route, line: multiMid.card.line }, after: { tile: multiAfter.tile, order: multiAfter.order, startTile: cast.col } })
answers['a multi-turn route moves on release and keeps going'] = multiMid.route?.ok && (multiMid.route.turns >= 2 || multiMid.route.arrives >= 2) && multiAfter.tile !== cast.col && multiAfter.order === 'goto'

// ---- 8: cancel by releasing on the unit --------------------------------------------------------
await place(cast.colonist, null)
const colAt = await unitTile(cast.colonist)
await look(colAt, 44)
await choose(cast.colonist)
const away = await page.evaluate(async ({ id }) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const u = s.units.find(x => x.id === id)
  const t = wg.neighbours8(w, h, u.tile).find(n => wg.isLand(s.world.tiles[n]) && s.world.tiles[n].terrain !== 'mountain')
  const [sx, sy] = a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5)
  return { tile: t, sx, sy }
}, { id: cast.colonist })
const own = await screenOf(colAt)
await press(away.sx, away.sy)
const cancelMid = await state()
await shot('05-cancel-on-the-unit-held')
await slide([away.sx, away.sy], [own[0], own[1]], 6, 40)
await page.waitForTimeout(100)
await release()
const cancelAfter = await state()
await shot('05-cancel-on-the-unit-released')
note('cancel on the unit', { mid: { route: cancelMid.route }, after: { tile: cancelAfter.tile, route: cancelAfter.route, line: cancelAfter.card.line, order: cancelAfter.order } })
answers['release on the unit cancels'] = cancelMid.route?.ok && cancelAfter.tile === colAt && !cancelAfter.order

// ---- 9: cancel by a second finger ----------------------------------------------------------------
await press(away.sx, away.sy)
const twoMid = await state()
await touch.start([[away.sx, away.sy], [away.sx + 90, away.sy + 60]])
await page.waitForTimeout(150)
await shot('06-cancel-by-a-second-finger-held')
await touch.end()
await page.waitForTimeout(400); await settle(200)
const twoAfter = await state()
await shot('06-cancel-by-a-second-finger-released')
note('cancel by a second finger', { mid: { route: twoMid.route }, after: { tile: twoAfter.tile, route: twoAfter.route, order: twoAfter.order } })
answers['a second finger cancels'] = twoMid.route?.ok && twoAfter.tile === colAt && !twoAfter.order && !twoAfter.routeDrawn

// ---- 10: cancel over the interface, and on a tile that cannot be reached ------------------------
await press(away.sx, away.sy)
await slide([away.sx, away.sy], [195, 820], 8, 30)
await page.waitForTimeout(100)
await release()
const overUi = await state()
const nearestNoRoute = await page.evaluate(async ({ id }) => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const u = s.units.find(x => x.id === id)
  const route = await import('/src/sim/route.ts')
  const wg = await import('/src/sim/worldgen.ts')
  let best = null
  for (let i = 0; i < s.world.tiles.length; i++) {
    if (i === u.tile || !s.world.tiles[i].explored || route.planRoute(s, u, i).ok) continue
    const d = wg.dist(w, i, u.tile)
    if (!best || d < best.d) best = { tile: i, d, terrain: s.world.tiles[i].terrain }
  }
  return best
}, { id: cast.colonist })
let water = null
if (nearestNoRoute) {
  await look(nearestNoRoute.tile, 44)
  const p = await screenOf(nearestNoRoute.tile)
  water = { ...nearestNoRoute, sx: p[0], sy: p[1] }
}
let unreachable = { skipped: !water }
if (water) {
  await press(water.sx, water.sy)
  const mid = await state()
  await release()
  const after = await state()
  unreachable = { target: water, mid: mid.route, after: { tile: after.tile, line: after.card.line, route: after.route } }
}
note('cancel over the interface', { tile: overUi.tile, route: overUi.route, order: overUi.order })
note('cancel on an unreachable tile', unreachable)
answers['release over the interface cancels'] = overUi.tile === colAt && !overUi.order
answers['release on an unreachable tile cancels and the card says why'] = !unreachable.skipped && unreachable.after.tile === colAt && unreachable.after.route && !unreachable.after.route.ok && !!unreachable.after.line

// ---- 11: sliding across an enemy does not attack; holding on it does -----------------------------
await freshMoves()
await look(cast.mil, 44)
await choose(cast.militia)
const foeP = await screenOf(cast.foe), beyondP = await screenOf(cast.beyond)
const foeBefore = await page.evaluate((id) => { const u = window.fairholm.state.units.find(x => x.id === id); return u ? u.kind : 'gone' }, cast.regular)
// across: the finger passes over the enemy and on to the ground beyond, well inside the dwell
await touch.start([[foeP[0], foeP[1]]])
await page.waitForTimeout(HOLD_MS + 60); await aimed()
const onFoe = await state()
await shot('07-slide-across-an-enemy-held')
await slide([foeP[0], foeP[1]], [beyondP[0], beyondP[1]], 4, 25)
await page.waitForTimeout(60)
const past = await state()
await release()
await settle(600)
const acrossAfter = await state()
const foeAcross = await page.evaluate((id) => { const u = window.fairholm.state.units.find(x => x.id === id); return u ? u.kind : 'gone' }, cast.regular)
const warLines = () => page.evaluate(() => window.fairholm.state.dispatch.filter(d => d.kind === 'war').length)
const wars0 = await warLines()
await shot('07-slide-across-an-enemy-released')
note('slide across an enemy', { onFoe: onFoe.route, past: past.route, after: { tile: acrossAfter.tile, order: acrossAfter.order, line: acrossAfter.card.line }, foeBefore, foeAcross, warLines: wars0, log: await log() })
// let go on the enemy too soon: cancelled, and the card says to hold longer
await place(cast.militia, cast.mil)
const milAt = await unitTile(cast.militia)
await look(milAt, 44)
await choose(cast.militia)
const foeP2 = await screenOf(await unitTile(cast.regular))
const near = await page.evaluate(async ({ id, foe }) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const u = s.units.find(x => x.id === id)
  const t = wg.neighbours8(w, h, u.tile).find(n => wg.isLand(s.world.tiles[n]) && s.world.tiles[n].terrain !== 'mountain' && n !== foe)
  const [sx, sy] = a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5)
  return { tile: t, sx, sy }
}, { id: cast.militia, foe: await unitTile(cast.regular) })
let soon = null
for (let attempt = 1; attempt <= 4 && !soon?.withinDwell; attempt++) {
  if (attempt > 1) { await place(cast.militia, milAt); await look(milAt, 44); await choose(cast.militia) }
  await log()
  await touch.start([[near.sx, near.sy]])
  await page.waitForTimeout(HOLD_MS + 60); await aimed()
  await slide([near.sx, near.sy], [(near.sx + foeP2[0]) / 2, (near.sy + foeP2[1]) / 2], 2, 20)
  // onto the enemy and off again in one breath: a software renderer's frame takes longer than the
  // dwell, so the two go out together and are handled back to back
  await Promise.all([touch.move([[foeP2[0], foeP2[1]]]), touch.end()])
  await page.waitForTimeout(300); await settle(200)
  const after = await state()
  const entries = (await log()).split(' | ')
  const attackAt = entries.filter(e => /^aimMove@\d+ route:attack/.test(e)).map(e => +e.match(/@(\d+)/)[1])
  const upAt = entries.filter(e => /^up@/.test(e)).map(e => +e.match(/@(\d+)/)[1])
  const held = attackAt.length && upAt.length ? upAt[upAt.length - 1] - attackAt[0] : null
  soon = { attempt, held, withinDwell: held !== null && held < DWELL_MS, after: { tile: after.tile, line: after.card.line, route: after.route }, warLines: await warLines(), log: entries.join(' | ') }
}
const soonAfter = soon.after
const warsSoon = soon.warLines
note('let go on the enemy too soon', soon)
answers['an attack never happens by sliding across an enemy'] = foeAcross === foeBefore && wars0 === 0 && soon.withinDwell && warsSoon === 0 && soonAfter.tile === milAt && /longer/.test(soonAfter.line ?? '')
// a deliberate attack: hold on the enemy past the dwell, then let go. The militia stands beside
// the regular with its moves, so the release is the attack itself and not a walk toward one
const besideFoe = await page.evaluate(async ({ foe, mil }) => { const s = window.fairholm.state, w = s.world.width, h = s.world.height; const wg = await import('/src/sim/worldgen.ts'); return wg.neighbours8(w, h, foe).find(n => wg.isLand(s.world.tiles[n]) && s.world.tiles[n].terrain !== 'mountain' && !s.units.some(u => u.tile === n) && !s.settlements.some(x => x.tile === n)) ?? mil }, { foe: await unitTile(cast.regular), mil: cast.mil })
await place(cast.militia, besideFoe)
await look(await unitTile(cast.militia), 44)
await choose(cast.militia)
const foeP3 = await screenOf(await unitTile(cast.regular))
await touch.start([[foeP3[0], foeP3[1]]])
await page.waitForTimeout(HOLD_MS + 60); await aimed()
await page.waitForTimeout(DWELL_MS + 300)
const attackMid = await state()
await shot('08-deliberate-attack-held')
await touch.end()
await page.waitForTimeout(400); await settle(300)
const warsAfter = await warLines()
const foeAfter = await page.evaluate((id) => { const u = window.fairholm.state.units.find(x => x.id === id); return u ? u.kind : 'gone' }, cast.regular)
await shot('08-deliberate-attack-released')
note('a deliberate attack', { mid: attackMid.route, warLines: warsAfter, foeAfter, line: (await state()).card.line, log: await log() })
answers['a deliberate attack after the dwell fires'] = attackMid.route?.kind === 'attack' && warsAfter > warsSoon

console.log(notes.join('\n'))
console.log('\nANSWERS')
for (const [k, v] of Object.entries(answers)) console.log(`  ${v ? 'yes' : 'NO '}  ${k}`)
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
