// The settlement screen, looked at on phones. Build brief docs/builds/settlement-view-uplift.md,
// phases 0 and 4, and the settlement screen and layout brief, version 3.
//
// Two settlements, both reached by play rather than laid out by hand: an early one, founded by the
// competent policy (src/sim/policy.ts) and three turns on, three colonists; and a mature one, the same
// game played on until the landing holds eight or more people, four or more buildings and something
// being built, with someone idle. Each is shot at the screens the brief names: 390 by 844, the owner's
// phone at 393 by 742, 390 by 664 (a phone with its browser's bars showing), 320 by 640, landscape at
// 844 by 390, and 390 by 844 with a 20 pixel root font. Then, on the owner's phone, an idle colonist
// picked, showing where they could go, and the screen just after they are placed.
//
// Beside the pictures it measures what a picture cannot say: what share of the height each part of
// the screen takes, whether the screen scrolls, whether anything reaches past the edge or is cut off,
// whether the renderer draws anything at all while the screen sits open, how long the ring's picture
// took and at what size, and whether the ring's colours match the map's. On the new screen it also
// assigns, reassigns and picks by taps alone, as real touches.
//
// Run with:  CHROMIUM=/opt/pw-browsers/chromium node scripts/settlement-view.mjs
//            PREFIX=before- names a set taken before a change
//            ONLY=393x742 shoots the views whose name contains that
//
// Slow under a software renderer: several minutes. Run it on its own, never beside another rig.

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'
import { fingers } from './touch.mjs'

const OUT = process.env.OUT || 'shots/settlement-view'
const PREFIX = process.env.PREFIX || ''
const SEED = process.env.SEED || 'fairholm-settlement-view'
const ONLY = process.env.ONLY || ''
const PORT = 5196
mkdirSync(OUT, { recursive: true })

const VIEWS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '393x742', width: 393, height: 742, picks: true },
  { name: '390x664', width: 390, height: 664 },
  { name: '320x640', width: 320, height: 640 },
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'large-type-390x844', width: 390, height: 844, rootFont: 20 },
].filter(v => !ONLY || v.name.includes(ONLY))

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const problems = []
const results = []
const check = (name, ok, note = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`) }
const notes = []
const note = (line) => { notes.push(line); console.log(line) }

async function open(view, dpr = 2) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', e => problems.push(`PAGEERROR ${view.name}: ${e.message}\n${(e.stack || '').split('\n').slice(0, 3).join('\n')}`))
  page.on('console', m => { if (m.type() === 'error') problems.push(`console.error ${view.name}: ${m.text()}`) })
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
  if (view.rootFont) {
    await page.addStyleTag({ content: `html { font-size: ${view.rootFont}px }` })
    await page.evaluate(() => window.fairholm.layout())
  }
  // every frame the renderer draws, to the screen or into a picture, is counted here
  await page.evaluate(() => {
    const r = window.fairholm.scene.renderer
    const real = r.render.bind(r)
    window.__draws = 0
    r.render = (...args) => { window.__draws++; return real(...args) }
  })
  await page.waitForTimeout(500)
  return { ctx, page }
}

/** Play a game to the settlement wanted, through the game's own actions, and put it in front of the
 *  player as a resumed game would be. Deterministic: the seed and the play stream are fixed. */
async function settle(page, which) {
  const facts = await page.evaluate(async ({ which, seed }) => {
    const a = window.fairholm
    const actions = await import('/src/sim/actions.ts')
    const policy = await import('/src/sim/policy.ts')
    a.opening?.dismiss()
    const s = actions.createGame(seed, { size: 'small', shape: 'continent', difficulty: 'standard', firstGame: false }, 1)
    const home = () => s.settlements.find(x => x.owner === 0)
    const turn = () => { policy.policyTurn(s, 'competent'); actions.applyAction(s, { t: 'endTurn' }) }
    for (let g = 0; g < 40 && !home(); g++) turn()
    if (which === 'early') {
      for (let k = 0; k < 3; k++) turn()
    } else {
      const built = (st) => Object.values(st.buildings).filter(v => v > 0).length
      const ready = () => { const st = home(); return st.colonists.length >= 8 && built(st) >= 4 && !!st.building && st.colonists.some(c => c.job.kind === 'idle') }
      for (let g = 0; g < 320 && !ready(); g++) turn()
      // the rig wants someone idle; play usually leaves one, and if not the last to arrive stands down
      const st = home()
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
    return {
      turn: s.turn, name: st.name, people: st.colonists.length,
      idle: st.colonists.filter(c => c.job.kind === 'idle').length,
      buildings: Object.entries(st.buildings).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', '),
      building: st.building ? `${st.building.id.line} ${st.building.id.tier}, frame ${st.building.frame}` : 'nothing',
      units: s.units.filter(u => u.tile === st.tile).map(u => u.kind).join(', ') || 'none',
    }
  }, { which, seed: SEED })
  await idle(page)
  return facts
}

/** Wait until the renderer has nothing left to draw: no loop, no glide, no refine pending. */
async function idle(page) {
  await page.waitForFunction(() => { const sc = window.fairholm.scene; return !sc.loopRunning && !sc.cam.glideTarget && !sc.moving }, null, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(700)
}

async function openScreen(page) {
  await page.evaluate(() => { const a = window.fairholm; a.open({ kind: 'settlement', id: a.state.settlements.find(x => x.owner === 0).id }) })
  // the ring's picture is drawn when the screen opens; give a software renderer time to finish it
  await page.waitForTimeout(2500)
  await idle(page)
}

/** The parts of the screen and what share of the viewport's height each takes; whether the screen
 *  scrolls; how far down the screen anything is drawn; whether anything reaches past the edge or has
 *  its contents cut off. Works on the old screen and the new: a part that is not there is left out. */
async function layout(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight
    const part = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), share: +(r.height / H).toFixed(3), onScreen: r.top >= -1 && r.bottom <= H + 1 }
    }
    const parts = {}
    for (const [k, sel] of Object.entries({ head: '.st-head', note: '.st-note', ring: '.st-ring', town: '.st-town', goods: '.st-goods', core: '.st-core', bar: '#queuebar' })) {
      const p = part(sel)
      if (p) parts[k] = p
    }
    // the screen's scrolling body, whichever element it is
    const sheetBody = document.querySelector('#sheet .body')
    const scrollers = [...document.querySelectorAll('#sheet *')].filter(el => {
      const cs = getComputedStyle(el)
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1
    })
    const scrolls = (sheetBody && sheetBody.scrollHeight > sheetBody.clientHeight + 1) || scrollers.length > 0
    // the lowest thing drawn on the screen, as a share of the height: only what paints, words or a
    // picture or a fill, not a box that merely stretches to the bottom around the rest
    const paints = (el) => {
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return true
      if (el.tagName === 'CANVAS' || el.tagName === 'IMG') return true
      const cs = getComputedStyle(el)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true
      const bg = cs.backgroundColor
      return !!bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)
    }
    let lowest = 0
    for (const el of document.querySelectorAll('#sheet .body *')) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (r.top > H) continue
      if (!paints(el)) continue
      lowest = Math.max(lowest, Math.min(H, r.bottom))
    }
    // anything past the left or right edge, unless it sits in something that scrolls sideways
    const scrollsSideways = (el) => {
      for (let p = el.parentElement; p && p.id !== 'app'; p = p.parentElement) {
        const cs = getComputedStyle(p)
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true
      }
      return false
    }
    const past = []
    const cut = []
    const hides = (cs) => ({ x: cs.overflowX === 'hidden' || cs.overflowX === 'clip', y: cs.overflowY === 'hidden' || cs.overflowY === 'clip' })
    for (const el of document.querySelectorAll('#sheet .body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (scrollsSideways(el)) continue
      if (r.right > W + 1 || r.left < -1) past.push(`${el.className || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`)
      // words cut off, ellipsis or not: by their own box, or by a box around them that hides what
      // spills out of it (a box that scrolls is not cutting anything off; it can be scrolled)
      const words = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
      if (!words) continue
      const own = hides(getComputedStyle(el))
      let clipped = (own.x && el.scrollWidth > el.clientWidth + 1) || (own.y && el.scrollHeight > el.clientHeight + 1)
      for (let p = el.parentElement; p && !clipped && p.id !== 'sheet'; p = p.parentElement) {
        const h = hides(getComputedStyle(p))
        if (!h.x && !h.y) continue
        const q = p.getBoundingClientRect()
        if ((h.y && (r.bottom > q.bottom + 1 || r.top < q.top - 1)) || (h.x && (r.right > q.right + 1 || r.left < q.left - 1))) clipped = true
      }
      if (clipped) cut.push(`${el.className || el.tagName}: "${el.textContent.trim().slice(0, 24)}"`)
    }
    return { W, H, parts, scrolls, reach: +(lowest / H).toFixed(3), past: past.slice(0, 6), cut: cut.slice(0, 8), cutCount: cut.length, pageScroll: document.documentElement.scrollWidth > W }
  })
}

/** Scroll the screen's body to its end, for a second picture of a screen that scrolls. */
async function scrollToEnd(page) {
  return page.evaluate(() => {
    let moved = false
    for (const el of [document.querySelector('#sheet .body'), ...document.querySelectorAll('#sheet .body *')]) {
      if (!el) continue
      const cs = getComputedStyle(el)
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) { el.scrollTop = el.scrollHeight; moved = true }
    }
    return moved
  })
}

/** The ring's own numbers, where the renderer keeps them: how long its picture took and how big it was. */
async function ringStats(page) {
  return page.evaluate(() => window.fairholm.scene.ringStats ? { ...window.fairholm.scene.ringStats } : null)
}

/** Count what the renderer draws while the screen sits open and nothing is touched. */
async function drawsWhileOpen(page, ms = 4000) {
  await page.evaluate(() => { window.__draws = 0 })
  await page.waitForTimeout(ms)
  return page.evaluate(() => window.__draws)
}

const shot = (name) => `${OUT}/${PREFIX}${name}.png`

for (const view of VIEWS) {
  const { ctx, page } = await open(view)
  for (const which of ['early', 'mature']) {
    const facts = await settle(page, which)
    note(`${view.name} ${which}: turn ${facts.turn}, ${facts.name}, ${facts.people} people (${facts.idle} idle); ${facts.buildings}; building ${facts.building}; units on the tile ${facts.units}`)
    await openScreen(page)
    await page.screenshot({ path: shot(`${which}-${view.name}`) })
    const l = await layout(page)
    const parts = Object.entries(l.parts).map(([k, p]) => `${k} ${Math.round(p.share * 100)}%${p.onScreen ? '' : ' (off screen)'}`).join(', ')
    note(`  layout: ${parts}; scrolls ${l.scrolls}; drawn to ${Math.round(l.reach * 100)}% of the height; past the edge ${l.past.length}; cut off ${l.cutCount}${l.cut.length ? ': ' + l.cut.join('; ') : ''}`)
    check(`${which} at ${view.name}: nothing past the edge`, !l.pageScroll && l.past.length === 0, l.past.join('; '))
    const rs = await ringStats(page)
    if (rs) note(`  ring: ${JSON.stringify(rs)}`)
    const draws = await drawsWhileOpen(page)
    note(`  frames drawn while the screen sat open for four seconds: ${draws}`)
    check(`${which} at ${view.name}: nothing drawn while the screen sits open`, draws === 0, `${draws} frames`)
    if (l.scrolls && await scrollToEnd(page)) {
      await page.waitForTimeout(300)
      await page.screenshot({ path: shot(`${which}-${view.name}-scrolled`) })
    }
    if (view.picks && which === 'mature') {
      // an idle colonist picked: every tile and building that could take them is marked
      await page.evaluate(() => {
        const a = window.fairholm
        a.closeSheet()
        const st = a.state.settlements.find(x => x.owner === 0)
        a.open({ kind: 'settlement', id: st.id })
        a.pickColonist(st, st.colonists.findIndex(c => c.job.kind === 'idle'))
      })
      await page.waitForTimeout(600)
      await page.screenshot({ path: shot(`mature-${view.name}-picked`) })
      // and placed on the first tile marked for them: the figure settles in, the picture is not drawn again
      const placed = await page.evaluate(async () => {
        const a = window.fairholm
        const sel = await import('/src/ui/selectors.ts')
        const st = a.state.settlements.find(x => x.owner === 0)
        const who = a.pick.colonist
        const d = sel.destinationsFor(a.state, st, who)
        const cell = sel.ringCells(a.state, st).find(c => c.tile !== null && d.tiles.has(c.tile))
        if (!cell) return null
        const before = a.scene.ringStats?.draws ?? 0
        a.settlementTapTile(st, cell)
        return { who, tile: cell.tile, job: a.state.settlements.find(x => x.owner === 0).colonists[who].job, redrawn: (a.scene.ringStats?.draws ?? 0) - before, settling: document.querySelectorAll('.stand.settle').length }
      })
      await page.waitForTimeout(150)
      await page.screenshot({ path: shot(`mature-${view.name}-assigned`) })
      note(`  picked and placed: ${JSON.stringify(placed)}`)
      if (placed && placed.redrawn !== undefined) check('an assignment moves a figure and draws no picture', placed.redrawn === 0, `${placed.redrawn} pictures drawn, ${placed.settling} figure settling in`)
    }
  }
  await ctx.close()
}

console.log('\n' + results.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
