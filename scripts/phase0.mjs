// Look at two things from the reachability run's housekeeping phase. Feel brief section 3: no unit
// is ever fully hidden, so a unit standing behind a building shows through it as a faint silhouette
// in its owner's colour; and the passenger shortcut, where a hold on the shore beside the chosen
// lander puts Found here and Go ashore on the card, two touches from hold to landing. On a fixed
// seed, at 390 points wide, with the player's own gestures.
//
// Run with:  node scripts/phase0.mjs
//            OUT=shots/phase0 SEED=fairholm-opening CHROMIUM=/opt/pw-browsers/chromium node scripts/phase0.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/phase0'
const SEED = process.env.SEED || 'fairholm-opening'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/\.(png|jpg)$/.test(f)) unlinkSync(`${OUT}/${f}`)

const server = await createServer({ server: { port: 5192, strictPort: true }, logLevel: 'silent' })
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
const note = (k, v) => { const l = `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`; notes.push(l); if (process.env.VERBOSE) console.log(l) }

await page.goto('http://localhost:5192/')
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

const HOLD_MS = 1500
const settle = async (ms = 500) => {
  await page.waitForFunction(() => !window.fairholm.scene.moving && !window.fairholm.scene.cam.glideTarget, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })
const screenOf = (tile) => page.evaluate((t) => { const a = window.fairholm, w = a.state.world.width; return a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5) }, tile)
const tapAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(450); await settle(100) }
const holdAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(HOLD_MS); await page.mouse.up(); await page.waitForTimeout(300); await settle(300) }
const active = () => page.evaluate(() => window.fairholm.scene.cam.view.activeUnit)
const card = () => page.evaluate(() => ({
  carded: document.getElementById('queuebar').classList.contains('carded'),
  title: document.querySelector('#queuebar .uc-title .t')?.textContent ?? null,
  line: document.querySelector('#queuebar .uc-line')?.textContent ?? null,
  actions: [...document.querySelectorAll('#queuebar .btn')].map(b => b.textContent),
}))
const pictureOf = (id) => page.evaluate((id) => {
  const a = window.fairholm, sc = a.scene, z = sc.cam.view.zoom
  const p = sc.unitPictures.get(id), at = sc.unitPositions.get(id)
  if (!p || !at) return null
  const [sx, sy] = sc.cam.worldToScreen(at[0], at[1])
  return { x0: sx + p.box[0] * z, y0: sy + p.box[1] * z, x1: sx + p.box[2] * z, y1: sy + p.box[3] * z }
}, id)
const look = async (tile, zoom) => { await page.evaluate(({ tile, zoom }) => { window.fairholm.scene.glideTo(tile, zoom) }, { tile, zoom }); await settle(700) }
const landerId = await page.evaluate(() => window.fairholm.state.units.find(u => u.owner === 0 && u.kind === 'lander').id)

// ---- 1: the passenger shortcut, from hold to landing ---------------------------------------------
// sail the lander in beside a shore by the machine's own opening, stopping short of founding
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
let pic = await pictureOf(landerId)
if ((await active()) !== landerId) await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
await settle(400)
const shore = await page.evaluate(async (id) => {
  const a = window.fairholm, s = a.state, w = s.world.width, h = s.world.height
  const wg = await import('/src/sim/worldgen.ts')
  const u = s.units.find(x => x.id === id)
  const ok = n => s.world.tiles[n].terrain !== 'water' && s.world.tiles[n].terrain !== 'mountain' && s.world.tiles[n].explored
  return wg.neighbours8(w, h, u.tile).find(n => ok(n) && n !== a.foundTarget) ?? wg.neighbours8(w, h, u.tile).find(ok)
}, landerId)
const sp = await screenOf(shore)
const aboardBefore = await page.evaluate((id) => window.fairholm.state.units.find(u => u.id === id).aboard.length, landerId)
await holdAt(sp[0], sp[1])
const heldCard = await card()
await shot('01-shore-held-with-the-lander-chosen')
const goAshore = page.locator('#queuebar .btn', { hasText: 'Go ashore' })
const offered = await goAshore.count() > 0
if (offered) await goAshore.click()
await settle(600)
const walker = await active()
const after = await page.evaluate(({ id, w }) => {
  const s = window.fairholm.state
  return { aboard: s.units.find(u => u.id === id)?.aboard.length ?? null, walker: s.units.find(u => u.id === w) ? { kind: s.units.find(u => u.id === w).kind, tile: s.units.find(u => u.id === w).tile } : null }
}, { id: landerId, w: walker })
await shot('02-after-go-ashore')
note('the passenger shortcut', { held: shore, card: heldCard, offered, aboardBefore, after, twoTouches: offered && after.aboard === aboardBefore - 1 && after.walker?.tile === shore, cardAfter: await card() })

// ---- 2: a unit standing behind a building ------------------------------------------------------
// found, then put a militia on the tile just north of the settlement, where the hall's picture
// stands in front of it
const founded = await page.evaluate(() => window.fairholm.autoplayOpening(10))
await settle(600)
await page.evaluate(() => window.fairholm.closeSheet())
const setup = await page.evaluate(async () => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const units = await import('/src/sim/units.ts')
  const labour = await import('/src/sim/labour.ts')
  const home = s.settlements.find(x => x.owner === 0)
  // the tile north of the settlement, and the one north east as a second try
  const north = home.tile - w
  const tile = s.world.tiles[north].terrain !== 'water' && s.world.tiles[north].terrain !== 'mountain' ? north : home.tile - w + 1
  const militia = units.makeUnit(s, 0, 'militia', tile, labour.makeColonist(s, 'free'))
  s.units.push(militia)
  s.world.tiles[tile].explored = true
  a.scene.rebuild(s, 'dynamic')
  a.refresh()
  return { militia: militia.id, tile, home: home.tile }
})
await look(setup.home, 96)
await page.evaluate(() => window.fairholm.deselect())
await settle(400)
const covered = await page.evaluate((id) => {
  // is the figure's box overlapped by a building box drawn in front of it, and is the silhouette mesh up
  const sc = window.fairholm.scene
  const p = sc.unitPictures.get(id), at = sc.unitPositions.get(id)
  if (!p || !at) return { drawn: false }
  const box = [at[0] + p.box[0], at[1] + p.box[1], at[0] + p.box[2], at[1] + p.box[3]]
  const front = sc.settlementPictures.filter(b => b.foot > at[1] && !(b.box[2] <= box[0] || b.box[0] >= box[2] || b.box[3] <= box[1] || b.box[1] >= box[3]))
  const sil = sc.scene.children.find(o => o.renderOrder === -0.9)
  return { drawn: true, buildingsInFront: front.length, silhouetteInstances: sil ? sil.count : 0 }
}, setup.militia)
await shot('03-militia-behind-the-hall')
pic = await pictureOf(setup.militia)
await tapAt((pic.x0 + pic.x1) / 2, (pic.y0 + pic.y1) / 2)
await settle(300)
await shot('04-the-same-militia-chosen')
note('a unit behind a building', { founded, ...setup, ...covered, chosenByTap: (await active()) === setup.militia })

console.log(notes.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
