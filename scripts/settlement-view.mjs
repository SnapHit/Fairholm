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
import { mkdirSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { fingers } from './touch.mjs'

/** Just enough png to read back a screenshot: eight bit truecolour, not interlaced. */
function readPng(path) {
  const buf = readFileSync(path)
  let p = 8, w = 0, h = 0, ctype = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9] }
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    p += 12 + len
  }
  const ch = ctype === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let q = 0
  for (let y = 0; y < h; y++) {
    const f = raw[q++]
    const row = raw.subarray(q, q + stride); q += stride
    const cur = out.subarray(y * stride, y * stride + stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, (y - 1) * stride + stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= ch ? prev[x - ch] : 0
      let v = row[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const g = a + b - c
        const pa = Math.abs(g - a), pb = Math.abs(g - b), pc = Math.abs(g - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 255
    }
  }
  return { w, h, px: out, ch }
}

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

/** The ring's cost and its colours (questions one and five of the build brief), at a device pixel
 *  ratio of 1, which is where the brief draws its line of 150 milliseconds. The cost: the picture the
 *  screen draws as it opens, the same picture drawn again three times straight through the
 *  renderer, and the picture drawn for a new turn with the screen open. The colours: three tiles of
 *  the ring's own picture against the same tiles of the map on the screen at detail zoom, the middle
 *  half of each, averaged, per channel. */
async function ringMeasures() {
  const view = { name: 'measure-393x742', width: 393, height: 742 }
  const { ctx, page } = await open(view, 1)
  await settle(page, 'mature')
  await openScreen(page)
  const opened = await ringStats(page)
  const again = await page.evaluate(() => {
    const a = window.fairholm, st = a.state.settlements.find(x => x.owner === 0)
    const px = a.scene.ringStats.px, ms = []
    for (let k = 0; k < 3; k++) { a.scene.drawRing(st.tile, px); ms.push(a.scene.ringStats.ms) }
    return ms
  })
  // the map at detail zoom, as the screen shows it, and the ring's picture of the same place
  await page.evaluate(() => {
    const a = window.fairholm, st = a.state.settlements.find(x => x.owner === 0)
    a.closeSheet()
    a.scene.cam.view.selectedTile = null
    a.scene.cam.glideTarget = null
    a.scene.cam.centreOn(st.tile, 72)
    a.scene.requestDraw()
  })
  await idle(page)
  await page.screenshot({ path: `${OUT}/${PREFIX}measure-map-detail.png` })
  const tiles = await page.evaluate(() => {
    const a = window.fairholm, sc = a.scene, s = a.state, w = s.world.width
    const st = s.settlements.find(x => x.owner === 0)
    const px = sc.ringStats.px || 377
    const canvas = sc.drawRing(st.tile, px)
    const g = canvas.getContext('2d')
    const half = 1.5 + 0.25, perTile = px / (2 * half)
    const cx = (st.tile % w) + 0.5, cz = Math.floor(st.tile / w) + 0.5
    // one of each kind of ground the ring has, nearest the top left first
    const picked = [], kinds = new Set()
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue
      const t = st.tile + dz * w + dx, tile = s.world.tiles[t]
      const kind = tile.terrain + (tile.forest ? ' under ' + tile.forest : '')
      if (kinds.has(kind) || picked.length >= 3) continue
      kinds.add(kind)
      const x0 = (t % w) + 0.25, z0 = Math.floor(t / w) + 0.25
      const rx = Math.round((x0 - (cx - half)) * perTile), rz = Math.round((z0 - (cz - half)) * perTile), n = Math.round(0.5 * perTile)
      const d = g.getImageData(rx, rz, n, n).data
      let r = 0, gg = 0, b = 0
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
      const m = d.length / 4
      const [sx, sy] = sc.cam.worldToScreen(x0, z0)
      picked.push({ kind, at: [dx, dz], ring: [r / m, gg / m, b / m], screen: [sx, sy, 0.5 * sc.cam.view.zoom] })
    }
    return picked
  })
  const png = readPng(`${OUT}/${PREFIX}measure-map-detail.png`)
  const dpr = png.w / view.width
  const diffs = tiles.map(t => {
    const [sx, sy, size] = t.screen
    const x0 = Math.round(sx * dpr), y0 = Math.round(sy * dpr), n = Math.round(size * dpr)
    let r = 0, g = 0, b = 0, m = 0
    for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) { const i = (y * png.w + x) * png.ch; r += png.px[i]; g += png.px[i + 1]; b += png.px[i + 2]; m++ }
    const map = [r / m, g / m, b / m]
    const d = t.ring.map((v, i) => +(v - map[i]).toFixed(1))
    note(`  colour, ${t.kind} at ${t.at.join(',')}: ring ${t.ring.map(v => v.toFixed(1)).join(' ')}, map ${map.map(v => v.toFixed(1)).join(' ')}, difference ${d.join(' ')}`)
    return Math.max(...d.map(Math.abs))
  })
  check('the ring\'s colours match the map within a few levels a channel', diffs.length === 3 && Math.max(...diffs) <= 3, `largest difference ${Math.max(...diffs)}`)
  // a new turn with the screen open: the picture is drawn again for it, once
  await page.evaluate(() => { const a = window.fairholm; a.open({ kind: 'settlement', id: a.state.settlements.find(x => x.owner === 0).id }) })
  await page.waitForTimeout(2500)
  await idle(page)
  const before = await ringStats(page)
  await page.evaluate(() => window.fairholm.endTurn())
  await page.waitForTimeout(4000)
  await idle(page)
  const turned = await ringStats(page)
  note(`ring at a device pixel ratio of 1, ${opened.px} pixels square: ${opened.ms} ms as the screen opened, ${again.join(', ')} ms drawn again, ${turned.ms} ms for a new turn (${turned.draws - before.draws} drawn)`)
  check('the ring draws in under 150 ms at a device pixel ratio of 1 on the rig, once it has drawn before', Math.max(...again) < 150, `${again.join(', ')} ms`)
  await ctx.close()
}

/** Assigning, reassigning and picking an idle colonist by taps alone, as real touches on the new
 *  screen (question six of the build brief): every step is a tap where a player's thumb would land,
 *  and every answer is read back from the state. */
async function tapChecks(page, ctx, view) {
  if (!(await page.evaluate(() => !!document.querySelector('.st-town')))) { note('  taps: not the new screen, skipped'); return }
  const holdMs = await page.evaluate(async () => (await import('/src/ui/theme.ts')).HOLD_MS)
  const finger = fingers(await ctx.newCDPSession(page), page, { holdMs })
  const tapOn = async (selector, index = 0) => {
    const at = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i]
      if (!el) return null
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const b = el.getBoundingClientRect()
      return [b.left + b.width / 2, b.top + b.height / 2]
    }, [selector, index])
    if (!at) return false
    await finger.tap(at[0], at[1], 700)
    return true
  }
  const state = () => page.evaluate(() => {
    const a = window.fairholm, st = a.state.settlements.find(x => x.owner === 0)
    return { sheet: a.sheet.kind, pick: a.pick ? a.pick.colonist : null, jobs: st.colonists.map(c => c.job.kind === 'tile' ? `tile ${c.job.tile}` : c.job.kind === 'building' ? `building ${c.job.line}` : 'idle'), lit: document.querySelectorAll('.can-take').length, settling: document.querySelectorAll('.stand.settle').length, draws: a.scene.ringStats?.draws ?? 0, active: a.scene.cam.view.activeUnit }
  })
  await settle(page, 'mature')
  await openScreen(page)
  const s0 = await state()
  // pick the idle colonist at the head of the street: the useful places are marked
  await tapOn('.idler')
  const s1 = await state()
  check('taps: an idle colonist is picked by a tap, and the places that can take them are marked', s1.pick !== null && s1.lit > 1, `picked ${s1.pick}, ${s1.lit} marked`)
  // a tap on a marked tile puts them there
  const target = await page.evaluate(() => { const el = document.querySelector('.st-ring .tile.can-take'); return el ? [...document.querySelectorAll('.st-ring .tile')].indexOf(el) : -1 })
  await tapOn('.st-ring .tile', target)
  const s2 = await state()
  const moved = s1.pick !== null ? s2.jobs[s1.pick] : null
  check('taps: a tap on a marked tile assigns them, the figure settles in and no picture is drawn', !!moved && moved.startsWith('tile') && s2.pick === null && s2.draws === s1.draws, `${moved}; ${s2.settling} settling; pictures ${s1.draws} then ${s2.draws}`)
  await page.screenshot({ path: shot(`mature-${view.name}-tapped`) })
  // reassign: a tap on that tile offers who else could work it, best first; a tap on the first
  // swaps the two of them
  await tapOn('.st-ring .tile', target)
  const s3 = await state()
  const swap = await page.evaluate(() => [...document.querySelectorAll('#sheet .btn')].findIndex(b => /^(Swap with|Take|Put here)/.test(b.textContent)))
  if (swap >= 0) await tapOn('#sheet .btn', swap)
  const s4 = await state()
  const swapped = s4.jobs.filter((j, i) => j !== s2.jobs[i]).length
  check('taps: tapping a worked tile offers the others, and one more tap swaps two of them', s3.sheet === 'assignTile' && s4.sheet === 'settlement' && swapped === 2 && !s4.jobs.includes('idle'), `sheet ${s3.sheet} then ${s4.sheet}; ${swapped} jobs changed`)
  // stand someone down from a tile, pick them, and put them in a building with room
  const worked = await page.evaluate(() => { const tiles = [...document.querySelectorAll('.st-ring .tile')]; return tiles.findIndex(t => t.querySelector('.stand') && !t.classList.contains('centre')) })
  await tapOn('.st-ring .tile', worked)
  const leave = await page.evaluate(() => { const b = [...document.querySelectorAll('#sheet .btn')].find(x => /Leave it empty/.test(x.textContent)); if (!b) return -1; return [...document.querySelectorAll('#sheet .btn')].indexOf(b) })
  if (leave >= 0) await tapOn('#sheet .btn', leave)
  const s5 = await state()
  await page.evaluate(() => { const a = window.fairholm; if (a.sheet.kind !== 'settlement') a.back() })
  await page.waitForTimeout(300)
  await tapOn('.idler')
  const s6 = await state()
  const lot = await page.evaluate(() => { const el = document.querySelector('.lot.can-take'); return el ? [...document.querySelectorAll('.lot')].indexOf(el) : -1 })
  if (lot >= 0) await tapOn('.lot', lot)
  const s7 = await state()
  const housed = s6.pick !== null ? s7.jobs[s6.pick] : null
  check('taps: a colonist stood down, picked and tapped into a marked building works there', s5.jobs.includes('idle') && !!housed && housed.startsWith('building'), `${s5.jobs.filter(j => j === 'idle').length} idle, then ${housed}`)
  // the header's more control: everything that used to sit in its own row, two taps away
  await tapOn('.st-head .more')
  await page.screenshot({ path: shot(`mature-${view.name}-more`) })
  const menu = await page.evaluate(() => [...document.querySelectorAll('.st-more .btn')].map(b => b.textContent))
  const detail = menu.findIndex(t => /Everything here/.test(t))
  if (detail >= 0) await tapOn('.st-more .btn', detail)
  const s8 = await state()
  check('taps: Build order, Equip and Everything here are two taps away', menu.some(t => /Build order/.test(t)) && menu.includes('Equip') && s8.sheet === 'settlementDetail', `${menu.join(', ')}; then ${s8.sheet}`)
  await page.evaluate(() => window.fairholm.back())
  await page.waitForTimeout(300)
  // the frame opens the build order; a plot queues itself or says what gates it
  await tapOn('.lot.building-up')
  const s9 = await state()
  await page.evaluate(() => window.fairholm.back())
  await page.waitForTimeout(300)
  const queued = await page.evaluate(() => window.fairholm.state.settlements.find(x => x.owner === 0).buildQueue.length)
  await tapOn('.lot.plot')
  const after = await page.evaluate(() => ({ queue: window.fairholm.state.settlements.find(x => x.owner === 0).buildQueue.length, toast: document.querySelector('#toast')?.textContent }))
  check('taps: the frame opens the build order, and a plot queues or gives its gate', s9.sheet === 'build' && (after.queue > queued || !!after.toast), `${s9.sheet}; queue ${queued} then ${after.queue}; "${after.toast}"`)
  // a unit in the settlement stands at the far end of the street; a tap chooses it on the map
  const unit = await page.evaluate(async () => {
    const a = window.fairholm, actions = await import('/src/sim/actions.ts')
    const st = a.state.settlements.find(x => x.owner === 0)
    st.stock.arms = Math.max(st.stock.arms, 100)
    const i = st.colonists.findIndex(c => c.job.kind !== 'idle')
    try { actions.applyAction(a.state, { t: 'equip', settlement: st.id, colonist: i, as: 'militia' }) } catch (e) { return { error: e.message } }
    a.scene.rebuild(a.state, 'dynamic')
    a.refresh()
    return { id: a.state.units.find(u => u.tile === st.tile && u.owner === 0)?.id ?? null }
  })
  await page.waitForTimeout(1500)
  // the far end of the street, where the unit stands
  await page.evaluate(() => { const t = document.querySelector('.st-town'); if (t) t.scrollLeft = t.scrollWidth })
  await page.waitForTimeout(300)
  await page.screenshot({ path: shot(`mature-${view.name}-unit`) })
  if (unit.id !== null && unit.id !== undefined) await tapOn('.unit-here')
  const s10 = await state()
  check('taps: a unit at the far end of the street is chosen on the map with one tap', s10.sheet === 'queue' && s10.active === unit.id, `unit ${unit.id ?? unit.error}; sheet ${s10.sheet}, chosen ${s10.active}`)
}

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
  if (view.picks) await tapChecks(page, ctx, view)
  await ctx.close()
}

if (!ONLY || 'measure'.includes(ONLY)) await ringMeasures()

console.log('\n' + results.join('\n'))
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n').slice(0, 3000) : '\nno page errors')
await browser.close()
await server.close()
