// Look at plotted routes. Feel brief sections 1 and 4: a hold plots a route and moves nothing; a tap
// on the route's end, or the Go control, commits it; a hold elsewhere plots again; a tap elsewhere
// puts it away. On a fixed seed, with the player's own gestures throughout (taps, holds, drags and
// the wheel standing in for a pinch), it takes a picture of each kind of route and measures the
// answers to five questions:
//
//   does every hold plot without moving anything;
//   do a tap on the route's end and the Go control both commit;
//   can the lander reach a tile six away, by panning or by holding at a wider zoom;
//   is it plain where each turn ends;
//   is an attack impossible to make by accident.
//
// Run with:  node scripts/routes.mjs
//            OUT=shots/routes SEED=fairholm-opening CHROMIUM=/opt/pw-browsers/chromium node scripts/routes.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
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

// a software renderer draws a few frames a second, and the hold completes on a frame
const HOLD_MS = 1500
const settle = async (ms = 500) => {
  await page.waitForFunction(() => !window.fairholm.scene.moving && !window.fairholm.scene.cam.glideTarget, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })
const screenOf = (tile) => page.evaluate((t) => { const a = window.fairholm, w = a.state.world.width; return a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5) }, tile)
const tapAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(450) }
const holdAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(HOLD_MS); await page.mouse.up(); await page.waitForTimeout(300); await settle(300) }
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

/** Hold a tile and say what came of it: the route or the reason, and whether anything moved. */
const holdTile = async (id, tile) => {
  const before = await unitTile(id)
  const p = await screenOf(tile)
  await holdAt(p[0], p[1])
  const r = await route()
  const after = await unitTile(id)
  return { tile, onScreen: p.map(Math.round), plotted: !!r?.ok, reason: r && !r.ok ? r.words : null, turns: r?.ok ? r.turnEnds.length : null, moved: after !== before, words: await sheetWords() }
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

// ---- 1: a one-turn route, committed by a tap on its end -----------------------------------------
await settle(800)
await select(landerId)
const one = await farTile(landerId, 2, 4, false)
const r1 = await holdTile(landerId, one.tile)
note('one-turn route, the hold', r1)
await shot('01-one-turn-route')
await armMoveWait()
const e1 = await screenOf(one.tile)
await tapAt(e1[0], e1[1])
await waitDrawn()
const afterTap = await unitTile(landerId)
note('one-turn route, a tap on its end', { arrivedAt: afterTap, end: one.tile, committed: afterTap === one.tile })

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
const multi = await farTile(landerId, 8, 13, false)
const r2 = multi ? await holdTile(landerId, multi.tile) : { error: 'no far tile on the screen' }
const markers = await page.evaluate(() => [...document.querySelectorAll('#route .turn text')].map(t => t.textContent))
note('multi-turn route at a wider zoom', { zoom: +zoomWide.toFixed(1), tapFloor: 44, ...r2, markers })
await shot('02-multi-turn-route')
// a tap anywhere else puts it away, and the lander stays chosen
const free = await freeArea()
await tapAt(free.W - 40, free.top + 40)
const cleared = await page.evaluate(() => ({ route: window.fairholm.route, active: window.fairholm.scene.cam.view.activeUnit, sheet: window.fairholm.sheet.kind }))
note('a tap elsewhere', { cleared: cleared.route === null, stillChosen: cleared.active === landerId, sheet: cleared.sheet })

// ---- 3: a route into the fog, six tiles out at the wider zoom, committed with Go ----------------
const fogTile = await farTile(landerId, 6, 6, true) ?? await farTile(landerId, 4, 6, true)
const r3 = await holdTile(landerId, fogTile.tile)
const fogLegs = await page.evaluate(() => ({ guess: (document.querySelector('#route .leg.guess')?.getAttribute('d') ?? '').length > 0, known: (document.querySelector('#route .leg.known')?.getAttribute('d') ?? '').length > 0 }))
note('route into the fog, six out at the wider zoom', { tilesOut: fogTile.k, ...r3, fogLegs })
await shot('03-route-into-fog')
const beforeGo = await unitTile(landerId)
await armMoveWait()
await page.locator('#queuebar .btn.go').click()
await waitDrawn()
const afterGo = await unitTile(landerId)
note('Go', { from: beforeGo, to: afterGo, committed: afterGo !== beforeGo })

// ---- 4: a far destination at working zoom, chosen after panning --------------------------------
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
  await page.mouse.move(cx, cy); await page.mouse.down()
  for (let i = 1; i <= 12; i++) { await page.mouse.move(cx + dx * i / 12, cy + dy * i / 12); await page.waitForTimeout(30) }
  await page.waitForTimeout(200); await page.mouse.up(); await settle(300)
}
const stillChosen = await page.evaluate((id) => window.fairholm.scene.cam.view.activeUnit === id, landerId)
const r4 = await holdTile(landerId, sixOut)
note('a far destination after panning', { offScreenAtFirst: offScreen, stillChosenAfterPan: stillChosen, zoom: await page.evaluate(() => window.fairholm.scene.cam.view.zoom), ...r4 })
await shot('04-far-destination-after-panning')
const fromSix = await unitTile(landerId)
await armMoveWait()
const e4 = await screenOf(sixOut)
await tapAt(e4[0], e4[1])
await waitDrawn()
const toSix = await unitTile(landerId)
const dist = await page.evaluate(({ a, b }) => { const w = window.fairholm.state.world.width; return Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w))) }, { a: fromSix, b: toSix })
note('six out, committed by a tap on its end', { from: fromSix, to: toSix, tilesSailed: dist })

// ---- 5: an unreachable tile and why ------------------------------------------------------------
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
const r5 = land ? await holdTile(landerId, land.tile) : { error: 'no known land on the screen' }
note('unreachable: the lander holding land', r5)
await shot('05-unreachable-with-reason')
// the shore beside the lander, held: no course, the founding control looking at it instead
const shoreBeside = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const u = s.units.find(x => x.id === id)
  return wg.neighbours8(w, h, u.tile).find(n => s.world.tiles[n].terrain !== 'water' && s.world.tiles[n].explored) ?? null
}, landerId)
if (shoreBeside !== null) {
  const r5b = await holdTile(landerId, shoreBeside)
  const focus = await page.evaluate(() => ({ foundTarget: window.fairholm.foundTarget, control: [...document.querySelectorAll('#queuebar .btn')].some(b => b.textContent === 'Found here'), settlements: window.fairholm.state.settlements.filter(x => x.owner === 0).length }))
  note('the lander holding the shore beside it', { ...r5b, ...focus, pointsAtFounding: focus.foundTarget === shoreBeside && focus.control, foundedNothing: focus.settlements === 0 })
  await shot('05b-shore-beside-points-at-founding')
}

// ---- 6: an attack and its odds, and how hard it is to make one by accident ---------------------
// found the first settlement, then a militia of the player's and a Company unit two tiles off. The
// two units are put down by the rig, as the war rig does, because a war takes many turns to reach
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
  // and one tile further out, so the attack is a walk and then a strike
  let start = -1
  for (const n of wg.neighbours8(w, h, mine)) if (land(n) && wg.dist(w, n, foe) === 2) { start = n; break }
  const militia = units.makeUnit(s, 0, 'militia', start >= 0 ? start : mine, labour.makeColonist(s, 'free'))
  s.units.push(militia)
  const regulars = units.makeUnit(s, -1, 'regulars', foe, null)
  s.units.push(regulars)
  for (const t of [foe, mine, start]) if (t >= 0) s.world.tiles[t].explored = true
  a.scene.rebuild(s, 'dynamic')
  a.refresh()
  a.scene.glideTo(foe, 44)
  return { militia: militia.id, foe, foeId: regulars.id, start: militia.tile }
})
await settle(800)
await select(setup.militia)
const warsAtStart = await page.evaluate(() => window.fairholm.state.dispatch.filter(d => d.kind === 'war').length)
const r6 = await holdTile(setup.militia, setup.foe)
const foeAfterHold = await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id)?.kind ?? 'gone', setup.foeId)
const oddsTag = await page.evaluate(() => document.querySelector('#route .odds text')?.textContent ?? null)
note('attack, the hold', { founded, ...r6, oddsOnMap: oddsTag, foeAfterHold, dispatchWar: await page.evaluate(() => window.fairholm.state.dispatch.filter(d => d.kind === 'war').length) })
await shot('06-attack-with-odds')
// a tap somewhere else puts it away; nothing was attacked
const fa6 = await freeArea()
await tapAt(30, fa6.top + 30)
const afterAway = await page.evaluate((id) => ({ route: window.fairholm.route, foe: window.fairholm.state.units.find(u => u.id === id)?.kind ?? 'gone', wars: window.fairholm.state.dispatch.filter(d => d.kind === 'war').length }), setup.foeId)
note('attack, a tap elsewhere', { cleared: afterAway.route === null, foe: afterAway.foe, warEntries: afterAway.wars })
// a second hold on the militia's own tile says so and plots nothing
const self = await holdTile(setup.militia, await unitTile(setup.militia))
note('a hold on the unit itself', { plotted: self.plotted, reason: self.reason, moved: self.moved })
// the attack, made on purpose: hold the enemy, then the Attack control
await select(setup.militia)
await holdTile(setup.militia, setup.foe)
const warsBefore = await page.evaluate(() => window.fairholm.state.dispatch.filter(d => d.kind === 'war').length)
await armMoveWait()
await page.locator('#queuebar .btn.danger').click()
await waitDrawn()
await page.waitForTimeout(600)
const attacked = await page.evaluate(({ id, before }) => ({ wars: window.fairholm.state.dispatch.filter(d => d.kind === 'war').slice(before).map(d => d.text) }), { id: setup.foeId, before: warsBefore })
note('attack, on purpose with the Attack control', attacked)

// ---- the answers ---------------------------------------------------------------------------------
answers['every hold plots without moving anything'] = [r1, r2, r3, r4, r5, r6, self].every(r => r && !r.moved)
answers['a tap on the end commits'] = afterTap === one.tile && toSix !== fromSix
answers['the Go control commits'] = afterGo !== beforeGo
// with the slim card the tile six out is often on the map already, and then no pan is needed
answers['the lander reaches six away, panning when it must and at a wider zoom'] = (fogTile.k >= 6 && r3.plotted) && dist === 6 && stillChosen
answers['turn ends are numbered on the map'] = markers.length >= 2 && markers.every((m, i) => m === String(i + 1))
answers['an attack needs a hold and then a confirming tap'] = r6.plotted && !r6.moved && foeAfterHold === 'regulars' && afterAway.route === null && afterAway.foe === 'regulars' && afterAway.wars === warsAtStart && attacked.wars.length > 0
note('answers', answers)

console.log(notes.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
