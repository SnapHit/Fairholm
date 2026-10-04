// Look at the opening. Setting brief section 7, onboarding brief sections 2 and 6, session brief
// section 8, art brief section 10a.
//
// A fresh game on a fixed seed, sailed the way a player would and with the player's own gestures as
// real touches: a tap on the lander, then the first move by press and hold on a tile of water on a
// heading that is sensible but not straight at the coast, which shows the course, and letting go,
// which sails it; then on toward land and two moves along the coast, each a hold on the tile six
// out, panning to it with a drag when it is off the screen, and let go; ending each turn with the
// button; then a hold on the shore, let go, for the founding preview. Each move is drawn travelling
// with the fog lifting, and a frame is taken part way through the first to see that. Then a recall fleet wave
// approaching through the fog over three turns, and a save from an earlier build turned away. The
// pictures are for a person to look at; the numbers printed beside them are what can be measured.
//
// Run with:  node scripts/opening.mjs
//            OUT=shots/opening SEED=fairholm-opening CHROMIUM=/opt/pw-browsers/chromium node scripts/opening.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fingers } from './touch.mjs'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/opening'
const SEED = process.env.SEED || 'fairholm-opening'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/\.(png|jpg)$/.test(f)) unlinkSync(`${OUT}/${f}`)

const server = await createServer({ server: { port: 5193, strictPort: true }, logLevel: 'silent' })
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
const note = (k, v) => { notes.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`) }

await page.goto('http://localhost:5193/')
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
}, SEED)

const settle = async (ms = 500) => {
  await page.waitForFunction(() => !window.fairholm.scene.moving && !window.fairholm.scene.cam.glideTarget, null, { timeout: 20000 }).catch(() => {})
  // the camera's spring back from the map's edge is a few frames on a phone and seconds under the
  // software renderer here, so the rig settles it at once rather than let the map creep under a finger
  await page.evaluate(() => { const sc = window.fairholm.scene; if (window.fairholm.aim) return; sc.cam.stop(); sc.cam.glideTarget = null; let moved = false; for (let i = 0; i < 400 && sc.cam.tick(); i++) moved = true; if (moved) sc.requestDraw() })
  await page.waitForTimeout(ms)
}
// jpeg: these are for looking at, and a dozen at a phone's two times resolution are ten megabytes as png
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })

/** What the player can see now: land tiles in sight, and land tiles ever explored. */
const seen = () => page.evaluate(async () => {
  const a = window.fairholm, s = a.state
  const fog = await import('/src/sim/fog.ts')
  const mask = fog.sightMask(s)
  let inSight = 0, known = 0
  for (let i = 0; i < mask.length; i++) {
    if (s.world.tiles[i].terrain === 'water') continue
    if (mask[i]) inSight++
    if (s.world.tiles[i].explored) known++
  }
  const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')
  return { turn: s.turn, landInSight: inSight, landKnown: known, lander: lander ? [lander.tile % s.world.width, Math.floor(lander.tile / s.world.width)] : null, explored: s.world.tiles.filter(t => t.explored).length }
})

// well past the hold in src/ui/theme.ts: a software renderer draws few frames a second, and the
// hold completes on a frame
const HOLD_MS = await page.evaluate(async () => (await import('/src/ui/theme.ts')).HOLD_MS)
// the player's finger, as real touches through the devtools protocol (scripts/touch.mjs)
const finger = fingers(await ctx.newCDPSession(page), page, { holdMs: HOLD_MS })

/** Where the lander is on the screen, and the free strip of map above the card. */
const where = () => page.evaluate(() => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')
  if (!lander) return null
  const [sx, sy] = a.scene.cam.worldToScreen((lander.tile % w) + 0.5, Math.floor(lander.tile / w) + 0.5)
  const sheetTop = a.sheetEl.classList.contains('open') ? a.root.clientHeight - a.sheetEl.offsetHeight : a.root.clientHeight - a.queuebar.offsetHeight
  return { id: lander.id, tile: lander.tile, x: lander.tile % w, z: Math.floor(lander.tile / w), sx, sy, sheetTop, top: a.hud.getBoundingClientRect().height, W: a.root.clientWidth, explored: s.world.tiles.filter(t => t.explored).length, moves: lander.moves }
})

/** A tap, as a finger makes one: down and up in the same place, quickly. */
const tapAt = async (x, y) => { await finger.tap(x, y, 400) }

/** Select the lander by tapping it, so its card is up in the queue bar's place. */
const selectLander = async () => {
  const selected = () => page.evaluate(() => {
    const a = window.fairholm, l = a.state.units.find(u => u.owner === 0 && u.kind === 'lander')
    return !!l && a.scene.cam.view.activeUnit === l.id && a.queuebar.classList.contains('carded') && !a.queuebar.classList.contains('held')
  })
  for (let k = 0; k < 3 && !(await selected()); k++) {
    const p = await where()
    await tapAt(p.sx, p.sy)
    // a tap waits out the double tap before it counts, and the card comes up after it
    await page.waitForFunction(() => window.fairholm.queuebar.classList.contains('carded'), null, { timeout: 3000 }).catch(() => {})
  }
  await settle(400)
  return page.evaluate(() => document.querySelector('#queuebar .uc-head')?.textContent?.slice(0, 60) ?? '')
}

/** Where a turn's sailing straight along a heading would end, as far as the map and the land the
 *  player knows of allow: the tile a player aiming that way would hold. */
const headingEnd = (heading) => page.evaluate((d) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const u = s.units.find(x => x.owner === 0 && x.kind === 'lander')
  let x = u.tile % w, z = Math.floor(u.tile / w), last = null
  for (let k = 0; k < 6; k++) {
    x += d[0]; z += d[1]
    if (x < 0 || z < 0 || x >= w || z >= h) break
    const t = s.world.tiles[z * w + x]
    if (t.explored && t.terrain !== 'water') break
    last = z * w + x
  }
  return last
}, heading)

/** Arm the wait for a committed move to be drawn to its end. */
const armMoveWait = () => page.evaluate(() => { window.__moveDone = false; const a = window.fairholm; const real = a.moveTo.bind(a); a.moveTo = (id, t) => real(id, t).then(r => { window.__moveDone = true; a.moveTo = real; return r }) })

/** Press and hold a tile, panning to it first with a drag if it is not on the map above the card:
 *  the hold shows the course and nothing moves. The finger stays down. What was shown, and whether
 *  anything moved. */
const holdTile = async (tile) => {
  const before = await where()
  const p = await bringOnScreen(tile)
  const panned = await page.evaluate(() => window.__panned ?? 0)
  await finger.press(p[0], p[1])
  const after = await page.evaluate(() => { const a = window.fairholm; const l = a.state.units.find(u => u.owner === 0 && u.kind === 'lander'); return { route: a.route, tile: l?.tile, sheet: document.querySelector('#queuebar .uc-line')?.textContent?.slice(0, 200) ?? '' } })
  return { held: tile, onScreen: p.map(Math.round), panned, plotted: !!after.route?.ok, moved: after.tile !== before.tile, turns: after.route?.ok ? after.route.turnEnds.length : null, preview: after.sheet, id: before.id, from: [before.x, before.z], exploredBefore: before.explored }
}

/** Let go: the course shown is sailed. */
const letGo = async () => {
  await armMoveWait()
  await finger.release()
}

/** The first move, by the map's own gesture: press and hold a tile of water out along a heading,
 *  the furthest one a move reaches that is on the screen above the card, then let go. */
const holdToward = async (heading) => {
  const p = await where()
  const tile = await page.evaluate(({ heading, p }) => {
    const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
    let best = null
    for (let k = 1; k <= 6; k++) {
      const x = p.x + heading[0] * k, z = p.z + heading[1] * k
      if (x < 0 || z < 0 || x >= w || z >= h) break
      const [sx, sy] = a.scene.cam.worldToScreen(x + 0.5, z + 0.5)
      if (sx < 24 || sx > p.W - 24 || sy < p.top + 24 || sy > p.sheetTop - 24) break
      best = { k, x, z, tile: z * w + x }
    }
    return best
  }, { heading, p })
  if (!tile) return { error: 'no tile on the screen along that heading' }
  const held = await holdTile(tile.tile)
  return { ...held, tilesOut: tile.k }
}

/** A turn's sailing along a heading: the tile six out held, after a pan if it is off the screen,
 *  then let go. */
const sailHeading = async (heading) => {
  const end = await headingEnd(heading)
  if (end === null) return { error: 'that heading goes nowhere' }
  const held = await holdTile(end)
  if (!held.plotted) { await finger.release(); return { ...held, error: 'the hold showed nothing' } }
  await letGo()
  return held
}

/** Drag the map, as a finger would, until a tile is in the strip above the card; where it is then. */
const bringOnScreen = async (tile) => {
  const at = () => page.evaluate((t) => {
    const a = window.fairholm, w = a.state.world.width
    const [sx, sy] = a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5)
    const sheetTop = a.sheetEl.classList.contains('open') ? a.root.clientHeight - a.sheetEl.offsetHeight : a.root.clientHeight - a.queuebar.offsetHeight
    const top = a.hud.getBoundingClientRect().height
    return { sx, sy, W: a.root.clientWidth, top, sheetTop }
  }, tile)
  for (let k = 0; k < 4; k++) {
    const p = await at()
    const cx = p.W / 2, cy = (p.top + p.sheetTop) / 2
    if (p.sx > 30 && p.sx < p.W - 30 && p.sy > p.top + 30 && p.sy < p.sheetTop - 30) return [p.sx, p.sy]
    // a slow drag, so it pans without a fling
    await page.evaluate(() => { window.__panned = (window.__panned ?? 0) + 1 })
    const dx = Math.max(-150, Math.min(150, cx - p.sx)), dy = Math.max(-150, Math.min(150, cy - p.sy))
    await finger.drag([cx, cy], [cx + dx, cy + dy], 12, 30)
    await settle(300)
  }
  const p = await at()
  return [p.sx, p.sy]
}

const endTurn = async () => { await page.locator('#queuebar .btn.primary').click(); await settle(500) }

/** Part way through a move: is the picture travelling, how much of the fog has lifted, and is the
 *  camera keeping the lander on the screen, above the card. */
const midMove = (id) => page.evaluate((id) => {
  const a = window.fairholm
  const g = a.scene.ghostAt(id)
  if (!g) return { moving: a.scene.moving }
  const [sx, sy] = a.scene.cam.worldToScreen(g[0], g[1])
  const sheetTop = a.root.clientHeight - a.queuebar.offsetHeight
  const data = a.scene.light.uVis.value.image.data
  let lifting = 0, known = 0
  for (let i = 0; i < data.length; i += 4) { if (data[i] > 0 && data[i] < 255) lifting++; if (data[i] === 255) known++ }
  return { moving: a.scene.moving, ghost: g.map(v => +v.toFixed(2)), screen: [Math.round(sx), Math.round(sy)], aboveSheet: sy > 0 && sy < sheetTop && sx > 0 && sx < a.scene.cam.width, tilesKnown: known, tilesPartLifted: lifting, sheetHeld: a.sheetEl.classList.contains('held') }
}, id)

const waitMove = async () => { await page.waitForFunction(() => window.__moveDone !== false && !window.fairholm.scene.moving, null, { timeout: 20000 }); await settle(400) }

// ---- 1: splashdown -------------------------------------------------------------------------------
// the five lines, all in, over the picture the player first sees
await page.waitForTimeout(11000)
await shot('01-splashdown')
const t1 = await seen()
const coast = await page.evaluate(async () => {
  // the heading toward the nearest coast a lander could found on, by the water: what a player who
  // guessed right would sail, and the rig's reference for "sensible". Then the sites a lander could
  // reach: viable coast within one, two and three turns' sailing of the splashdown
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const st = await import('/src/sim/settlement.ts')
  const C = (await import('/src/sim/constants.ts')).C
  const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')
  const prev = new Int32Array(w * h).fill(-2); prev[lander.tile] = -1
  const q = [lander.tile]; let found = -1
  for (let k = 0; k < q.length && found < 0; k++) for (const n of wg.neighbours8(w, h, q[k])) {
    const t = s.world.tiles[n]
    if (t.terrain !== 'water') { if (wg.isCoastal(w, h, s.world.tiles, n) && wg.landingViable(w, h, s.world.tiles, n) && !st.foundingProblem(s, n)) { found = n; break } continue }
    if (prev[n] === -2) { prev[n] = q[k]; q.push(n) }
  }
  const dx = (found % w) - (lander.tile % w), dz = Math.floor(found / w) - Math.floor(lander.tile / w)
  const heads = wg.landHeadings(w, h, s.world.tiles, lander.tile)
  // sailing distance from the lander over water
  const d = new Int32Array(w * h).fill(-1); d[lander.tile] = 0
  const qq = [lander.tile]
  for (let k = 0; k < qq.length; k++) for (const n of wg.neighbours8(w, h, qq[k])) if (s.world.tiles[n].terrain === 'water' && d[n] < 0) { d[n] = d[qq[k]] + 1; qq.push(n) }
  const within = [0, 0, 0]
  for (let i = 0; i < s.world.tiles.length; i++) {
    if (s.world.tiles[i].terrain === 'water' || !wg.isCoastal(w, h, s.world.tiles, i) || st.foundingProblem(s, i) || !wg.landingViable(w, h, s.world.tiles, i)) continue
    let best = 1e9
    for (const n of wg.neighbours8(w, h, i)) if (d[n] >= 0) best = Math.min(best, d[n])
    for (let t = 0; t < 3; t++) if (best <= C.lander.moves * (t + 1)) within[t]++
  }
  const wd = wg.sailingDistance(w, h, s.world.tiles, i => wg.isLand(s.world.tiles[i]) && wg.isCoastal(w, h, s.world.tiles, i) && wg.landingViable(w, h, s.world.tiles, i))
  return { coast: [found % w, Math.floor(found / w)], dx, dz, heads, band: wg.voyageBand(), splashdownDistance: wd[lander.tile], viableSitesWithinTurns: within, offEdge: wg.offEdge(w, h, lander.tile) }
})
note('splashdown', { ...t1, ...coast })

// the first tap anywhere takes the lines away; this one is on the lander, so it also selects it
const firstSheet = await selectLander()
note('first tap', { linesGone: await page.evaluate(() => !window.fairholm.opening?.showing), sheet: firstSheet })
await shot('01b-the-lander-selected')

// the first heading: sensible but not straight at the coast, forty five degrees off it
const sign = (v) => v > 0 ? 1 : v < 0 ? -1 : 0
const toward = [sign(coast.dx), sign(coast.dz)]
const off = toward[0] !== 0 && toward[1] !== 0 ? [toward[0], 0] : toward[0] === 0 ? [1, toward[1]] : [toward[0], 1]

// ---- 2: the first move, by tap and hold, with a frame part way through it -----------------------
// held half way through, because a headless browser draws too few frames to catch the middle
await page.evaluate(() => { window.fairholm.scene.holdMoveAt = 0.5 })
const m1 = await holdToward(off)
note('first move, the hold', { plotted: m1.plotted, moved: m1.moved, preview: m1.preview })
await shot('02a-first-course-plotted')
await letGo()
const started = await page.waitForFunction(() => { const sc = window.fairholm.scene; return sc.moving && sc.ghostAt(sc.cam.view.activeUnit ?? -1) !== null }, null, { timeout: 10000 }).then(() => true, () => false)
if (!started) {
  console.log('the hold did not start a move', JSON.stringify(m1), JSON.stringify(await page.evaluate(() => { const a = window.fairholm; return { active: a.scene.cam.view.activeUnit, sheet: a.sheet, view: a.scene.cam.view, moving: a.scene.moving, toast: document.querySelector('#toast')?.textContent, lander: a.state.units.find(u => u.kind === 'lander' && u.owner === 0)?.tile } })))
  await shot('debug-hold')
  process.exit(1)
}
await page.waitForTimeout(1500)
const mid1 = await midMove(m1.id)
await shot('02b-first-move-under-way')
note('first move, half way', mid1)
await page.evaluate(() => { window.fairholm.scene.holdMoveAt = null })
await waitMove()
const t2 = await seen()
note('first move, by a hold', { heading: off, ...m1, ...t2 })
await shot('02c-after-the-first-move')

// ---- 3: the move on which land is sighted -----------------------------------------------------
let sightedOn = t2.landKnown > 0 ? 1 : 0
let moveNo = 1
for (let k = 0; k < 3 && !sightedOn; k++) {
  await endTurn()
  await selectLander()
  const m = await sailHeading(toward)
  await page.waitForTimeout(300)
  const mid = await midMove(m.id)
  await waitMove()
  moveNo++
  const t = await seen()
  note(`move ${moveNo}, by the compass`, { ...m, mid, ...t })
  if (t.landKnown > 0) sightedOn = moveNo
}
note('land sighted on move', sightedOn)
await shot('03-land-sighted')

// ---- 4: two moves along the coast ---------------------------------------------------------------
// along the coast: the heading a player scouting for a site would take, the one whose turn's
// sailing keeps land in sight and shows the most ground nobody has seen
const alongHeading = () => page.evaluate(() => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const u = s.units.find(x => x.owner === 0 && x.kind === 'lander')
  const r = 3
  let best = null
  for (const d of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
    let ex = u.tile % w, ez = Math.floor(u.tile / w), end = null
    for (let k = 0; k < 6; k++) { ex += d[0]; ez += d[1]; if (ex < 0 || ez < 0 || ex >= w || ez >= h) break; const tt = s.world.tiles[ez * w + ex]; if (tt.explored && tt.terrain !== 'water') break; end = ez * w + ex }
    if (end === null) continue
    // the tiles a straight run to the end would see, and how many of them are new, and whether
    // known land stays in sight at the end
    const fresh = new Set()
    let x = u.tile % w, z = Math.floor(u.tile / w), landAtEnd = false
    for (;;) {
      x += d[0]; z += d[1]
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, zz = z + dz
        if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue
        if (!s.world.tiles[zz * w + xx].explored) fresh.add(zz * w + xx)
      }
      if (z * w + x === end) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx, zz = z + dz
          if (xx >= 0 && zz >= 0 && xx < w && zz < h && s.world.tiles[zz * w + xx].explored && s.world.tiles[zz * w + xx].terrain !== 'water') landAtEnd = true
        }
        break
      }
    }
    const score = fresh.size + (landAtEnd ? 1000 : 0)
    if (!best || score > best.score) best = { d, score, fresh: fresh.size, landAtEnd }
  }
  return best
})
const sites = []
for (let k = 0; k < 2; k++) {
  await endTurn()
  await selectLander()
  const pick = await alongHeading()
  const along = pick.d
  await page.evaluate(() => { window.fairholm.scene.holdMoveAt = 0.5 })
  const m = await sailHeading(along)
  await page.waitForFunction(() => { const sc = window.fairholm.scene; return sc.moving && sc.ghostAt(sc.cam.view.activeUnit ?? -1) !== null }, null, { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const mid = await midMove(m.id)
  await page.evaluate(() => { window.fairholm.scene.holdMoveAt = null })
  await waitMove()
  const t = await seen()
  const legal = await page.evaluate(async () => {
    // legal coastal ground a lander could beach beside, among what has been seen
    const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
    const wg = await import('/src/sim/worldgen.ts')
    const st = await import('/src/sim/settlement.ts')
    let n = 0, viable = 0
    for (let i = 0; i < s.world.tiles.length; i++) {
      const t = s.world.tiles[i]
      if (!t.explored || t.terrain === 'water' || !wg.isCoastal(w, h, s.world.tiles, i) || st.foundingProblem(s, i)) continue
      n++
      if (wg.landingViable(w, h, s.world.tiles, i)) viable++
    }
    return { legalCoastSeen: n, viableSeen: viable }
  })
  sites.push(legal)
  note(`along the coast ${k + 1}`, { ...m, newInSightExpected: pick.fresh, landStaysInSight: pick.landAtEnd, mid, ...t, ...legal })
  await shot(`04${'ab'[k]}-along-the-coast-${k + 1}`)
}

// ---- 5: the founding preview ---------------------------------------------------------------------
// the best legal shore beside the lander, tapped on the map as a player would; if the lander is not
// beside one, it sails to the best site in reach first
const besideShore = () => page.evaluate(async () => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const st = await import('/src/sim/settlement.ts')
  const auto = await import('/src/sim/autopilot.ts')
  const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')
  const shore = wg.neighbours8(w, h, lander.tile).filter(n => s.world.tiles[n].terrain !== 'water' && s.world.tiles[n].explored && !st.foundingProblem(s, n)).sort((x, y) => auto.siteScore(s, y) - auto.siteScore(s, x))[0]
  if (shore !== undefined) return { shore }
  // the best site seen, and the water beside it to hold
  const site = auto.bestLanding(s, lander.tile, 6)
  return site ? { site: site.tile, water: site.water } : null
})
let shoreAt = null
const near = await besideShore()
if (near?.shore !== undefined) shoreAt = near.shore
else if (near?.site !== undefined) {
  // a turn's sailing to the water beside the best site in sight, by a hold on it
  await endTurn()
  await selectLander()
  const held = await holdTile(near.water)
  await letGo()
  await waitMove()
  note('sailed to the best site seen, by a hold, let go', { water: near.water, plotted: held.plotted, movedOnHold: held.moved, onScreen: held.onScreen })
  shoreAt = (await besideShore())?.shore ?? null
}
let preview = null
if (shoreAt !== null) {
  await settle(300)
  await selectLander()
  // a hold on the shore beside the lander looks at founding there: the ring it would work is
  // painted on the map; letting go moves nothing, and Found here is on the card
  const p = await page.evaluate((t) => { const a = window.fairholm, w = a.state.world.width; return a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5) }, shoreAt)
  await finger.press(p[0], p[1])
  await finger.release()
  await settle(500)
  preview = await page.evaluate((t) => {
    const a = window.fairholm, w = a.state.world.width
    return { shore: [t % w, Math.floor(t / w)], focused: a.foundTarget === t, turn: a.state.turn, control: [...document.querySelectorAll('#queuebar .btn')].some(b => b.textContent === 'Found here'), words: document.querySelector('#queuebar .uc-line')?.textContent?.slice(0, 160) }
  }, shoreAt)
}
note('founding preview', preview)
await shot('05-founding-preview')

// ---- 6: a wave of the recall fleet, through the fog ---------------------------------------------
const founded = await page.evaluate(async () => {
  const a = window.fairholm
  const lander = a.state.units.find(u => u.owner === 0 && u.kind === 'lander')
  if (!lander || a.foundTarget === null) return null
  return a.found(lander.id, a.foundTarget)
})
note('founded', founded)
await settle(400)
const wave = await page.evaluate(async () => {
  const a = window.fairholm
  const s = a.state
  a.closeSheet()
  s.charters[0].signatories = [0, 1, 2, 3, 4, 5]
  for (const st of s.settlements) if (st.owner === 0) st.resolve = 1
  try { a.dispatch({ t: 'declare' }) } catch (e) { return { error: String(e) } }
  for (let i = 0; i < 40; i++) {
    const d = s.declaration
    if (d && d.waves.some(w => !w.landed && w.turnsToLand === 3)) break
    a.endTurn()
  }
  const d = s.declaration
  const wv = d && d.waves.find(w => !w.landed)
  if (!wv) return { declared: !!d, waves: d ? d.waves.length : 0 }
  const w = s.world.width
  const home = s.settlements.find(x => x.owner === 0)
  a.scene.glideTo(Math.floor((wv.at + home.tile) / 2), 32)
  return { turn: s.turn, turnsToLand: wv.turnsToLand, at: [wv.at % w, Math.floor(wv.at / w)], target: [wv.target % w, Math.floor(wv.target / w)] }
})
note('wave', wave)
await settle(500)
note('wave camera', await page.evaluate(() => { const a = window.fairholm; return { view: a.scene.cam.view, overhang: a.scene.cam.overhang, moving: a.scene.moving, held: a.sheetEl.classList.contains('held'), sheet: a.sheet } }))
await shot('06a-a-wave-splashes-down')
if (wave && wave.turnsToLand !== undefined) {
  for (let k = 1; k <= 3; k++) {
    await page.evaluate(() => window.fairholm.endTurn())
    await settle(300)
    const w2 = await page.evaluate(() => { const s = window.fairholm.state, d = s.declaration, w = s.world.width; const wv = d.waves[0]; return { turn: s.turn, turnsToLand: wv.turnsToLand, landed: wv.landed, at: [wv.at % w, Math.floor(wv.at / w)] } })
    note(`wave, ${k} turn${k > 1 ? 's' : ''} on`, w2)
    await shot(`06${'bcd'[k - 1]}-the-wave-${k}-turn${k > 1 ? 's' : ''}-on`)
  }
}

// ---- 7: a save from an earlier build is turned away in plain words ----------------------------------
await page.evaluate(() => {
  // the app saves when the page goes out of sight, which a reload is; hold that off so the old
  // save is what the boot finds
  window.fairholm.save = () => {}
  localStorage.clear()
  localStorage.setItem('fairholm.save.v1', JSON.stringify({ schemaVersion: 1, worldgenVersion: 1, seed: 'old', settings: {}, turn: 40 }))
})
await page.reload()
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.waitForTimeout(600)
const oldSave = await page.evaluate(() => ({
  turn: window.fairholm.state.turn, lander: !!window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'lander'),
  toast: document.querySelector('#toast')?.textContent || '', oldKeyLeft: localStorage.getItem('fairholm.save.v1') !== null,
}))
note('old save', oldSave)

const perf = await page.evaluate(() => ({ calls: window.fairholm.scene.renderer.info.render.calls, tris: window.fairholm.scene.renderer.info.render.triangles }))
note('draw', perf)
console.log(notes.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
