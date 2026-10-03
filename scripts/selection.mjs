// Look at choosing a unit and at what the interface covers while one is chosen. Feel brief section 3
// and the layout brief section 1, as changed on 2 October 2026: a tap anywhere on a unit's picture
// chooses it; the chosen unit wears a ring and an outline that do not move; and a slim card takes
// the queue bar's place rather than a sheet over half the map. On a fixed seed, at 390 points wide,
// with the player's own gestures throughout, it takes the pictures the change asks for and measures
// the answers to seven questions:
//
//   does a tap anywhere on a unit's picture choose it;
//   is the chosen unit obvious at a glance, on land, on water and by the fog;
//   with a unit chosen, what share of the screen does the interface cover;
//   is End turn within reach with a unit chosen;
//   is the full detail one tap away, and does one tap or swipe put everything away;
//   does the frame loop go idle while a unit sits chosen;
//   is a Company regular drawn with the soldier.
//
// Run with:  node scripts/selection.mjs
//            OUT=shots/selection SEED=fairholm-opening CHROMIUM=/opt/pw-browsers/chromium node scripts/selection.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/selection'
const SEED = process.env.SEED || 'fairholm-opening'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/\.(png|jpg)$/.test(f)) unlinkSync(`${OUT}/${f}`)

const server = await createServer({ server: { port: 5195, strictPort: true }, logLevel: 'silent' })
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

await page.goto('http://localhost:5195/')
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
const tapAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(450); await settle(100) }
const holdAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(HOLD_MS); await page.mouse.up(); await page.waitForTimeout(300); await settle(300) }
/** More on the card, and wait for the sheet to finish sliding in and the camera to come to rest:
 *  a software renderer gliding the camera can hold the slide up well past its own length. */
const openMore = async () => {
  await page.locator('#queuebar .more').click()
  await page.waitForFunction(() => { const r = document.getElementById('sheet').getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 }, null, { timeout: 10000 }).catch(() => {})
  await settle(300)
}
/** Click a control if it is there; say whether it was. */
const clickIf = async (sel) => { const l = page.locator(sel); if (await l.count() === 0) return false; await l.first().click(); return true }
const unitTile = (id) => page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id)?.tile ?? null, id)
const active = () => page.evaluate(() => window.fairholm.scene.cam.view.activeUnit)
const card = () => page.evaluate(() => ({
  carded: document.getElementById('queuebar').classList.contains('carded'),
  title: document.querySelector('#queuebar .uc-title .t')?.textContent ?? null,
  line: document.querySelector('#queuebar .uc-line')?.textContent ?? null,
  actions: [...document.querySelectorAll('#queuebar .btn')].map(b => b.textContent),
}))
const waitDrawn = async () => {
  await page.waitForFunction(() => window.__moveDone !== false, null, { timeout: 20000 }).catch(() => {})
  await settle(400)
}
const armMoveWait = () => page.evaluate(() => { window.__moveDone = false; const a = window.fairholm; const real = a.moveTo.bind(a); a.moveTo = (id, t) => real(id, t).then(r => { window.__moveDone = true; a.moveTo = real; return r }) })

/** The picture of a unit as last drawn, as a rectangle on the screen, and the tile it stands on. */
const pictureOf = (id) => page.evaluate((id) => {
  const a = window.fairholm, sc = a.scene, z = sc.cam.view.zoom
  const p = sc.unitPictures.get(id), at = sc.unitPositions.get(id)
  if (!p || !at) return null
  const [sx, sy] = sc.cam.worldToScreen(at[0], at[1])
  return { x0: sx + p.box[0] * z, y0: sy + p.box[1] * z, x1: sx + p.box[2] * z, y1: sy + p.box[3] * z, foot: [sx, sy] }
}, id)
const tileAt = (x, y) => page.evaluate(async ({ x, y }) => {
  const picking = await import('/src/render/picking.ts')
  return picking.tileUnderPoint(window.fairholm.state, window.fairholm.scene.cam, x, y)
}, { x, y })

/** What the interface covers at rest: the top strip and whatever is along the bottom, as a share
 *  of the screen's area. Both run the full width in portrait. */
const covered = () => page.evaluate(() => {
  const a = window.fairholm, H = a.root.clientHeight, W = a.root.clientWidth
  const hud = a.hud.getBoundingClientRect().height
  const bar = a.queuebar.getBoundingClientRect().height
  const sheet = a.sheetEl.classList.contains('open') ? a.sheetEl.getBoundingClientRect().height : 0
  const bottom = Math.max(bar, sheet)
  return { hud: Math.round(hud), bottom: Math.round(bottom), share: +((hud + bottom) / H).toFixed(3), W, H }
})

/** Frames drawn over a span, counted at the renderer, and whether the loop is running at its end. */
const framesOver = (ms) => page.evaluate(async (ms) => {
  const r = window.fairholm.scene.renderer
  const real = r.render.bind(r)
  let n = 0
  r.render = (...args) => { n++; return real(...args) }
  await new Promise(res => setTimeout(res, ms))
  r.render = real
  return { frames: n, loopRunning: window.fairholm.scene.loopRunning }
}, ms)

/** Bring a tile toward the middle of the free map at a zoom, and let the camera come to rest. */
const look = async (tile, zoom) => { await page.evaluate(({ tile, zoom }) => { window.fairholm.scene.glideTo(tile, zoom) }, { tile, zoom }); await settle(700) }

const landerId = await page.evaluate(() => window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'lander').id)

// ---- 1: the lander, unchosen and chosen ----------------------------------------------------------
await settle(800)
await shot('01-lander-unselected')
let pic = await pictureOf(landerId)
await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
const chosen1 = (await active()) === landerId
await settle(300)
await shot('02-lander-selected')
const rest = await covered()
const restCard = await card()
note('the lander chosen by a tap on its middle', { chosen: chosen1, card: restCard, covered: rest })

// the chosen unit tapped again lets it go
pic = await pictureOf(landerId)
await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
const letGo = (await active()) === null
const barBack = await card()
note('the lander tapped again', { letGo, queueBarBack: !barBack.carded })

// a tap on each end of its picture, well off the tile it stands on
const ends = []
for (const [name, fx] of [['left', 0.06], ['right', 0.94]]) {
  pic = await pictureOf(landerId)
  const x = pic.x0 + (pic.x1 - pic.x0) * fx, y = pic.y0 + (pic.y1 - pic.y0) * 0.55
  const tile = await tileAt(x, y)
  await tapAt(x, y)
  const got = (await active()) === landerId
  await settle(200)
  await shot(`03-tap-${name}-end-of-lander`)
  ends.push({ end: name, at: [Math.round(x), Math.round(y)], tileUnderFinger: tile, landerTile: await unitTile(landerId), chosen: got })
  // empty water far off lets it go again, ready for the next end
  const f = await covered()
  await tapAt(30, f.hud + 40)
  if ((await active()) !== null) await tapAt(30, f.hud + 40)
}
note('a tap on each end of the lander', ends)

// ---- 2: the frame loop while it sits chosen ------------------------------------------------------
pic = await pictureOf(landerId)
await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
// the opening's steam blows away after a while; until then the loop runs for it, not for the choice
await page.waitForFunction(() => !window.fairholm.scene.steaming(), null, { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(600)
const idle = await framesOver(3000)
note('frames drawn in three seconds with the lander sitting chosen, after the steam', { ...idle, chosen: (await active()) === landerId })

// the chosen lander with the fog close round it: wider, where the haze fills most of the screen, and
// at overview, where a unit is a mark
const landerTile = await unitTile(landerId)
await look(landerTile, 28)
const pictureAt28 = await page.evaluate(() => window.fairholm.scene.drawnClose)
await shot('03b-lander-selected-in-the-fog')
await look(landerTile, 16)
await shot('03c-lander-selected-at-overview')
note('the lander chosen with the fog round it', { chosen: (await active()) === landerId, pictureAt28, markAtOverview: !(await page.evaluate(() => window.fairholm.scene.drawnClose)) })
await look(landerTile, 44)

// ---- 3: a plotted route, and the card saying so --------------------------------------------------
const dest = await page.evaluate((id) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const u = s.units.find(x => x.id === id)
  const top = a.hud.getBoundingClientRect().height + 40, bottom = a.root.clientHeight - a.queuebar.offsetHeight - 60
  for (const [dx, dz] of [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1]]) {
    for (let k = 4; k >= 3; k--) {
      const x = (u.tile % w) + dx * k, z = Math.floor(u.tile / w) + dz * k
      if (x < 0 || z < 0 || x >= w || z >= h) continue
      const t = s.world.tiles[z * w + x]
      if (t.explored && t.terrain !== 'water') continue
      const [sx, sy] = a.scene.cam.worldToScreen(x + 0.5, z + 0.5)
      if (sx < 30 || sx > a.root.clientWidth - 30 || sy < top || sy > bottom) continue
      return z * w + x
    }
  }
  return null
}, landerId)
let p = await screenOf(dest)
await holdAt(p[0], p[1])
await shot('04-route-plotted-with-card')
const routeCard = await card()
const routeCover = await covered()
const routeShown = await page.evaluate(() => {
  // the unit and the whole route sit on the map left free between the top strip and the card
  const a = window.fairholm, r = a.route, w = a.state.world.width
  if (!r || !r.ok) return null
  const top = a.hud.getBoundingClientRect().height, bottom = a.root.clientHeight - a.queuebar.offsetHeight
  const u = a.state.units.find(x => x.id === r.unit)
  const ys = [u.tile, ...r.path, r.end].map(t => a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5)[1])
  return { above: Math.max(...ys) < bottom, below: Math.min(...ys) > top }
})
note('a route plotted', { card: routeCard, covered: routeCover, routeOnFreeMap: routeShown })

// ---- 4: More, and putting it away ----------------------------------------------------------------
await openMore()
const moreOpen = await page.evaluate(() => ({ sheet: window.fairholm.sheet.kind, open: document.getElementById('sheet').classList.contains('open'), scrim: document.getElementById('scrim').classList.contains('show') }))
await shot('05-more-expanded')
const moreCover = await covered()
// one tap on the map puts it away, and the card comes back with the route still plotted
await tapAt(40, rest.hud + 40)
const afterTapAway = await page.evaluate(() => ({ sheet: window.fairholm.sheet.kind, open: document.getElementById('sheet').classList.contains('open'), active: window.fairholm.scene.cam.view.activeUnit, route: !!window.fairholm.route }))
// and a swipe down on its grip does the same
await openMore()
const grip = await page.locator('#sheet .grip').boundingBox()
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
await page.mouse.down()
for (let i = 1; i <= 10; i++) { await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + i * 14); await page.waitForTimeout(20) }
await page.mouse.up()
await page.waitForTimeout(500)
const afterSwipe = await page.evaluate(() => ({ open: document.getElementById('sheet').classList.contains('open'), active: window.fairholm.scene.cam.view.activeUnit }))
note('More', { opened: moreOpen, covered: moreCover, afterOneTapOnMap: afterTapAway, afterSwipeDown: afterSwipe })

// Go, from the card
const goFrom = await unitTile(landerId)
await armMoveWait()
await clickIf('#queuebar .btn.go')
await waitDrawn()
note('Go on the card', { from: goFrom, to: await unitTile(landerId), stillChosen: (await active()) === landerId, card: await card() })

// ---- 5: to the coast, the passenger ashore and back -------------------------------------------
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
await settle(800)
pic = await pictureOf(landerId)
if ((await active()) !== landerId) await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
await settle(400)
await shot('06-lander-beside-the-shore')
const shoreCard = await card()
note('the lander beside the shore', { card: shoreCard, covered: await covered() })

// choose the next one off from its detail, then hold the shore
await openMore()
const chooseButton = page.locator('#sheet .btn', { hasText: 'Choose' })
const canChoose = await chooseButton.count() > 0
if (canChoose) await chooseButton.first().click()
await page.waitForTimeout(400)
const passengerCard = await card()
const shore = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const u = s.units.find(x => x.id === id)
  return wg.neighbours8(w, h, u.tile).find(n => s.world.tiles[n].terrain !== 'water' && s.world.tiles[n].terrain !== 'mountain' && s.world.tiles[n].explored && n !== a.foundTarget)
    ?? wg.neighbours8(w, h, u.tile).find(n => s.world.tiles[n].terrain !== 'water' && s.world.tiles[n].terrain !== 'mountain' && s.world.tiles[n].explored)
}, landerId)
p = await screenOf(shore)
const aboardBefore = await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id).aboard.length, landerId)
await holdAt(p[0], p[1])
await shot('07-passenger-ashore-plotted')
const ashoreCard = await card()
const stillAboard = await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id).aboard.length, landerId)
await clickIf('#queuebar .btn.go')
await settle(500)
const walker = await active()
const ashore = await page.evaluate(({ id, w }) => ({ aboard: window.fairholm.state.units.find(u => u.id === id).aboard.length, walker: window.fairholm.state.units.find(u => u.id === w) }), { id: landerId, w: walker })
await shot('08-colonist-ashore-selected-on-land')
note('a passenger sent ashore by a hold', { canChoose, passengerCard, held: shore, ashoreCard, nothingMovedOnHold: stillAboard === aboardBefore, aboardAfter: ashore.aboard, ashoreUnit: ashore.walker && { kind: ashore.walker.kind, tile: ashore.walker.tile }, card: await card() })

// back aboard the same way: hold the lander with the colonist chosen. Next turn, when it can move
await page.evaluate(() => window.fairholm.endTurn())
await settle(600)
if ((await active()) !== walker) { const wp = await pictureOf(walker); await tapAt((wp.x0 + wp.x1) / 2, (wp.y0 + wp.y1) / 2) }
const chosenBeforeBoard = await active()
pic = await pictureOf(landerId)
await holdAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
const boardCard = await card()
const boardRoute = await page.evaluate(() => { const r = window.fairholm.route; return r && { ok: r.ok, kind: r.kind, end: r.end, words: r.words } })
await clickIf('#queuebar .btn.go')
await settle(500)
note('and back aboard by holding the lander', { chosen: chosenBeforeBoard, walker, route: boardRoute, card: boardCard, aboard: await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id).aboard.length, landerId), walkerGone: await page.evaluate((w) => !window.fairholm.state.units.some(u => u.id === w), walker) })

// found from the card
pic = await pictureOf(landerId)
if ((await active()) !== landerId) await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
await settle(300)
const foundButton = page.locator('#queuebar .btn', { hasText: 'Found here' })
const canFound = await foundButton.count() > 0
if (canFound) await foundButton.click()
await page.waitForFunction(() => window.fairholm.state.settlements.some(x => x.owner === 0) && !window.fairholm.scene.beaching, null, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(800)
note('Found here on the card', { offered: canFound, founded: await page.evaluate(() => window.fairholm.state.settlements.filter(x => x.owner === 0).length), sheet: await page.evaluate(() => window.fairholm.sheet.kind) })
await page.evaluate(() => window.fairholm.closeSheet())
await settle(400)

// ---- 6: the boat's mast --------------------------------------------------------------------------
const boat = await page.evaluate(() => { const u = window.fairholm.state.units.find(x => x.owner === 0 && ['lighter', 'trader', 'raider', 'cutter'].includes(x.kind)); return u ? { id: u.id, tile: u.tile, kind: u.kind } : null })
let mast = null
if (boat) {
  await look(boat.tile, 72)
  await page.evaluate(() => window.fairholm.deselect())
  pic = await pictureOf(boat.id)
  // the top of the picture, where the mast is, scanned for a point on another tile than the boat's
  let pt = null
  for (const fy of [0.08, 0.14, 0.2]) {
    for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6]) {
      const x = pic.x0 + (pic.x1 - pic.x0) * fx, y = pic.y0 + (pic.y1 - pic.y0) * fy
      const t = await tileAt(x, y)
      if (t !== boat.tile) { pt = { x, y, t }; break }
    }
    if (pt) break
  }
  pt = pt ?? { x: (pic.x0 + pic.x1) / 2, y: pic.y0 + (pic.y1 - pic.y0) * 0.1, t: await tileAt((pic.x0 + pic.x1) / 2, pic.y0 + (pic.y1 - pic.y0) * 0.1) }
  await tapAt(pt.x, pt.y)
  await settle(200)
  await shot('09-tap-on-the-boat-mast')
  mast = { boat, at: [Math.round(pt.x), Math.round(pt.y)], picture: [pic.x0, pic.y0, pic.x1, pic.y1].map(Math.round), tileUnderFinger: pt.t, chosen: (await active()) === boat.id, card: await card() }
}
note('a tap on the boat\'s mast', mast)

// ---- 7: a stack, an attack, a Company regular ---------------------------------------------------
const setup = await page.evaluate(async () => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const units = await import('/src/sim/units.ts')
  const labour = await import('/src/sim/labour.ts')
  const wg = await import('/src/sim/worldgen.ts')
  const home = s.settlements.find(x => x.owner === 0)
  const land = (i) => i >= 0 && i < s.world.tiles.length && s.world.tiles[i].terrain !== 'water' && s.world.tiles[i].terrain !== 'mountain' && !s.settlements.some(x => x.tile === i)
  const open = (i) => land(i) && !s.world.tiles[i].forest
  let mine = -1, foe = -1
  for (const n of wg.neighbours8(w, h, home.tile)) {
    if (!land(n)) continue
    for (const m of wg.neighbours8(w, h, n)) if (m !== home.tile && open(m) && wg.dist(w, m, home.tile) === 2 && wg.dist(w, m, n) === 1) { mine = n; foe = m; break }
    if (mine >= 0) break
  }
  // a stack of two of the player's beside the settlement, on a tile apart from the militia's
  const stackTile = wg.neighbours8(w, h, home.tile).find(n => land(n) && n !== mine && wg.dist(w, n, foe) > 1)
  const militia = units.makeUnit(s, 0, 'militia', mine, labour.makeColonist(s, 'free'))
  const regulars = units.makeUnit(s, -1, 'regulars', foe, null)
  const st1 = units.makeUnit(s, 0, 'colonist', stackTile, labour.makeColonist(s, 'free'))
  const st2 = units.makeUnit(s, 0, 'militia', stackTile, labour.makeColonist(s, 'contracted'))
  s.units.push(militia, regulars, st1, st2)
  for (const t of [foe, mine, stackTile]) s.world.tiles[t].explored = true
  a.scene.rebuild(s, 'dynamic')
  a.refresh()
  return { militia: militia.id, foe, foeId: regulars.id, mine, stackTile, stack: [st1.id, st2.id] }
})
await look(setup.stackTile, 44)
await page.evaluate(() => window.fairholm.deselect())
pic = await pictureOf(setup.stack[1])
await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
await page.waitForTimeout(400)
const chooser = await page.evaluate(() => ({ sheet: window.fairholm.sheet.kind, lines: [...document.querySelectorAll('#sheet .line')].map(l => l.textContent) }))
await shot('10-stack-chooser')
await page.locator('#sheet .line.tappable').first().click()
await page.waitForTimeout(400)
note('a stacked tile', { chooser, then: { active: await active(), sheet: await page.evaluate(() => window.fairholm.sheet.kind), card: await card() } })

await look(setup.foe, 44)
await page.evaluate(() => window.fairholm.deselect())
pic = await pictureOf(setup.militia)
await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
note('the militia tapped', { picture: pic, active: await active(), sheet: await page.evaluate(() => window.fairholm.sheet.kind), militia: setup.militia, tiles: { mine: setup.mine, foe: setup.foe, stack: setup.stackTile } })
await shot('10b-militia-tapped')
p = await screenOf(setup.foe)
await holdAt(p[0], p[1])
await shot('11-attack-plotted-with-card')
const attackCard = await card()
note('an attack plotted', { card: attackCard, covered: await covered(), foeStill: await page.evaluate((id) => window.fairholm.state.units.some(u => u.id === id), setup.foeId) })
// a tap on the map away from the route puts it away and attacks nothing
await tapAt(30, rest.hud + 40)
note('the attack put away', { route: await page.evaluate(() => window.fairholm.route), foeStill: await page.evaluate((id) => window.fairholm.state.units.some(u => u.id === id), setup.foeId) })

// the Company regular, close, with nothing chosen
await page.evaluate(() => window.fairholm.deselect())
await look(setup.foe, 96)
const regular = await page.evaluate((id) => {
  const sc = window.fairholm.scene
  const pic = sc.unitPictures.get(id)
  const name = pic ? Object.entries(sc.sheetManifests[1].pieces).find(([, v]) => v === pic.bill.piece)?.[0] : null
  return { drawn: !!pic, piece: name }
}, setup.foeId)
await shot('12-company-regular')
note('a Company regular', regular)

// ---- 8: a tile looked at -------------------------------------------------------------------------
await look(setup.mine, 44)
const plain = await page.evaluate(() => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const top = a.hud.getBoundingClientRect().height + 50, bottom = a.root.clientHeight - a.queuebar.offsetHeight - 50
  for (let i = 0; i < s.world.tiles.length; i++) {
    const t = s.world.tiles[i]
    if (!t.explored || t.terrain === 'water' || s.units.some(u => u.tile === i) || s.settlements.some(x => x.tile === i)) continue
    const [sx, sy] = a.scene.cam.worldToScreen((i % w) + 0.5, Math.floor(i / w) + 0.5)
    if (sx > 40 && sx < a.root.clientWidth - 40 && sy > top && sy < bottom) return { tile: i, at: [sx, sy] }
  }
  return null
})
await tapAt(plain.at[0], plain.at[1])
await shot('13-tile-tapped')
const tileCard = await card()
const tileCover = await covered()
note('a tile tapped', { card: tileCard, covered: tileCover, sheet: await page.evaluate(() => window.fairholm.sheet.kind) })
await tapAt(plain.at[0], plain.at[1])
note('the same tile tapped again', { card: await card() })

// ---- the answers ---------------------------------------------------------------------------------
answers['a tap anywhere on a unit\'s picture chooses it'] = chosen1 && ends.every(e => e.chosen) && ends.some(e => e.tileUnderFinger !== e.landerTile) && !!mast?.chosen
answers['tapping the chosen unit again lets it go'] = letGo && !barBack.carded
answers['share of the screen covered with a unit chosen, at rest'] = rest.share
answers['share covered with a route plotted'] = routeCover.share
answers['share covered with a tile looked at'] = tileCover.share
answers['End turn within reach with a unit chosen'] = restCard.actions.some(t => t.startsWith('End turn')) && routeCard.actions.some(t => t.startsWith('End turn'))
answers['full detail is one tap away'] = moreOpen.open && moreOpen.sheet === 'unit'
answers['one tap on the map, or a swipe down, puts it away'] = !afterTapAway.open && afterTapAway.active === landerId && !afterSwipe.open
answers['the frame loop is idle with a unit sitting chosen'] = idle.frames === 0 && !idle.loopRunning
answers['the Company regular is drawn with the soldier'] = regular.piece === 'company-regular'
note('answers', answers)

console.log(notes.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
