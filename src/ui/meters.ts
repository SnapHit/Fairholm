// Meters and tallies: how a level and a count look once they are in a sheet. Art direction brief
// section 11a: a level is a bar, and a bar shows where a rule acts (rule 2); a count of a few things
// is that many marks, and a count of many is a mark and a number (rule 1).
//
// Every one of these is a picture of a number the sheet also has in words: each says what it shows to
// a screen reader in a label of its own, and its marks are decorative. Every size and colour is a
// token in src/ui/theme.ts; the positions along a track are shares, set as custom properties, so the
// stylesheet places them at any width.

import type { GameState, GoodId } from '../sim/state'
import { C } from '../sim/constants'
import { h } from './dom'
import { icon } from './icons'

/** A mark at a share of a track, nought to one. */
function at(cls: string, share: number, extra: Record<string, string> = {}): HTMLElement {
  const el = h('i', { class: cls })
  el.style.setProperty('--at', Math.max(0, Math.min(1, share)).toFixed(4))
  for (const [k, v] of Object.entries(extra)) el.style.setProperty(k, v)
  return el
}

/** A span of a track from one share to another. */
function span(cls: string, from: number, to: number): HTMLElement {
  const a = Math.max(0, Math.min(1, Math.min(from, to))), b = Math.max(0, Math.min(1, Math.max(from, to)))
  return at(cls, a, { '--span': (b - a).toFixed(4) })
}

/** Where the Company's price for a good stands, as a gauge: a track from the good's floor to its
 *  ceiling, with the two at its ends; a marker at today's price; a small tick at the price it opened
 *  at; and, when selling has pushed the price below where it would stand with nothing sold, the gap
 *  between the two shaded in the loss colour, so a dumped good is visibly dumped. `ghost` is where
 *  the price would stand after a consignment (`consignPreview` in src/sim/market.ts), drawn as a
 *  hollow marker with the fall to it hatched. Build brief phase 2. */
export function priceGauge(s: GameState, g: GoodId, opts: { ghost?: number | null; wide?: boolean } = {}): HTMLElement {
  const p = C.market.goods[g]
  const e = s.market.tables[0][g]
  const range = Math.max(1, p.ceiling - p.floor)
  const share = (v: number) => (v - p.floor) / range
  const price = e.price
  // where the price would stand with nothing sold: the baseline, rounded and held to the track, as
  // recompute in src/sim/market.ts has it with no pressure
  const rest = Math.max(p.floor, Math.min(p.ceiling, Math.round(e.baseline)))
  const below = rest - price
  const ghost = opts.ghost !== undefined && opts.ghost !== null && opts.ghost !== price ? opts.ghost : null
  const track = h('span', { class: 'track' })
  if (below > 0) track.append(span('gap', share(price), share(rest)))
  if (ghost !== null) track.append(span('fall', share(ghost), share(price)), at('ghost', share(ghost)))
  track.append(at('open', share(p.open)), at('now', share(price)))
  const words = `Sells at ${price}, on a scale from ${p.floor} to ${p.ceiling}; it opened at ${p.open}.`
    + (below > 0 ? ` ${below} below where it would stand with nothing sold.` : '')
    + (ghost !== null ? ` After this lot it would stand at ${ghost}.` : '')
  return h('span', { class: 'gauge' + (below > 0 ? ' below' : '') + (opts.wide ? ' wide' : ''), role: 'img', 'aria-label': words },
    h('span', { class: 'end' }, String(p.floor)), track, h('span', { class: 'end' }, String(p.ceiling)))
}

/** A small count as that many marks: `have` whole and the rest of `of` hollow, such as the moves a
 *  unit has left of its moves, or a hull's speed of the fastest hull's. Decorative; the figure is
 *  said in words beside it. */
export function pips(have: number, of: number, cls = ''): HTMLElement {
  const row = h('span', { class: 'pips' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' })
  for (let k = 0; k < of; k++) row.append(h('i', { class: k < have ? 'on' : '' }))
  return row
}

/** A tally of the twelve: a seal for each, whole for those who have signed and faint for those who
 *  have not, the whole ones first, so the row fills from the left as names are put to the cause. */
export function sealRow(signed: number, of: number): HTMLElement {
  const row = h('span', { class: 'seal-row', role: 'img', 'aria-label': `${signed} of ${of} have signed` })
  for (let k = 0; k < of; k++) row.append(icon('seal', 'tile', k < signed ? 'whole' : 'faint'))
  return row
}

/** Where a charter stands with you, as a marker on a three step track: peace, tense, war. */
export function relationTrack(relation: 'peace' | 'tense' | 'war'): HTMLElement {
  const steps = ['peace', 'tense', 'war'] as const
  return h('span', { class: `relation ${relation}`, role: 'img', 'aria-label': `Relation: ${relation}` },
    h('span', { class: 'rail' }, steps.map(r => h('i', { class: r + (r === relation ? ' at' : '') }))),
    h('span', { class: 'words', 'aria-hidden': 'true' }, steps.map(r => h('span', { class: r === relation ? 'at' : '' }, r))))
}

/** How full something is, as a bar: plain, warm as it nears full, and the loss colour once it is
 *  over (spoiling) or about to run out (short); with a tick where a rule acts. Shares of the whole.
 *  The tick stands past the bar above and below, so nothing clips it. */
export function fillBar(share: number, state: 'plain' | 'warm' | 'spoils' | 'short' = 'plain', tick: number | null = null, cls = ''): HTMLElement {
  const bar = h('span', { class: `bar ${state}${cls ? ' ' + cls : ''}`, 'aria-hidden': 'true' }, at('fill', share))
  if (tick !== null) bar.append(at('tick', tick))
  return bar
}
