// The authoring mode (DECISIONS.md 161): from a hauler's sheet, Plan a haul circuit; taps on two
// settlements add the stops, the circuit shows on the map, More sets what the stops load and unload
// and the risk posture, Save sets the order and the hauler runs it from the next turn. On a fixed
// seed at 390 points wide, with the player's own gestures.
//
// Run with:  CHROMIUM=/opt/pw-browsers/chromium node scripts/phase5.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/phase5'
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/\.(png|jpg)$/.test(f)) unlinkSync(`${OUT}/${f}`)

const server = await createServer({ server: { port: 5193, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', e => problems.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()) })
const notes = []
const note = (k, v) => notes.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)

await page.goto('http://localhost:5193/')
await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
await page.evaluate(async () => {
  const a = window.fairholm
  const actions = await import('/src/sim/actions.ts')
  a.state = actions.createGame('fairholm-circuit', { size: 'small', shape: 'continent', firstGame: false }, 1)
  a.undoStack = []
  a.scene.cam.view.selectedTile = null
  a.scene.cam.view.activeUnit = null
  a.scene.rebuild(a.state, 'full')
  a.beginArrival()
  a.opening?.dismiss()
})
const settle = async (ms = 400) => { await page.waitForFunction(() => !window.fairholm.scene.moving && !window.fairholm.scene.cam.glideTarget, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms) }
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })
const screenOf = (tile) => page.evaluate((t) => { const a = window.fairholm, w = a.state.world.width; return a.scene.cam.worldToScreen((t % w) + 0.5, Math.floor(t / w) + 0.5) }, tile)
const tapAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(400); await settle(100) }
const card = () => page.evaluate(() => ({ title: document.querySelector('#queuebar .uc-title .t')?.textContent ?? null, line: document.querySelector('#queuebar .uc-line')?.textContent ?? null, actions: [...document.querySelectorAll('#queuebar .btn')].map(b => b.textContent) }))

// found, and a second settlement three tiles off, and a hauler at home
await page.evaluate(() => window.fairholm.autoplayOpening(10))
await settle(600)
await page.evaluate(() => window.fairholm.closeSheet())
const setup = await page.evaluate(async () => {
  const a = window.fairholm, s = a.state, w = s.world.width
  const settlement = await import('/src/sim/settlement.ts')
  const labour = await import('/src/sim/labour.ts')
  const units = await import('/src/sim/units.ts')
  const wg = await import('/src/sim/worldgen.ts')
  const home = s.settlements.find(x => x.owner === 0)
  const site = s.world.tiles.findIndex((t, i) => wg.isLand(t) && t.terrain !== 'mountain' && wg.dist(w, i, home.tile) === 3 && settlement.foundingProblem(s, i) === null)
  const far = settlement.foundSettlement(s, site, 0, [labour.makeColonist(s, 'free')])
  for (const t of [site, ...wg.neighbours8(w, s.world.height, site)]) s.world.tiles[t].explored = true
  home.stock.horses = 10
  home.buildings.storage = 2
  home.stock.linen = 80
  const hauler = units.makeUnit(s, 0, 'hauler', home.tile, labour.makeColonist(s, 'free'))
  s.units.push(hauler)
  a.scene.rebuild(s, 'full')
  a.refresh()
  return { home: home.tile, far: far.tile, farName: far.name, homeName: home.name, hauler: hauler.id }
})
await page.evaluate(({ tile }) => { window.fairholm.scene.glideTo(tile, 64) }, { tile: setup.home })
await settle(700)
// the hauler's sheet, and Plan a haul circuit
await page.evaluate((id) => { window.fairholm.select(id); window.fairholm.open({ kind: 'unit', id }) }, setup.hauler)
await settle(300)
const plan = page.locator('#sheet .btn', { hasText: 'Plan a haul circuit' })
const offered = await plan.count() > 0
if (offered) await plan.click()
await settle(400)
await shot('01-the-mode-begun')
const c0 = await card()
// tap home, then the far settlement
const p1 = await screenOf(setup.home)
await tapAt(p1[0], p1[1])
const p2 = await screenOf(setup.far)
// the far settlement may be under the card: the scene keeps it in view? bring it in by looking
if (p2[1] > 600 || p2[1] < 80) { await page.evaluate(({ tile }) => { window.fairholm.scene.glideTo(tile, 64) }, { tile: setup.far }); await settle(600) }
const p2b = await screenOf(setup.far)
await tapAt(p2b[0], p2b[1])
await settle(300)
const c2 = await card()
const circuitDrawn = await page.evaluate(() => { const svg = document.getElementById('route'); return svg && svg.style.display !== 'none' && svg.getAttribute('class') === 'circuit' && svg.querySelectorAll('.turn').length })
await shot('02-two-stops-tapped')
// More: load linen at home, unload at the far stop, posture run
const more = page.locator('#queuebar .btn', { hasText: 'More' })
if (await more.count()) await more.click()
await settle(300)
await page.locator('#sheet .line', { hasText: 'Linen' }).first().locator('button', { hasText: 'load' }).first().click().catch(() => {})
await page.locator('#sheet .chip', { hasText: 'run' }).first().click().catch(() => {})
await settle(200)
await shot('03-the-stops-detail')
await page.locator('#sheet .btn', { hasText: 'Save the circuit' }).click().catch(() => {})
await settle(400)
const after = await page.evaluate((id) => { const u = window.fairholm.state.units.find(x => x.id === id); return { order: u.order, cargo: u.cargo, tile: u.tile } }, setup.hauler)
// two turns on: it has loaded and gone
await page.evaluate(() => window.fairholm.endTurn()); await settle(900)
await page.evaluate(() => window.fairholm.endTurn()); await settle(900)
const later = await page.evaluate((id) => { const u = window.fairholm.state.units.find(x => x.id === id); return { cargo: u.cargo, tile: u.tile, next: u.order?.next } }, setup.hauler)
await shot('04-two-turns-on')
note('the authoring mode', { offered, begun: c0, afterTwoTaps: c2, circuitDrawn, saved: after, later, modeLeft: await page.evaluate(() => window.fairholm.authoring === null) })
console.log(notes.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 2000) : '\nno page errors')
await browser.close()
await server.close()
