// The settlement screen. Settlement screen and layout brief, version 3, section 2: the whole
// settlement at once, and in pictures, so a glance says what the place is, who works where and what it
// makes before a number is read. The header, with one line of notes under it when there is something
// to say; the ring, the map's own picture of the nine tiles with a figure on each worked tile; the
// town, the buildings drawn as a street with their workers at the door; and the goods, each with how
// full its store is. Portrait stacks them; landscape puts the ring on the left and the town over the
// goods on the right (src/ui/style.css). Only the standing orders and the few actions that are not
// looked at every visit sit behind a control in the header.
//
// The ring is drawn by the renderer (src/ui/ring.ts and Scene.drawRing), so it improves whenever the
// map does; the town and the figures come from the same sheets the map draws from
// (src/ui/pictures.ts). There is no second art pipeline.
//
// Nothing here writes to the state: every change goes through app.dispatch and is undoable.

import type { GameState, Settlement, Colonist, TileGood, BuildingLine } from '../sim/state'
import { C } from '../sim/constants'
import { foodBalance, clerksRequired, buildingWorkers, tileYield } from '../sim/labour'
import { h, button, fmt, plural, signed } from './dom'
import { SETTLE_MS, STORE_WARM } from './theme'
import { ringView, terrainLayers, tileFigures } from './ring'
import { townView } from './town'
import { goodMark } from './pictures'
import {
  ringCells, goodsShelf, destinationsFor, ownSettlements, consignable, standingWords, type GoodFill,
} from './selectors'
import type { App } from './app'

export { terrainLayers }

// ---- who has just moved ----------------------------------------------------------------------------

/** Where everyone stood when this screen was last drawn, and who has just been sent somewhere and
 *  when, so that their figure settles in where it now stands. Within one settlement and one turn: a
 *  screen opened on another settlement, or on a new turn, shows everyone where they are, still. The
 *  screen is drawn again after most taps, sometimes twice in one, so a figure settling in carries on
 *  from where it had got to rather than starting again. */
let lastPlaces: { settlement: number; turn: number; places: Map<number, string> } | null = null
const arrivals = new Map<number, { place: string; at: number }>()

function placeOf(c: Colonist): string {
  return c.job.kind === 'tile' ? `tile ${c.job.tile}` : c.job.kind === 'building' ? `building ${c.job.line}` : 'idle'
}

/** For each colonist, how long ago they arrived where they stand, in milliseconds, if that was within
 *  the settling time; null for everyone else. Remembers where everyone is now. */
function settlingSince(s: GameState, st: Settlement): (c: Colonist) => number | null {
  const at = performance.now()
  const prev = lastPlaces && lastPlaces.settlement === st.id && lastPlaces.turn === s.turn ? lastPlaces.places : null
  const now = new Map(st.colonists.map(c => [c.id, placeOf(c)]))
  lastPlaces = { settlement: st.id, turn: s.turn, places: now }
  if (prev) for (const [id, place] of now) if (prev.get(id) !== place) arrivals.set(id, { place, at })
  for (const [id, m] of arrivals) if (at - m.at >= SETTLE_MS) arrivals.delete(id)
  return (c) => {
    const m = arrivals.get(c.id)
    return m && m.place === now.get(c.id) ? at - m.at : null
  }
}

// ---- the header ---------------------------------------------------------------------------------------

/** The settlement whose header menu is open, if one is. A tap anywhere else on the screen puts it
 *  away, and so does any drawing of the screen after the one that opened it: whatever happened, it
 *  was not a choice from the menu. */
let moreOpenFor: number | null = null
let moreJustOpened = false

/** Previous and next, the name (tap to rename), one line of numbers, the orders, a more control for
 *  what used to sit in a row of its own, and close. */
function header(app: App, s: GameState, st: Settlement, multiple: boolean): HTMLElement {
  const head = h('div', { class: 'st-head' })
  const nav = (step: number, label: string, glyph: string) =>
    h('button', { class: 'nav ' + (step < 0 ? 'prev' : 'next'), type: 'button', 'aria-label': label, onClick: () => app.gotoSettlement(step) }, glyph)
  if (multiple) head.append(nav(-1, 'previous settlement', '‹'))
  const fb = foodBalance(s, st)
  head.append(h('div', { class: 'who' },
    h('button', { class: 'name', type: 'button', 'aria-label': `${st.name}. Tap to rename.`, onClick: () => app.open({ kind: 'rename', settlement: st.id }) }, st.name),
  ))
  const open = moreOpenFor === st.id
  const more = h('button', {
    class: 'more' + (open ? ' on' : ''), type: 'button', 'aria-label': 'more', 'aria-expanded': open ? 'true' : 'false',
    onClick: () => { moreOpenFor = open ? null : st.id; moreJustOpened = !open; app.renderSheet() },
  }, '⋯')
  head.append(
    // the standing orders, marked while they are unread
    h('button', { class: 'orders' + (st.orders.reviewed ? '' : ' unread'), type: 'button', 'aria-label': 'standing orders', onClick: () => app.open({ kind: 'orders', settlement: st.id }) }, '⚙'),
    more,
    h('button', { class: 'close', type: 'button', 'aria-label': 'close', onClick: () => app.closeSheet() }, '✕'),
  )
  if (multiple) head.append(nav(1, 'next settlement', '›'))
  // the numbers, on a line of their own under the controls, as wide as the screen
  head.append(h('div', { class: 'sub' }, `${plural(st.colonists.length, 'colonist')} · food ${signed(fb)}${C.flags.grievance ? ` · resolve ${Math.round(st.resolve * 100)}%` : ''}`))
  if (open) head.append(moreMenu(app, st))
  return head
}

/** Build order, Equip, School, Hulls and Everything here: each two taps from the screen. */
function moreMenu(app: App, st: Settlement): HTMLElement {
  const go = (label: string, spec: Parameters<App['open']>[0]) => button(label, () => { moreOpenFor = null; app.open(spec) }, 'small ghost')
  return h('div', { class: 'st-more', role: 'menu' },
    go(`Build order${st.buildQueue.length ? ` (${st.buildQueue.length})` : ''}`, { kind: 'build', settlement: st.id }),
    go('Equip', { kind: 'equip', settlement: st.id }),
    st.buildings.school > 0 ? go('School', { kind: 'educate', settlement: st.id }) : null,
    st.buildings.wharf > 0 ? go('Hulls', { kind: 'hulls', settlement: st.id }) : null,
    go('Everything here', { kind: 'settlementDetail', id: st.id }),
  )
}

/** The notes, on one line under the header: who is being placed, hunger, why nothing can be
 *  consigned, the clerks the size needs. The whole of it is a tap away when it does not fit. */
function notesLine(app: App, s: GameState, st: Settlement, pick: number | null): HTMLElement | null {
  const notes: string[] = []
  if (pick !== null && st.colonists[pick]) notes.push(`Tap a marked tile or building for the ${standingWords(st.colonists[pick])} colonist.`)
  if (st.hunger > 0) notes.push(`Short of food for ${plural(st.hunger, 'turn')}.`)
  const ok = consignable(s, st)
  if (!ok.ok && ok.reason) notes.push(ok.reason)
  const clerks = clerksRequired(st.colonists.length)
  if (clerks > 0) notes.push(`${plural(clerks, 'clerk')} needed at this size; ${buildingWorkers(st, 'meeting') + buildingWorkers(st, 'press')} civic workers.`)
  if (!notes.length) return null
  const text = notes.join(' ')
  return h('button', { class: 'st-note' + (pick !== null ? ' placing' : ''), type: 'button', title: text, onClick: () => app.toast(text) }, text)
}

// ---- the goods --------------------------------------------------------------------------------------

/** One good: its mark and stock, the change this turn small, and a bar for how full its store is. */
function goodChip(app: App, st: Settlement, g: GoodFill): HTMLElement {
  const words = g.good === 'food'
    ? `${fmt(g.stock)} banked of ${g.capacity} for the next colonist, ${signed(Math.round(g.change))} this turn${g.state === 'short' ? ', running short' : ''}`
    : `${fmt(g.stock)} of ${g.capacity} held, ${signed(Math.round(g.change))} this turn${g.state === 'spoils' ? ', spoiling' : g.state === 'warm' ? ', nearly full' : ''}`
  return h('button', {
    class: 'good ' + g.state, type: 'button', 'aria-label': `${goodMark(g.good).textContent}: ${words}`,
    onClick: () => app.open({ kind: 'goodActions', settlement: st.id, good: g.good }),
  },
    goodMark(g.good),
    h('span', { class: 'n' }, fmt(g.stock), Math.round(g.change) !== 0 ? h('small', {}, signed(Math.round(g.change))) : null),
    h('span', { class: 'fill' }, h('i', { style: { width: `${Math.round(g.fill * 100)}%` } })),
  )
}

function goodsView(app: App, s: GameState, st: Settlement): HTMLElement {
  return h('div', { class: 'st-goods' }, h('div', { class: 'rail' },
    button('Market', () => app.open({ kind: 'market', settlement: st.id }), 'market'),
    goodsShelf(s, st, STORE_WARM).map(g => goodChip(app, st, g)),
  ))
}

// ---- the screen ---------------------------------------------------------------------------------------

export function settlementScreen(app: App, s: GameState, st: Settlement): HTMLElement {
  const own = ownSettlements(s)
  const pick = app.pick && app.pick.settlement === st.id ? app.pick.colonist : null
  const dests = pick !== null ? destinationsFor(s, st, pick) : { tiles: new Set<number>(), lines: new Set<BuildingLine>() }
  if (moreOpenFor !== null && (moreOpenFor !== st.id || !moreJustOpened)) moreOpenFor = null
  moreJustOpened = false
  const settling = settlingSince(s, st)
  const head = header(app, s, st, own.length > 1)
  const ring = ringView(app, s, st, ringCells(s, st), dests.tiles, tileFigures(s, st, settling))
  const town = townView(app, s, st, pick, dests.lines, settling)
  const body = h('div', { class: 'st-body' }, ring, town, goodsView(app, s, st))
  const screen = h('div', { class: 'settlement' }, head, notesLine(app, s, st, pick), body)
  // the header's menu goes away with a tap anywhere else on the screen
  screen.addEventListener('pointerdown', (e: Event) => {
    if (moreOpenFor === null) return
    const t = e.target as Element
    if (t.closest('.st-more') || t.closest('.st-head .more')) return
    moreOpenFor = null
    screen.querySelector('.st-more')?.remove()
    screen.querySelector('.st-head .more')?.classList.remove('on')
  }, { capture: true })
  return screen
}

/** Which goods a tile could be worked for, best first, for the assignment sheet's chips. */
export function tileGoodOrder(s: GameState, tile: number, offers: TileGood[]): TileGood[] {
  return [...offers].sort((a, b) => tileYield(s, tile, b, null) - tileYield(s, tile, a, null))
}
