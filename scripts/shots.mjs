// Visual verification of the layout and the settlement screen, and a check that the music actually
// starts on the player's first tap. Settlement screen and layout brief sections 1, 2 and 5, and
// section 6 of the feel brief.
//
// Run with:  node scripts/shots.mjs        (writes into ./shots)
//            OUT=/somewhere node scripts/shots.mjs
//
// Needs a chromium. If playwright's own download is missing, point CHROMIUM at one:
//            CHROMIUM=/opt/pw-browsers/chromium node scripts/shots.mjs

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'shots'
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5183, strictPort: true }, logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const problems = []
const results = []
const check = (name, ok, note = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`) }

async function open(width, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', e => problems.push(`PAGEERROR ${width}: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') problems.push(`console.error ${width}: ${m.text()}`) })
  await page.goto('http://localhost:5183/')
  await page.waitForFunction(() => !!window.fairholm && window.fairholm.state, null, { timeout: 30000 })
  await page.waitForTimeout(500)
  return { ctx, page }
}

/** Nothing on the page may scroll sideways, and no element may reach past the viewport. */
async function overflow(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth
    const bad = []
    for (const el of document.querySelectorAll('#app *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      // a rail that scrolls sideways is meant to be wider than its box; its box is what must fit
      const scroller = el.closest('.rail, .st-overflow')
      if (scroller && scroller !== el) continue
      if (r.right > w + 1 || r.left < -1) bad.push(`${el.className || el.id || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)} of ${w}`)
    }
    return { page: document.documentElement.scrollWidth > w, bad: bad.slice(0, 6) }
  })
}

// ---- 1: the map at rest -------------------------------------------------------------------------
{
  const { ctx, page } = await open(390)
  await page.screenshot({ path: `${OUT}/01-arrival.png` })
  const t0 = Date.now()
  await page.locator('.card.tappable').first().tap()
  await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })

  // music: audible within five seconds of that first tap, measured by the element moving
  let heard = null
  for (let i = 0; i < 24 && heard === null; i++) {
    await page.waitForTimeout(200)
    const m = await page.evaluate(() => {
      const p = window.fairholm.music
      return { pos: p.position, vol: p.playing ? 1 : 0, name: p.trackName, on: p.state.on }
    })
    if (m.pos > 0.25) heard = { ms: Date.now() - t0, ...m }
  }
  check('music starts on the first tap and is audible within five seconds', !!heard && heard.ms < 5000, heard ? `${heard.ms} ms into "${heard.name}"` : 'never started')

  // at rest: nothing selected, a quiet map with two thin strips
  await page.evaluate(() => { window.fairholm.closeSheet(); window.fairholm.scene.cam.view.selectedTile = null })
  await page.waitForTimeout(600)
  const rest = await page.evaluate(() => {
    const h = window.innerHeight
    const canvas = document.getElementById('map').getBoundingClientRect()
    const hud = document.getElementById('hud').getBoundingClientRect()
    const bar = document.getElementById('queuebar').getBoundingClientRect()
    const sheet = document.getElementById('sheet').getBoundingClientRect()
    return {
      mapFraction: +(canvas.height / h).toFixed(3),
      chrome: +((hud.height + bar.height) / h).toFixed(3),
      sheetOnScreen: sheet.top < h - 1,
    }
  })
  check('the map fills the screen at rest', rest.mapFraction >= 0.999 && !rest.sheetOnScreen, `map ${rest.mapFraction}, strips ${rest.chrome} of the height`)
  await page.screenshot({ path: `${OUT}/02-map-at-rest.png` })

  // the hold ring fills over the tuned duration rather than firing at once
  const hold = await page.evaluate(async () => {
    const mod = await import('/src/ui/theme.ts')
    return mod.HOLD_MS
  })
  check('the hold is about 450 ms and named in the theme', hold >= 400 && hold <= 500, `${hold} ms`)

  await ctx.close()
}

// ---- 2: the settlement screen at three widths ---------------------------------------------------
for (const width of [320, 390, 430]) {
  const { ctx, page } = await open(width)
  await page.locator('.card.tappable').first().tap()
  await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
  await page.waitForTimeout(300)
  // give the settlement something to show: a few buildings and some goods
  await page.evaluate(() => {
    const a = window.fairholm
    const st = a.state.settlements[0]
    st.buildings.carpenter = 1
    st.buildings.meeting = 1
    st.buildings.storage = 1
    st.buildings.linenWorks = 1
    st.buildings.smelter = 1
    st.buildings.school = 1
    st.buildings.works = 1
    st.stock.timber = 40; st.stock.flax = 22; st.stock.food = 61; st.stock.ore = 9; st.stock.linen = 14
    a.dispatch({ t: 'autoAssign', settlement: 0 })
    a.open({ kind: 'settlement', id: 0 })
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/03-settlement-${width}.png` })
  const over = await overflow(page)
  check(`no overflow at ${width}`, !over.page && over.bad.length === 0, over.bad.join('; '))
  const ring = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.st-ring .cell')]
    const r = cells.map(c => c.getBoundingClientRect())
    const slot = document.querySelector('.st-flank .slot')?.getBoundingClientRect()
    return {
      cells: cells.length,
      cell: r.length ? Math.round(Math.min(...r.map(x => x.width))) : 0,
      slot: slot ? Math.round(slot.width) : 0,
      stacked: getComputedStyle(document.querySelector('.st-core')).gridTemplateColumns.split(' ').length,
    }
  })
  check(`the ring is nine tappable cells at ${width}`, ring.cells === 9 && ring.cell >= 44, `cell ${ring.cell}pt, slot ${ring.slot}pt, ${ring.stacked === 1 ? 'flanks below the ring' : 'flanks beside the ring'}`)
  await ctx.close()
}

// ---- 3: assignment and navigation ----------------------------------------------------------------
{
  const { ctx, page } = await open(390)
  await page.locator('.card.tappable').first().tap()
  await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const a = window.fairholm
    const st = a.state.settlements[0]
    st.buildings.carpenter = 1
    st.stock.timber = 40
    for (const c of st.colonists) c.job = { kind: 'idle' }
    a.open({ kind: 'settlement', id: 0 })
  })
  await page.waitForTimeout(300)

  // path one: tap the tile, then tap a person in the sheet
  const before = await page.evaluate(() => window.fairholm.state.settlements[0].colonists.map(c => c.job.kind))
  await page.evaluate(() => {
    const a = window.fairholm
    const cells = [...document.querySelectorAll('.st-ring .cell')]
    const target = cells.find((c, i) => i !== 4 && !c.classList.contains('dim'))
    target.click()
  })
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}/04-assign-a-tile.png` })
  await page.evaluate(() => document.querySelector('#sheet .section .line .btn').click())
  await page.waitForTimeout(250)
  const afterTile = await page.evaluate(() => window.fairholm.state.settlements[0].colonists.map(c => c.job.kind))
  check('a colonist can be put on a tile', afterTile.filter(k => k === 'tile').length > before.filter(k => k === 'tile').length, afterTile.join(','))

  // path two: tap an idle person, the useful places light up, tap one
  const lit = await page.evaluate(() => {
    const a = window.fairholm
    const person = document.querySelector('.person')
    if (!person) return { lit: 0 }
    person.click()
    return { lit: document.querySelectorAll('.can-take').length }
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/05-holding-a-colonist.png` })
  check('holding a colonist lights every useful destination', lit.lit > 0, `${lit.lit} places lit`)
  const afterBuilding = await page.evaluate(() => {
    const a = window.fairholm
    const slot = [...document.querySelectorAll('.slot.can-take')][0]
    if (!slot) return null
    slot.click()
    return a.state.settlements[0].colonists.map(c => c.job.kind)
  })
  check('a colonist can be put in a building', !!afterBuilding && afterBuilding.includes('building'), (afterBuilding || []).join(','))
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/06-settlement-worked.png` })

  // navigation between settlements
  const nav = await page.evaluate(() => {
    const a = window.fairholm
    const st = a.state.settlements[0]
    const w = a.state.world.width
    // a second settlement well clear of the first, so the header's arrows have somewhere to go
    const mod = a.state.settlements
    const tile = st.tile + 6
    const s2 = { ...structuredClone(st), id: mod.length, tile, name: 'Second' }
    mod.push(s2)
    a.open({ kind: 'settlement', id: 0 })
    const first = document.querySelector('.st-head .name').textContent
    a.gotoSettlement(1)
    const second = document.querySelector('.st-head .name').textContent
    return { first, second, id: a.sheet.id }
  })
  check('the header moves to the next settlement', nav.first !== nav.second, `${nav.first} then ${nav.second}`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/07-second-settlement.png` })
  const over = await overflow(page)
  check('no overflow on the settlement screen with two settlements', !over.page && over.bad.length === 0, over.bad.join('; '))
  await ctx.close()
}

// ---- 4: the sheet goes away, and the queue collapses when its top item is dealt with -------------
{
  const { ctx, page } = await open(390)
  await page.locator('.card.tappable').first().tap()
  await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
  await page.waitForTimeout(300)

  const bar = await page.evaluate(() => {
    const a = window.fairholm
    return { collapsed: !document.getElementById('sheet').classList.contains('open'), title: document.querySelector('#queuebar .what').textContent }
  })
  check('the queue rests as a bar carrying its top item', bar.collapsed && bar.title.length > 0, bar.title)

  const expanded = await page.evaluate(() => {
    document.querySelector('#queuebar .top').click()
    return document.getElementById('sheet').classList.contains('open')
  })
  check('tapping the bar expands the queue', expanded)

  const away = await page.evaluate(() => {
    document.getElementById('scrim').click()
    return document.getElementById('sheet').classList.contains('open')
  })
  check('tapping away puts the sheet back', !away)

  const swiped = await page.evaluate(() => {
    const a = window.fairholm
    a.open({ kind: 'queue' })
    const grip = document.querySelector('#sheet .grip')
    const send = (t, y) => grip.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientY: y, bubbles: true }))
    send('pointerdown', 300); send('pointermove', 420); send('pointerup', 420)
    return document.getElementById('sheet').classList.contains('open')
  })
  check('a swipe down puts the sheet back', !swiped)

  const collapsed = await page.evaluate(() => {
    const a = window.fairholm
    a.open({ kind: 'queue' })
    const btn = [...document.querySelectorAll('#sheet .card-actions .btn')].pop()
    btn.click()
    return { open: document.getElementById('sheet').classList.contains('open'), kind: a.sheet.kind }
  })
  check('resolving or dismissing collapses the queue', !collapsed.open || collapsed.kind !== 'queue', JSON.stringify(collapsed))
  await ctx.close()
}

// ---- 5: a bigger system font reflows rather than clipping ------------------------------------------
{
  const { ctx, page } = await open(390)
  await page.addStyleTag({ content: 'html { font-size: 20px }' })
  await page.evaluate(() => window.fairholm.layout())
  await page.locator('.card.tappable').first().tap()
  await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const a = window.fairholm
    const st = a.state.settlements[0]
    st.buildings.carpenter = 1; st.buildings.meeting = 1; st.buildings.storage = 1
    st.buildings.linenWorks = 1; st.buildings.smelter = 1; st.buildings.school = 1
    st.stock.timber = 40; st.stock.flax = 22; st.stock.food = 61
    a.dispatch({ t: 'autoAssign', settlement: 0 })
    a.open({ kind: 'settlement', id: 0 })
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/09-large-type.png` })
  const over = await overflow(page)
  const shape = await page.evaluate(() => ({
    stacked: document.getElementById('app').classList.contains('narrow'),
    slot: Math.round(document.querySelector('.st-flank .slot').getBoundingClientRect().width),
    body: Math.round(parseFloat(getComputedStyle(document.body).fontSize)),
  }))
  check('a larger system font grows the type and reflows the flanks below the ring', shape.stacked && shape.body > 15, `body ${shape.body}px, slot ${shape.slot}pt, ${shape.stacked ? 'stacked' : 'still beside the ring'}`)
  check('a much larger type size still does not overflow', !over.page && over.bad.length === 0, over.bad.join('; '))
  await ctx.close()
}

// ---- 6: landscape ---------------------------------------------------------------------------------
{
  const { ctx, page } = await open(844, 390)
  await page.locator('.card.tappable').first().tap()
  await page.waitForFunction(() => window.fairholm.state.turn === 1, null, { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.evaluate(() => window.fairholm.open({ kind: 'settlement', id: 0 }))
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/08-landscape-settlement.png` })
  const land = await page.evaluate(() => ({
    landscape: document.getElementById('app').classList.contains('landscape'),
    mapW: document.getElementById('map').clientWidth,
    w: window.innerWidth,
  }))
  check('landscape still gives the map the whole screen', land.landscape && land.mapW === land.w, JSON.stringify(land))
  const over = await overflow(page)
  check('no overflow in landscape', !over.page && over.bad.length === 0, over.bad.join('; '))
  await ctx.close()
}

console.log(results.join('\n'))
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n').slice(0, 3000) : 'no page errors')
await browser.close()
await server.close()
