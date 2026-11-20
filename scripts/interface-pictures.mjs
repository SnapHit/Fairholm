// The sheets, looked at on phones. Build brief docs/builds/interface-pictures.md, phases 0 and 5,
// and section 11a of the art direction brief: wherever the interface names something the player
// could see or hold, it shows it.
//
// Two games, both reached by play rather than laid out by hand, the way scripts/settlement-view.mjs
// makes them: an early one, founded by the competent policy (src/sim/policy.ts) and three turns on;
// and a mature one, the same game played on to turn 160, where the landing holds fourteen people, a
// school, a building under way, someone idle, three signatories and a market the standing orders
// have walked down. The mature game is then given what play left out and a phone would show: a varied
// store (one good spoiling, one nearly full, the rest plain), a wharf, two buildings queued, and a
// hauler equipped and loaded at the landing, all through the game's own actions where there is one.
// The same staging runs before and after a change, so the two sets differ only by the interface.
//
// It shoots every sheet the brief names at the owner's phone, 393 by 742 at a device pixel ratio of
// two; the settlement screen, the market and the build order again at 320 by 640, 844 by 390, with a
// 20 pixel root font, and at a device pixel ratio of three. Beside the pictures it times how long the
// settlement screen and the market take to open, and says for every picture whether anything reaches
// past the edge or has its words cut off.
//
// Run with:  CHROMIUM=/opt/pw-browsers/chromium node scripts/interface-pictures.mjs
//            PREFIX=before- names a set taken before a change
//            ONLY=market shoots only the pictures whose name contains that
//
// JPEG at quality 85, never PNG: pictures are kept in the repository. Slow under a software renderer,
// several minutes. Run it on its own, never beside another rig or the smoke test.

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots/interface-pictures'
const PREFIX = process.env.PREFIX || ''
const SEED = process.env.SEED || 'fairholm-interface-pictures'
const ONLY = process.env.ONLY || ''
const MATURE_TURN = 160
const PORT = 5207
mkdirSync(OUT, { recursive: true })

/** The views: the owner's phone carries every sheet; the others carry the three the brief names. */
const VIEWS = [
  { name: '393x742', width: 393, height: 742, dpr: 2, every: true },
  { name: '320x640', width: 320, height: 640, dpr: 2 },
  { name: '844x390', width: 844, height: 390, dpr: 2 },
  { name: 'large-type', width: 393, height: 742, dpr: 2, rootFont: 20 },
  { name: 'dpr3', width: 393, height: 742, dpr: 3 },
]

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const problems = []
const notes = []
const note = (line) => { notes.push(line); console.log(line) }

async function open(view) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', e => problems.push(`PAGEERROR ${view.name}: ${e.message}\n${(e.stack || '').split('\n').slice(0, 3).join('\n')}`))
  page.on('console', m => { if (m.type() === 'error') problems.push(`console.error ${view.name}: ${m.text()}`) })
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 60000 })
  if (view.rootFont) {
    await page.addStyleTag({ content: `html { font-size: ${view.rootFont}px }` })
    await page.evaluate(() => window.fairholm.layout())
  }
  await page.waitForTimeout(500)
  return { ctx, page }
}

/** Play a game to the point wanted, through the game's own actions, stage the mature one, and put it
 *  in front of the player as a resumed game would be. Deterministic: the seed and the play stream are
 *  fixed, and so is the staging. */
async function settle(page, which) {
  const facts = await page.evaluate(async ({ which, seed, turn }) => {
    const a = window.fairholm
    const actions = await import('/src/sim/actions.ts')
    const policy = await import('/src/sim/policy.ts')
    a.opening?.dismiss()
    const s = actions.createGame(seed, { size: 'small', shape: 'continent', difficulty: 'standard', firstGame: false }, 1)
    const home = () => s.settlements.find(x => x.owner === 0)
    const play = () => { policy.policyTurn(s, 'competent'); actions.applyAction(s, { t: 'endTurn' }) }
    for (let g = 0; g < 40 && !home(); g++) play()
    if (which === 'early') {
      for (let k = 0; k < 3; k++) play()
    } else {
      while (s.turn < turn) play()
      const st = home()
      // what play left out and a phone would show: a wharf, so the hulls sheet has a hull it can lay
      // down; a store with something in every state, spoiling, nearly full and plain
      st.buildings.wharf = Math.max(st.buildings.wharf, 1)
      Object.assign(st.stock, {
        timber: 64, ore: 36, metal: 18, tooling: 14, arms: 172, horses: 214, flax: 30, linen: 86,
        madder: 30, bloom: 25, attar: 41, cordage: 12, cores: 4, instruments: 3,
      })
      // a hauler, equipped from someone idle and loaded at the landing, through the game's actions
      const idle = st.colonists.findIndex(c => c.job.kind === 'idle')
      actions.applyAction(s, { t: 'equip', settlement: st.id, colonist: idle >= 0 ? idle : st.colonists.length - 1, as: 'hauler' })
      const hauler = s.units[s.units.length - 1]
      for (const [good, amount] of [['linen', 40], ['attar', 20], ['cordage', 12]]) actions.applyAction(s, { t: 'load', unit: hauler.id, good, amount })
      // two buildings queued behind the one under way
      actions.applyAction(s, { t: 'setBuildOrder', settlement: st.id, queue: [{ line: 'linenWorks', tier: 1 }, { line: 'wharf', tier: 2 }] })
      // someone idle at the head of the street: play usually leaves one, and if not the last to
      // arrive stands down
      if (!st.colonists.some(c => c.job.kind === 'idle')) actions.applyAction(s, { t: 'assignWorker', settlement: st.id, colonist: st.colonists.length - 1, job: { kind: 'idle' } })
    }
    const st = home()
    a.state = s
    a.undoStack = []
    a.route = null
    a.pick = null
    a.sheetHistory = []
    a.scene.cam.view.selectedTile = null
    a.scene.cam.view.activeUnit = null
    a.scene.rebuild(s, 'full')
    a.scene.cam.glideTarget = null
    a.scene.cam.stop()
    a.scene.cam.centreOn(st.tile, 44)
    a.closeSheet()
    a.refresh()
    const w = s.world.width
    // a worked tile of the ring with more than one thing to work it for, for who works a tile and
    // the tile's own sheet
    const labour = await import('/src/sim/labour.ts')
    const worked = st.colonists.filter(c => c.job.kind === 'tile' && c.job.tile !== st.tile).map(c => c.job.tile)
    const tile = worked.find(t => labour.tileOffers(s.world.tiles[t]).filter(g => labour.tileYield(s, t, g, null) > 0).length > 1) ?? worked[0] ?? st.tile + 1
    const hauler = s.units.find(u => u.owner === 0 && u.kind === 'hauler')
    return {
      turn: s.turn, st: st.id, name: st.name, people: st.colonists.length, tile, tileAt: [tile % w, Math.floor(tile / w)],
      idle: st.colonists.filter(c => c.job.kind === 'idle').length,
      buildings: Object.entries(st.buildings).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', '),
      building: st.building ? `${st.building.id.line} ${st.building.id.tier}` : 'nothing', queue: st.buildQueue.map(b => `${b.line} ${b.tier}`).join(', '),
      hauler: hauler?.id ?? null, cargo: hauler ? JSON.stringify(hauler.cargo) : '',
      signatories: s.charters[0].signatories.length,
      below: Object.entries(s.market.tables[0]).filter(([, e]) => e.price < Math.round(e.baseline)).map(([g, e]) => `${g} ${e.price}/${e.baseline}`).join(', '),
    }
  }, { which, seed: SEED, turn: MATURE_TURN })
  await idle(page)
  return facts
}

/** Wait until the renderer has nothing left to draw: no loop, no glide, no move. */
async function idle(page) {
  await page.waitForFunction(() => { const sc = window.fairholm.scene; return !sc.loopRunning && !sc.cam.glideTarget && !sc.moving }, null, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(600)
}

/** Whether anything in the sheet or a full screen reaches past the edge, or has its words cut off by
 *  a box that hides what spills out of it (a box that scrolls cuts nothing off; it can be scrolled). */
async function layout(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth
    const scrollsSideways = (el) => {
      for (let p = el.parentElement; p && p.id !== 'app'; p = p.parentElement) {
        const cs = getComputedStyle(p)
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true
      }
      return false
    }
    const hides = (cs) => ({ x: cs.overflowX === 'hidden' || cs.overflowX === 'clip', y: cs.overflowY === 'hidden' || cs.overflowY === 'clip' })
    const past = [], cut = []
    for (const el of document.querySelectorAll('#sheet.open .body *, #overlay.show *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (scrollsSideways(el)) continue
      if (r.right > W + 1 || r.left < -1) past.push(`${el.className?.baseVal ?? el.className ?? el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`)
      const words = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
      if (!words) continue
      const own = hides(getComputedStyle(el))
      let clipped = (own.x && el.scrollWidth > el.clientWidth + 1) || (own.y && el.scrollHeight > el.clientHeight + 1)
      for (let p = el.parentElement; p && !clipped && p.id !== 'sheet' && p.id !== 'overlay'; p = p.parentElement) {
        const h = hides(getComputedStyle(p))
        if (!h.x && !h.y) continue
        const q = p.getBoundingClientRect()
        if ((h.y && (r.bottom > q.bottom + 1 || r.top < q.top - 1)) || (h.x && (r.right > q.right + 1 || r.left < q.left - 1))) clipped = true
      }
      if (clipped) cut.push(`${el.className || el.tagName}: "${el.textContent.trim().slice(0, 28)}"`)
    }
    return { past: past.slice(0, 5), pastCount: past.length, cut: cut.slice(0, 6), cutCount: cut.length, pageScroll: document.documentElement.scrollWidth > W }
  })
}

const shotPath = (name) => `${OUT}/${PREFIX}${name}.jpg`

/** Open a sheet over the map, wait for it, shoot it, and say what the layout check found. */
async function shoot(page, name, spec, wait = 900) {
  if (ONLY && !name.includes(ONLY)) return
  await page.evaluate((spec) => { const a = window.fairholm; a.closeSheet(); if (spec) a.open(spec) }, spec)
  await page.waitForTimeout(wait)
  await idle(page)
  await page.screenshot({ path: shotPath(name), type: 'jpeg', quality: 85 })
  const l = await layout(page)
  note(`  ${name}: past the edge ${l.pastCount}${l.past.length ? ' (' + l.past.join('; ') + ')' : ''}; cut off ${l.cutCount}${l.cut.length ? ' (' + l.cut.join('; ') + ')' : ''}${l.pageScroll ? '; THE PAGE SCROLLS SIDEWAYS' : ''}`)
}

/** How long a sheet takes to open, the first time and then again with everything it draws already
 *  drawn once: building its elements, then laying them out (forced, so it is counted here and not in
 *  a frame), then to the second frame after the call, which is when it has been painted. That last is
 *  counted in whole frames, so it is also the number that says whether opening misses one. The map is
 *  let finish first, so none of its frames is counted. */
async function timeOpen(page, spec, times = 4) {
  const out = []
  for (let k = 0; k < times; k++) {
    await page.evaluate(() => window.fairholm.closeSheet())
    await idle(page)
    out.push(await page.evaluate(async (spec) => {
      const a = window.fairholm
      const frame = () => new Promise(r => requestAnimationFrame(() => r()))
      await frame(); await frame()
      const t0 = performance.now()
      a.open(spec)
      const built = performance.now() - t0
      document.querySelector('#sheet .body').getBoundingClientRect()
      const laid = performance.now() - t0
      await frame(); await frame()
      return { built: Math.round(built), laid: Math.round(laid), shown: Math.round(performance.now() - t0) }
    }, spec))
  }
  return out
}

const median = (xs) => { const v = [...xs].sort((p, q) => p - q); return v[Math.floor(v.length / 2)] }

/** The pictures each view takes after the mature game is made: every sheet on the owner's phone, and
 *  the settlement screen, the market and the build order on the others. */
function matureShots(view, f) {
  if (!view.every) {
    const tag = `${view.name}-`
    return [
      [`${tag}settlement`, { kind: 'settlement', id: f.st }, 3000],
      [`${tag}market`, { kind: 'market', settlement: f.st }],
      [`${tag}build`, { kind: 'build', settlement: f.st }],
      ...(view.name === 'dpr3' ? [[`${tag}good-madder`, { kind: 'goodActions', settlement: f.st, good: 'madder' }]] : []),
    ]
  }
  return [
    ['01-map-hud', null, 400],
    ['02-settlement', { kind: 'settlement', id: f.st }, 3000],
    ['03-queue', { kind: 'queue' }],
    ['04-dispatch', { kind: 'dispatch' }],
    ['05-market', { kind: 'market', settlement: f.st }],
    ['06-good-madder', { kind: 'goodActions', settlement: f.st, good: 'madder' }],
    ['07-consign-linen', { kind: 'consign', settlement: f.st, good: 'linen' }],
    ['08-buy-tooling', { kind: 'buy', settlement: f.st, good: 'tooling' }],
    ['09-build', { kind: 'build', settlement: f.st }],
    ['10-hulls', { kind: 'hulls', settlement: f.st }],
    ['11-equip', { kind: 'equip', settlement: f.st }],
    ['12-school', { kind: 'educate', settlement: f.st }],
    ['13-works-building', { kind: 'assignBuilding', settlement: f.st, line: 'carpenter' }],
    ['14-works-tile', { kind: 'assignTile', settlement: f.st, tile: f.tile }],
    ['15-workers', { kind: 'workers', settlement: f.st, colonist: 0 }],
    ['16-detail', { kind: 'settlementDetail', id: f.st }],
    ...(f.hauler !== null ? [['17-hauler', { kind: 'unit', id: f.hauler }], ['18-cargo', { kind: 'cargo', id: f.hauler }]] : []),
    ['19-tile', { kind: 'tile', tile: f.tile }],
    ['20-declaration', { kind: 'declaration' }],
    ['21-signatories', { kind: 'signatories' }],
    ['22-rivals', { kind: 'rivals' }],
    ['23-predecessor', { kind: 'predecessor', id: 0 }],
    ['24-orders', { kind: 'orders', settlement: f.st }],
    ['25-glossary-word', { kind: 'glossary', key: 'word' }],
  ]
}

const wanted = (name) => !ONLY || name.includes(ONLY)

for (const view of VIEWS) {
  // a view none of whose pictures are wanted is not opened at all
  const names = view.every ? ['early', 'timing', '26-resume', ...matureShots(view, { st: 0, hauler: 0 }).map(x => x[0])] : matureShots(view, { st: 0 }).map(x => x[0])
  if (!names.some(wanted)) continue
  const { ctx, page } = await open(view)
  if (view.every && wanted('early')) {
    const e = await settle(page, 'early')
    note(`${view.name} early: turn ${e.turn}, ${e.name}, ${e.people} people (${e.idle} idle); ${e.buildings}`)
    await shoot(page, 'early-map-hud', null, 400)
    await shoot(page, 'early-settlement', { kind: 'settlement', id: e.st }, 3000)
  }
  const f = await settle(page, 'mature')
  note(`${view.name} mature: turn ${f.turn}, ${f.name}, ${f.people} people (${f.idle} idle); ${f.buildings}; building ${f.building}, queued ${f.queue}; hauler ${f.hauler} carrying ${f.cargo}; ${f.signatories} signatories; below the baseline: ${f.below}; the tile ${f.tileAt.join(', ')}`)
  if (view.every && wanted('timing')) {
    const settlement = await timeOpen(page, { kind: 'settlement', id: f.st })
    const market = await timeOpen(page, { kind: 'market', settlement: f.st })
    const say = (t) => {
      const warm = t.slice(1)
      return `${t[0].shown} ms to paint the first time (${t[0].built} to build, ${t[0].laid} with layout), then ${median(warm.map(x => x.shown))} ms (${median(warm.map(x => x.built))} to build, ${median(warm.map(x => x.laid))} with layout)`
    }
    note(`  timing: the settlement screen opens in ${say(settlement)}; the market in ${say(market)}`)
  }
  for (const [name, spec, wait] of matureShots(view, f)) await shoot(page, name, spec, wait)
  if (view.every && wanted('26-resume')) {
    // the resume card, as a game opened again shows it
    await page.evaluate(() => { const a = window.fairholm; a.closeSheet(); a.showReturnScreen() })
    await page.waitForTimeout(600)
    await page.screenshot({ path: shotPath('26-resume'), type: 'jpeg', quality: 85 })
    const l = await layout(page)
    note(`  26-resume: past the edge ${l.pastCount}; cut off ${l.cutCount}${l.cut.length ? ' (' + l.cut.join('; ') + ')' : ''}`)
    await page.evaluate(() => window.fairholm.hideScreen())
  }
  await ctx.close()
}

console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
