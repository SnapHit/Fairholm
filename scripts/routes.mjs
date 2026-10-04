// Look at routes under the finger. Feel brief sections 1 and 4: press and hold a tile and the route
// there shows, moving nothing; slide and it re-aims; let go and the unit moves along it; let go over
// the interface, on the unit itself or on a tile that cannot be reached and nothing moves. On a fixed
// seed, with the player's own gestures throughout as real touches (taps, holds, slides and drags, and
// the wheel standing in for a pinch), it takes a picture of each kind of route and measures the
// answers to six questions:
//
//   does every hold show a route without moving anything;
//   does letting go commit, at one turn out and at six;
//   can the lander reach a tile six away, by panning or by holding at a wider zoom;
//   is it plain where each turn ends;
//   is an attack impossible to make by accident, and possible on purpose;
//   does letting go over the top strip, on the unit or on an unreachable tile move nothing.
//
// scripts/gesture.mjs looks at the gesture itself more closely: re-aiming, the edge scroll, each
// of the cancels, the attack dwell and the vibration.
//
// Run with:  node scripts/routes.mjs
//            OUT=shots/routes SEED=fairholm-opening CHROMIUM=/opt/pw-browsers/chromium node scripts/routes.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fingers } from './touch.mjs'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/routes'
const SEED = process.env.SEED || 'fairholm-opening'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/\.(png|jpg)$/.test(f)) unlinkSync(`${OUT}/${f}`)

const server = await createServer({ server: { port: 5194, strictPort: true }, logLevel: 'silent' })
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
const notes = []
const note = (k, v) => { const l = `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`; notes.push(l); if (process.env.VERBOSE) console.log(l) }
const answers = {}

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

const HOLD_MS = await page.evaluate(async () => (await import('/src/ui/theme.ts')).HOLD_MS)
const DWELL_MS = await page.evaluate(async () => (await import('/src/sim/constants.ts')).C.feel.attackDwellMs)
// the player's finger, as real touches through the devtools protocol (scripts/touch.mjs)
const finger = fingers(await ctx.newCDPSession(page), page, { holdMs: HOLD_MS })
const settle = async (ms = 500) => {
  await page.waitForFunction(() => !window.fairholm.scene.moving && !window.fairholm.scene.cam.glideTarget, null, { timeout: 20000 }).catch(() => {})
  // the camera's spring back from the map's edge is a few frames on a phone and seconds under the
  // software renderer here, so the rig settles it at once rather than let the map creep under a finger
  await page.evaluate(() => { const sc = window.fairholm.scene; if (window.fairholm.aim) return; sc.cam.stop(); sc.cam.glideTarget = null; let moved = false; for (let i = 0; i < 400 && sc.cam.tick(); i++) moved = true; if (moved) sc.requestDraw() })
  await page.waitForTimeout(ms)
}
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })
const screenOf = (tile) => page.evaluate((t) => { const a = window.fairholm, w = a.state.world.width; return a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5) }, tile)
const tapAt = async (x, y) => { await finger.tap(x, y) }
const unitTile = (id) => page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id)?.tile ?? null, id)
const route = () => page.evaluate(() => window.fairholm.route)
const sheetWords = () => page.evaluate(() => document.querySelector('#queuebar .uc-line')?.textContent?.replace(/\s+/g, ' ').slice(0, 260) ?? '')
const landerId = await page.evaluate(() => window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'lander').id)
const freeArea = () => page.evaluate(() => {
  const a = window.fairholm
  const top = a.hud.getBoundingClientRect().height
  const bottom = a.sheetEl.classList.contains('open') ? a.root.clientHeight - a.sheetEl.offsetHeight : a.root.clientHeight - a.queuebar.offsetHeight
  return { top, bottom, W: a.root.clientWidth }
})
const waitDrawn = async () => {
  await page.waitForFunction(() => window.__moveDone !== false, null, { timeout: 20000 }).catch(() => {})
  await settle(400)
}
const armMoveWait = () => page.evaluate(() => { window.__moveDone = false; const a = window.fairholm; const real = a.moveTo.bind(a); a.moveTo = (id, t) => real(id, t).then(r => { window.__moveDone = true; a.moveTo = real; return r }) })
const wars = () => page.evaluate(() => window.fairholm.state.dispatch.filter(d => d.kind === 'war').length)

/** Tap a unit of the player's until it is chosen and its card is up. */
const select = async (id) => {
  for (let k = 0; k < 3; k++) {
    if (await page.evaluate((id) => window.fairholm.scene.cam.view.activeUnit === id && document.getElementById('queuebar').classList.contains('carded'), id)) break
    // a tap on the middle of its picture, as a player taps a figure, or on its tile where it has none
    const p = await page.evaluate((id) => {
      const a = window.fairholm, sc = a.scene, z = sc.cam.view.zoom, w = a.state.world.width
      const pic = sc.drawnClose ? sc.unitPictures.get(id) : null, at = sc.unitPositions.get(id)
      if (pic && at) { const [sx, sy] = sc.cam.worldToScreen(at[0], at[1]); return [sx + (pic.box[0] + pic.box[2]) / 2 * z, sy + (pic.box[1] + pic.box[3]) / 2 * z] }
      const t = a.state.units.find(u => u.id === id).tile
      return sc.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5)
    }, id)
    await tapAt(p[0], p[1])
  }
  await settle(400)
}

/** Press and hold a tile, and keep the finger down: the route shown or the reason there is none, and
 *  whether anything moved. */
const pressTile = async (id, tile) => {
  const before = await unitTile(id)
  const p = await screenOf(tile)
  await finger.press(p[0], p[1])
  const r = await route()
  const after = await unitTile(id)
  return { tile, onScreen: p.map(Math.round), at: p, shown: !!r?.ok, reason: r && !r.ok ? r.words : null, turns: r?.ok ? r.turnEnds.length : null, moved: after !== before, words: await sheetWords() }
}
/** Let go where the finger is: the move, drawn to its end. */
const letGo = async () => { await armMoveWait(); await finger.release(); await waitDrawn() }
/** Slide up to the top strip and let go there: nothing moves. */
const letGoOverTheStrip = async (from) => {
  const f = await freeArea()
  await finger.slide(from, [from[0], f.top / 2], 6, 30)
  await page.waitForTimeout(100)
  await finger.release()
  await settle(300)
}

/** A tile some distance out along whichever heading has the most room, on the screen above the
 *  sheet, water or unseen: what a player aiming for open sea would hold. */
const farTile = (id, minK, maxK, wantUnseen) => page.evaluate(({ id, minK, maxK, wantUnseen }) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const u = s.units.find(x => x.id === id)
  const top = a.hud.getBoundingClientRect().height + 30
  const bottom = (a.sheetEl.classList.contains('open') ? a.root.clientHeight - a.sheetEl.offsetHeight : a.root.clientHeight - a.queuebar.offsetHeight) - 30
  let best = null
  for (const [dx, dz] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
    for (let k = maxK; k >= minK; k--) {
      const x = (u.tile % w) + dx * k, z = Math.floor(u.tile / w) + dz * k
      if (x < 0 || z < 0 || x >= w || z >= h) continue
      const t = s.world.tiles[z * w + x]
      if (t.explored && t.terrain !== 'water') continue
      if (wantUnseen && t.explored) continue
      const [sx, sy] = a.scene.cam.worldToScreen(x + 0.5, z + 0.5)
      if (sx < 30 || sx > a.root.clientWidth - 30 || sy < top || sy > bottom) continue
      if (!best || k > best.k) best = { tile: z * w + x, k }
      break
    }
  }
  return best
}, { id, minK, maxK, wantUnseen })

// ---- 1: a one-turn route, held and let go -------------------------------------------------------
await settle(800)
await select(landerId)
const one = await farTile(landerId, 2, 4, false)
const r1 = await pressTile(landerId, one.tile)
note('one-turn route, the hold', r1)
await shot('01-one-turn-route')
await letGo()
const afterOne = await unitTile(landerId)
note('one-turn route, let go', { arrivedAt: afterOne, end: one.tile, committed: afterOne === one.tile })

// ---- 2: a multi-turn route with its turn ends, held at a wider zoom ------------------------------
// the wheel stands in for a pinch: out to a zoom where ordinary taps no longer reach tiles
await page.evaluate(() => window.fairholm.endTurn())
await settle(600)
await select(landerId)
let p = await screenOf(await unitTile(landerId))
await page.mouse.move(p[0], p[1])
for (let k = 0; k < 12 && (await page.evaluate(() => window.fairholm.scene.cam.view.zoom)) > 19; k++) { await page.mouse.wheel(0, 90); await page.waitForTimeout(120) }
await settle(600)
const zoomWide = await page.evaluate(() => window.fairholm.scene.cam.view.zoom)
const tileBefore2 = await unitTile(landerId)
const multi = await farTile(landerId, 8, 13, false)
const r2 = multi ? await pressTile(landerId, multi.tile) : { error: 'no far tile on the screen' }
const markers = await page.evaluate(() => [...document.querySelectorAll('#route .turn text')].map(t => t.textContent))
note('multi-turn route at a wider zoom', { zoom: +zoomWide.toFixed(1), tapFloor: 44, ...r2, markers })
await shot('02-multi-turn-route')
// let go over the top strip: the route goes, nothing moves, and the lander stays chosen
if (multi) await letGoOverTheStrip(r2.at)
const cleared = await page.evaluate(() => ({ route: window.fairholm.route, active: window.fairholm.scene.cam.view.activeUnit, sheet: window.fairholm.sheet.kind }))
const tileAfter2 = await unitTile(landerId)
note('let go over the top strip', { cleared: cleared.route === null, stillChosen: cleared.active === landerId, stayed: tileAfter2 === tileBefore2, sheet: cleared.sheet })

// ---- 3: a route into the fog, six tiles out at the wider zoom, let go ----------------------------
const fogTile = await farTile(landerId, 6, 6, true) ?? await farTile(landerId, 4, 6, true)
const beforeFog = await unitTile(landerId)
const r3 = await pressTile(landerId, fogTile.tile)
const fogLegs = await page.evaluate(() => ({ guess: (document.querySelector('#route .leg.guess')?.getAttribute('d') ?? '').length > 0, known: (document.querySelector('#route .leg.known')?.getAttribute('d') ?? '').length > 0 }))
note('route into the fog, six out at the wider zoom', { tilesOut: fogTile.k, ...r3, fogLegs })
await shot('03-route-into-fog')
await letGo()
const afterFog = await unitTile(landerId)
note('let go into the fog', { from: beforeFog, to: afterFog, committed: afterFog !== beforeFog })

// ---- 4: a far destination at working zoom, chosen after panning ----------------------------------
await page.evaluate(() => window.fairholm.endTurn())
await settle(600)
await select(landerId)
p = await screenOf(await unitTile(landerId))
await page.mouse.move(p[0], p[1])
for (let k = 0; k < 12 && (await page.evaluate(() => window.fairholm.scene.cam.view.zoom)) < 44; k++) { await page.mouse.wheel(0, -90); await page.waitForTimeout(120) }
await settle(600)
await select(landerId)
const sixOut = await page.evaluate((id) => {
  // six tiles out on a heading of open water, as far as a turn's sailing goes
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const u = s.units.find(x => x.id === id)
  for (const [dx, dz] of [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]]) {
    let ok = true, x = u.tile % w, z = Math.floor(u.tile / w)
    // the rig looks at the true ground here, so the test is of reach and not of where the coast is
    for (let k = 1; k <= 6 && ok; k++) { x += dx; z += dz; if (x < 0 || z < 0 || x >= w || z >= h) ok = false; else if (s.world.tiles[z * w + x].terrain !== 'water') ok = false }
    if (ok) return z * w + x
  }
  return null
}, landerId)
const sp = await screenOf(sixOut)
const fa = await freeArea()
const offScreen = !(sp[0] > 30 && sp[0] < fa.W - 30 && sp[1] > fa.top + 30 && sp[1] < fa.bottom - 30)
// a drag pans the map; the lander stays chosen through it
for (let k = 0; k < 4; k++) {
  const q = await screenOf(sixOut)
  const f = await freeArea()
  const cx = f.W / 2, cy = (f.top + f.bottom) / 2
  if (q[0] > 30 && q[0] < f.W - 30 && q[1] > f.top + 30 && q[1] < f.bottom - 30) break
  const dx = Math.max(-150, Math.min(150, cx - q[0])), dy = Math.max(-150, Math.min(150, cy - q[1]))
  await finger.drag([cx, cy], [cx + dx, cy + dy], 12, 30)
  await settle(300)
}
const stillChosen = await page.evaluate((id) => window.fairholm.scene.cam.view.activeUnit === id, landerId)
const fromSix = await unitTile(landerId)
const r4 = await pressTile(landerId, sixOut)
note('a far destination after panning', { offScreenAtFirst: offScreen, stillChosenAfterPan: stillChosen, zoom: await page.evaluate(() => window.fairholm.scene.cam.view.zoom), ...r4 })
await shot('04-far-destination-after-panning')
await letGo()
const toSix = await unitTile(landerId)
const dist = await page.evaluate(({ a, b }) => { const w = window.fairholm.state.world.width; return Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w))) }, { a: fromSix, b: toSix })
note('six out, let go', { from: fromSix, to: toSix, tilesSailed: dist })

// ---- 5: an unreachable tile and why ---------------------------------------------------------------
await page.evaluate(() => window.fairholm.endTurn())
await settle(600)
await select(landerId)
const land = await page.evaluate((id) => {
  // known land the lander is not beside, on the screen
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const u = s.units.find(x => x.id === id)
  const top = a.hud.getBoundingClientRect().height + 30, bottom = a.root.clientHeight - a.queuebar.offsetHeight - 30
  let best = null
  for (let i = 0; i < s.world.tiles.length; i++) {
    const t = s.world.tiles[i]
    if (!t.explored || t.terrain === 'water' || t.river === 2) continue
    const d = Math.max(Math.abs((i % w) - (u.tile % w)), Math.abs(Math.floor(i / w) - Math.floor(u.tile / w)))
    if (d < 2) continue
    const [sx, sy] = a.scene.cam.worldToScreen((i % w) + 0.5, Math.floor(i / w) + 0.5)
    if (sx < 30 || sx > a.root.clientWidth - 30 || sy < top || sy > bottom) continue
    if (!best || d < best.d) best = { tile: i, d }
  }
  return best
}, landerId)
const beforeLand = await unitTile(landerId)
const r5 = land ? await pressTile(landerId, land.tile) : { error: 'no known land on the screen' }
note('unreachable: the lander holding land', r5)
await shot('05-unreachable-with-reason')
// let go there: nothing moves, and the card still says why
if (land) { await finger.release(); await settle(300) }
const afterLand = { tile: await unitTile(landerId), line: await sheetWords(), route: await route() }
note('let go on land', { stayed: afterLand.tile === beforeLand, saysWhy: afterLand.line, routeKept: !!afterLand.route && !afterLand.route.ok })
// the shore beside the lander, held and let go: no course, nothing moves, and Found here on the card
const shoreBeside = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const u = s.units.find(x => x.id === id)
  return wg.neighbours8(w, h, u.tile).find(n => s.world.tiles[n].terrain !== 'water' && s.world.tiles[n].explored) ?? null
}, landerId)
if (shoreBeside !== null) {
  const r5b = await pressTile(landerId, shoreBeside)
  await finger.release()
  await settle(300)
  const focus = await page.evaluate(() => ({ foundTarget: window.fairholm.foundTarget, control: [...document.querySelectorAll('#queuebar .btn')].some(b => b.textContent === 'Found here'), settlements: window.fairholm.state.settlements.filter(x => x.owner === 0).length }))
  note('the lander holding the shore beside it, let go', { ...r5b, ...focus, pointsAtFounding: focus.foundTarget === shoreBeside && focus.control, foundedNothing: focus.settlements === 0, stayed: (await unitTile(landerId)) === beforeLand })
  await shot('05b-shore-beside-points-at-founding')
}

// ---- 6: an attack and its odds, and how hard it is to make one by accident ----------------------
// found the first settlement, then a militia of the player's beside a Company unit two tiles from
// home. The two units are put down by the rig, as the war rig does, because a war takes many turns
// to reach
const founded = await page.evaluate(() => window.fairholm.autoplayOpening(10))
await settle(600)
await page.evaluate(() => window.fairholm.closeSheet())
const setup = await page.evaluate(async () => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const units = await import('/src/sim/units.ts')
  const labour = await import('/src/sim/labour.ts')
  const wg = await import('/src/sim/worldgen.ts')
  const home = s.settlements.find(x => x.owner === 0)
  // open ground two tiles from the settlement for the enemy, beside it for the militia
  const land = (i) => i >= 0 && i < s.world.tiles.length && s.world.tiles[i].terrain !== 'water' && s.world.tiles[i].terrain !== 'mountain' && !s.settlements.some(x => x.tile === i)
  // open ground for the enemy, so its figure is not lost among trees in the picture
  const open = (i) => land(i) && !s.world.tiles[i].forest
  let mine = -1, foe = -1
  for (const n of wg.neighbours8(w, h, home.tile)) {
    if (!land(n)) continue
    for (const m of wg.neighbours8(w, h, n)) if (m !== home.tile && open(m) && wg.dist(w, m, home.tile) === 2 && wg.dist(w, m, n) === 1) { mine = n; foe = m; break }
    if (mine >= 0) break
  }
  const militia = units.makeUnit(s, 0, 'militia', mine, labour.makeColonist(s, 'free'))
  s.units.push(militia)
  const regulars = units.makeUnit(s, -1, 'regulars', foe, null)
  s.units.push(regulars)
  for (const t of [foe, mine]) if (t >= 0) s.world.tiles[t].explored = true
  a.scene.rebuild(s, 'dynamic')
  a.refresh()
  a.scene.glideTo(foe, 44)
  return { militia: militia.id, foe, foeId: regulars.id, start: militia.tile }
})
await settle(800)
await select(setup.militia)
const warsAtStart = await wars()
const r6 = await pressTile(setup.militia, setup.foe)
const foeAfterHold = await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id)?.kind ?? 'gone', setup.foeId)
const oddsTag = await page.evaluate(() => document.querySelector('#route .odds text')?.textContent ?? null)
note('attack, the hold', { founded, ...r6, oddsOnMap: oddsTag, foeAfterHold, dispatchWar: await wars() })
await shot('06-attack-with-odds')
// let go over the top strip: the route goes and nothing is attacked
await letGoOverTheStrip(r6.at)
const afterAway = await page.evaluate((id) => ({ route: window.fairholm.route, foe: window.fairholm.state.units.find(u => u.id === id)?.kind ?? 'gone', wars: window.fairholm.state.dispatch.filter(d => d.kind === 'war').length }), setup.foeId)
note('attack, let go over the top strip', { cleared: afterAway.route === null, foe: afterAway.foe, warEntries: afterAway.wars })
// a hold on the militia's own tile says so, and letting go there moves nothing
const selfBefore = await unitTile(setup.militia)
const self = await pressTile(setup.militia, selfBefore)
await finger.release()
await settle(300)
const selfAfter = await unitTile(setup.militia)
note('a hold on the unit itself, let go', { shown: self.shown, reason: self.reason, moved: self.moved, stayed: selfAfter === selfBefore })
// the attack, made on purpose: hold the enemy until its odds have been on the screen for the dwell,
// then let go
await select(setup.militia)
const warsBefore = await wars()
const r6b = await pressTile(setup.militia, setup.foe)
await page.waitForTimeout(DWELL_MS + 300)
await letGo()
await page.waitForTimeout(600)
const attacked = await page.evaluate(({ before }) => ({ wars: window.fairholm.state.dispatch.filter(d => d.kind === 'war').slice(before).map(d => d.text) }), { before: warsBefore })
note('attack, on purpose: held past the dwell and let go', { shown: r6b.shown, ...attacked })

// ---- the answers ---------------------------------------------------------------------------------
answers['every hold shows a route without moving anything'] = [r1, r2, r3, r4, r5, r6, self].every(r => r && !r.moved)
answers['letting go commits, at one turn out and at six'] = afterOne === one.tile && toSix !== fromSix && afterFog !== beforeFog
// with the slim card the tile six out is often on the map already, and then no pan is needed
answers['the lander reaches six away, panning when it must and at a wider zoom'] = (fogTile.k >= 6 && r3.shown) && dist === 6 && stillChosen
answers['turn ends are numbered on the map'] = markers.length >= 2 && markers.every((m, i) => m === String(i + 1))
answers['an attack is impossible by accident and possible on purpose'] = r6.shown && !r6.moved && foeAfterHold === 'regulars' && afterAway.route === null && afterAway.foe === 'regulars' && afterAway.wars === warsAtStart && attacked.wars.length > 0
answers['letting go over the top strip, on the unit or on an unreachable tile moves nothing'] = cleared.route === null && tileAfter2 === tileBefore2 && selfAfter === selfBefore && afterLand.tile === beforeLand && !!afterLand.line
note('answers', answers)

console.log(notes.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
