// Look at the opening. Setting brief section 7, onboarding brief section 2, art brief section 10a.
//
// A fresh game on a fixed seed, shot at the moments the prompt asks to see: turn one with the five
// lines over the haze; the same shot after the first tap; the voyage under way; the turn land is
// sighted; the founding control with its preview; the turn after founding; a colonist founding
// inland later; and a wave of the recall fleet approaching through the fog. The pictures are for a
// person to look at; the numbers printed beside them are what can be measured.
//
// Run with:  node scripts/opening.mjs
//            OUT=shots/opening SEED=fairholm-opening CHROMIUM=/opt/pw-browsers/chromium node scripts/opening.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/opening'
const SEED = process.env.SEED || 'fairholm-opening'
mkdirSync(OUT, { recursive: true })

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
// the fixed seed, through the same path a new game takes
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
  await page.waitForFunction(() => !window.fairholm.scene.loopRunning, null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
// jpeg, as the gallery's pictures are: these are for looking at, and thirteen of them at a phone's
// two times resolution are ten megabytes as png
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })

// ---- 1: turn one, the lines ---------------------------------------------------------------------
// the lines arrive one every two seconds; the fifth is in a little after eight and a half
await page.waitForTimeout(9600)
const t1 = await page.evaluate(() => {
  const s = window.fairholm.state
  const lander = s.units.find(u => u.owner === 0 && u.kind === 'lander')
  const w = s.world.width
  return {
    turn: s.turn, lines: document.querySelectorAll('#opening .line.in').length,
    explored: s.world.tiles.filter(t => t.explored).length, of: s.world.tiles.length,
    lander: lander ? [lander.tile % w, Math.floor(lander.tile / w)] : null,
    otherUnitsDrawn: [...window.fairholm.scene.unitPositions.keys()].filter(id => s.units.find(u => u.id === id)?.owner !== 0).length,
    settlementsDrawn: window.fairholm.scene.settlements ? window.fairholm.scene.settlements.children.reduce((a, g) => a + g.children.length, 0) : 0,
    steaming: window.fairholm.scene.loopRunning,
  }
})
note('turn one', t1)
await shot('01-turn-one-the-lines')

// ---- 2: the first tap -------------------------------------------------------------------------
const t0 = Date.now()
await page.touchscreen.tap(195, 560)
let heard = null
for (let i = 0; i < 25 && heard === null; i++) {
  await page.waitForTimeout(200)
  const m = await page.evaluate(() => ({ pos: window.fairholm.music.position, name: window.fairholm.music.trackName }))
  if (m.pos > 0.2) heard = { ms: Date.now() - t0, ...m }
}
await page.waitForTimeout(1100)
const t2 = await page.evaluate(() => ({ linesLeft: !!document.querySelector('#opening'), showing: window.fairholm.opening?.showing, sheet: window.fairholm.sheet.kind }))
note('after the first tap', { ...t2, music: heard })
await shot('02-after-the-first-tap')

// ---- 3 and 4: the voyage, a turn at a time, until land is sighted ----------------------------
const sail = async () => page.evaluate(async () => {
  const a = window.fairholm
  const auto = await import('/src/sim/autopilot.ts')
  let guard = 0
  for (;;) {
    const act = auto.openingAction(a.state)
    if (!act || act.t === 'found' || guard++ > 4) return act ? act.t : 'none'
    a.dispatch(act)
  }
})
const landInSight = () => page.evaluate(async () => {
  const a = window.fairholm
  const fog = await import('/src/sim/fog.ts')
  const mask = fog.sightMask(a.state)
  let land = 0
  for (let i = 0; i < mask.length; i++) if (mask[i] && a.state.world.tiles[i].terrain !== 'water') land++
  const lander = a.state.units.find(u => u.owner === 0 && u.kind === 'lander')
  return { land, turn: a.state.turn, lander: lander ? lander.tile : null }
})
let sighted = null
let midShot = false
for (let turn = 0; turn < 12 && !sighted; turn++) {
  const before = await landInSight()
  if (before.land > 0 && before.turn > 1) { sighted = before; break }
  const did = await sail()
  await page.evaluate(() => { const a = window.fairholm; const l = a.state.units.find(u => u.owner === 0 && u.kind === 'lander'); if (l) { a.scene.cam.view.activeUnit = l.id; a.scene.cam.view.selectedTile = l.tile; a.open({ kind: 'unit', id: l.id }); a.scene.glideTo(l.tile, 44) } })
  await settle(400)
  const after = await landInSight()
  // the voyage under way: the first turn's sailing, whatever it brought into view
  if (!midShot && did === 'moveUnit') { midShot = true; note('mid voyage', after); await shot('03-mid-voyage') }
  if (after.land > 0) { sighted = after; break }
  await page.evaluate(() => window.fairholm.endTurn())
  await settle(300)
}
note('land sighted', sighted)
if (!midShot) await shot('03-mid-voyage')
await shot('04-land-sighted')

// ---- 5: the founding preview ---------------------------------------------------------------------
// sail on until the shore is beside the lander, then look at founding there
let preview = null
for (let turn = 0; turn < 10 && !preview; turn++) {
  const act = await page.evaluate(async () => { const auto = await import('/src/sim/autopilot.ts'); return auto.openingAction(window.fairholm.state) })
  if (act && act.t === 'found') {
    preview = await page.evaluate((act) => {
      const a = window.fairholm
      a.scene.cam.view.activeUnit = act.unit
      a.open({ kind: 'unit', id: act.unit })
      // the app frames the shore above the sheet by itself
      a.setFoundTarget(act.tile)
      return { tile: act.tile, turn: a.state.turn, control: !!document.querySelector('#sheet .found .btn.primary'), words: document.querySelector('#sheet .found .about')?.textContent?.slice(0, 160) }
    }, act)
    break
  }
  await sail()
  await page.evaluate(() => window.fairholm.endTurn())
  await settle(200)
}
note('founding preview', preview)
await settle(400)
await shot('05-founding-preview')
// and a refusal, for the record: the preview on a water tile and a mountain if one is in sight
const refusals = await page.evaluate(async () => {
  const a = window.fairholm
  const st = await import('/src/sim/settlement.ts')
  const s = a.state
  const water = s.world.tiles.findIndex(t => t.terrain === 'water' && t.explored)
  const mountain = s.world.tiles.findIndex(t => t.terrain === 'mountain' && t.explored)
  return { water: water >= 0 ? st.foundingProblem(s, water) : 'none in sight', mountain: mountain >= 0 ? st.foundingProblem(s, mountain) : 'none in sight' }
})
note('refusals', refusals)

// ---- 6: the turn after founding -------------------------------------------------------------------
const founded = await page.evaluate(async () => {
  const a = window.fairholm
  const auto = await import('/src/sim/autopilot.ts')
  const act = auto.openingAction(a.state)
  if (!act || act.t !== 'found') return null
  const ok = await a.found(act.unit, act.tile)
  return { ok, turn: a.state.turn, name: a.state.settlements.find(x => x.owner === 0)?.name, boat: a.state.units.filter(u => u.owner === 0).map(u => u.kind) }
})
note('founded', founded)
await settle(300)
await shot('06a-founded-the-settlement-screen')
await page.evaluate(() => { window.fairholm.closeSheet(); window.fairholm.endTurn() })
await settle(500)
const t6 = await page.evaluate(() => {
  const a = window.fairholm
  const home = a.state.settlements.find(x => x.owner === 0)
  const w = a.state.world.width
  const water = [home.tile - 1, home.tile + 1, home.tile - w, home.tile + w, home.tile - w - 1, home.tile - w + 1, home.tile + w - 1, home.tile + w + 1].filter(t => a.state.world.tiles[t] && a.state.world.tiles[t].terrain === 'water')
  return { turn: a.state.turn, pop: home.colonists.length, waterInRing: water.length, wharf: home.buildings.wharf, lander: a.state.units.some(u => u.owner === 0 && u.kind === 'lander'), lighter: a.state.units.some(u => u.owner === 0 && u.kind === 'lighter') }
})
note('the turn after founding', t6)
await shot('06-the-turn-after-founding')

// ---- 7: a colonist founding inland --------------------------------------------------------------
const inland = await page.evaluate(async () => {
  const a = window.fairholm
  const st = await import('/src/sim/settlement.ts')
  const wg = await import('/src/sim/worldgen.ts')
  const s = a.state, w = s.world.width, h = s.world.height
  const home = s.settlements.find(x => x.owner === 0)
  // a colonist off the roster, walked to legal inland ground three tiles off
  a.dispatch({ t: 'equip', settlement: home.id, colonist: 0, as: 'colonist' })
  const u = s.units.find(x => x.owner === 0 && x.kind === 'colonist')
  let target = -1
  for (let r = 3; r <= 5 && target < 0; r++) {
    for (let dz = -r; dz <= r && target < 0; dz++) for (let dx = -r; dx <= r && target < 0; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
      const x = (home.tile % w) + dx, z = Math.floor(home.tile / w) + dz
      if (x < 0 || z < 0 || x >= w || z >= h) continue
      const t = z * w + x
      if (!wg.isLand(s.world.tiles[t]) || wg.isCoastal(w, h, s.world.tiles, t)) continue
      if (st.foundingProblem(s, t) !== null) continue
      target = t
    }
  }
  if (target < 0) return { target }
  // walk there, as many turns as it takes
  for (let i = 0; i < 12 && u.tile !== target; i++) {
    const units = await import('/src/sim/units.ts')
    const path = units.findPath(s, u, u.tile, target)
    if (!path) return { target, noPath: true }
    a.dispatch({ t: 'moveUnit', unit: u.id, path })
    if (u.tile !== target) a.endTurn()
  }
  a.scene.cam.view.activeUnit = u.id
  a.scene.cam.view.selectedTile = u.tile
  a.open({ kind: 'unit', id: u.id })
  a.setFoundTarget(u.tile)
  return { target, at: u.tile, turn: s.turn, problem: st.foundingProblem(s, u.tile), control: !!document.querySelector('#sheet .found .btn.primary') }
})
note('inland colonist', inland)
await settle(400)
await shot('07a-inland-founding-preview')
const foundedInland = await page.evaluate(async () => {
  const a = window.fairholm
  const u = a.state.units.find(x => x.owner === 0 && x.kind === 'colonist')
  if (!u) return null
  const ok = await a.found(u.id)
  return { ok, settlements: a.state.settlements.filter(x => x.owner === 0).map(x => x.name) }
})
note('founded inland', foundedInland)
await settle(400)
await shot('07-a-later-colonist-founding-inland')

// ---- 8: a wave of the recall fleet, through the fog ---------------------------------------------
const wave = await page.evaluate(async () => {
  const a = window.fairholm
  const s = a.state
  a.closeSheet()
  // declare, and run until a wave is at sea
  s.charters[0].signatories = [0, 1, 2, 3, 4, 5]
  for (const st of s.settlements) if (st.owner === 0) st.resolve = 1
  try { a.dispatch({ t: 'declare' }) } catch (e) { return { error: String(e) } }
  for (let i = 0; i < 40; i++) {
    const d = s.declaration
    const at = d && d.waves.find(w => !w.landed)
    if (at && at.turnsToLand < 3) break
    a.endTurn()
  }
  const d = s.declaration
  const wv = d && d.waves.find(w => !w.landed)
  if (!wv) return { declared: !!d, waves: d ? d.waves.length : 0 }
  const w = s.world.width
  const home = s.settlements.find(x => x.owner === 0)
  a.scene.glideTo(Math.floor((wv.at + home.tile) / 2), 32)
  return { turn: s.turn, turnsToLand: wv.turnsToLand, at: [wv.at % w, Math.floor(wv.at / w)], target: [wv.target % w, Math.floor(wv.target / w)], explored: s.world.tiles[wv.at].explored }
})
note('wave', wave)
await settle(500)
await shot('08-a-wave-approaching-through-fog')
if (wave && wave.turnsToLand !== undefined) {
  for (let k = 1; k <= 2; k++) {
    await page.evaluate(() => window.fairholm.endTurn())
    await settle(300)
    const w2 = await page.evaluate(() => { const d = window.fairholm.state.declaration; const wv = d.waves.find(x => !x.landed) || d.waves[d.waves.length - 1]; return { turn: window.fairholm.state.turn, turnsToLand: wv.turnsToLand, landed: wv.landed } })
    note(`wave, ${k} turn later`, w2)
    await shot(`08${'bc'[k - 1]}-the-wave-${k}-turn-on`)
  }
}

// ---- 9: a save from an earlier build is turned away in plain words --------------------------------
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
await shot('09-an-old-save-turned-away')

const perf = await page.evaluate(() => ({ calls: window.fairholm.scene.renderer.info.render.calls, tris: window.fairholm.scene.renderer.info.render.triangles }))
note('draw', perf)
console.log(notes.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
