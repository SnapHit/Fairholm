// The town: the settlement's buildings drawn as a street. Settlement screen and layout brief section
// 2, version 3, and the build brief's phase 3.
//
// The buildings stand in a row on the settlement's own ground (the centre tile's colour, as the map
// paints it), seen from the front and a little above, all at one scale, with a small stagger that is
// the same every time for the same settlement and building, so the street does not read as a shelf.
// Each has its name under it, its workers standing at its door and each empty place as the faint
// outline of a figure, what it makes this turn in a pill, and a warning mark when it is starved of its
// input or an imported machine is failing. The building going up is the frame the map draws, with its
// progress under it; tapping it opens the build order. What could be built stands at the end as faint
// plots with their cost, behaving as the unbuilt slots always have. Idle colonists stand at the head of
// the street, where they cannot be missed, with Assign all beside them; units in the settlement stand
// at the far end, and tapping one goes back to the map with it chosen.
//
// The street scrolls sideways when it is longer than the screen. Every size is a share of the street's
// own height (src/ui/style.css), so the pictures grow into whatever height the layout leaves the town.

import type { GameState, Settlement, Colonist, BuildingLine, GoodId, Unit } from '../sim/state'
import { C } from '../sim/constants'
import { buildingName } from '../sim/settlement'
import { grievanceGathered } from '../sim/grievance'
import { unitLabel } from '../sim/queue'
import { SPRITE } from '../render/look'
import { tileLook } from '../render/tiles'
import { h, button, plural } from './dom'
import { STREET_SHEET_PX } from './theme'
import { buildingSlots, standingWords, type BuildingSlot } from './selectors'
import {
  SETTLEMENT_SHEET, UNITS_SHEET, BUILDING_PICTURE, FRAME_PICTURE, atlasPicture, standingFigure, emptyPlace,
  standingUnit, unitPiece, yieldPill,
} from './pictures'
import { settled } from './ring'
import type { App } from './app'

/** A person's height on the settlement sheet, in its pixels: the cabin's wall is drawn a person tall
 *  (src/render/look.ts, SPRITE.eave), so a figure at a door stands at the scale of the building. */
const PERSON_SHEET_PX = SPRITE.eave.px / SPRITE.eave.people

/** A height on the street for something this many settlement sheet pixels tall, as a CSS length. */
function streetHeight(sheetPx: number): string {
  return `calc(var(--lot-art-h) * ${(sheetPx / STREET_SHEET_PX).toFixed(4)})`
}

/** Nought to one, the same every time for the same two numbers: the street's stagger. */
function hash01(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  x = x ^ (x >>> 16)
  return ((x >>> 0) % 1000) / 1000
}

/** The box a drawing stands in, as wide as the drawing at the street's scale, with the drawing's feet
 *  on the street's ground line and lifted by the stagger. */
function art(piece: string, lift: number, cls = ''): HTMLElement {
  const p = SETTLEMENT_SHEET.pieces[piece]
  const box = h('span', { class: 'art' + (cls ? ' ' + cls : '') })
  box.style.setProperty('--w', p ? (p.w / STREET_SHEET_PX).toFixed(4) : '0.8')
  box.style.setProperty('--lift', lift.toFixed(3))
  if (p) box.append(atlasPicture(SETTLEMENT_SHEET, piece, streetHeight(p.h), 'house'))
  return box
}

/** Stand people at a door: points spread about the middle of the building, at its foot. */
function atTheDoor(stands: HTMLElement[]): HTMLElement {
  const door = h('span', { class: 'door' })
  const n = stands.length
  stands.forEach((el, i) => {
    el.style.left = `${50 + (i - (n - 1) / 2) * 24}%`
    door.append(el)
  })
  return door
}

/** What a building makes this turn, as a pill, or null where it makes nothing countable. A meeting
 *  house shows the grievance the settlement gathers, which is what its workers are for. */
function madeHere(s: GameState, st: Settlement, slot: BuildingSlot): HTMLElement | null {
  const out = C.buildings.lines[slot.line].output
  if (out) return yieldPill(slot.output, out as GoodId | 'frame', slot.output <= 0)
  if (slot.line === 'meeting' && C.flags.grievance) {
    const g = Math.round(grievanceGathered(s, st))
    return yieldPill(g, 'grievance', g <= 0)
  }
  return null
}

/** One building on the street. */
function buildingLot(app: App, s: GameState, st: Settlement, slot: BuildingSlot, index: number, lit: boolean, settling: (c: Colonist) => number | null): HTMLElement {
  const box = art(BUILDING_PICTURE[slot.line], hash01(st.id * 31 + index, 17))
  if (slot.capacity > 0) {
    const stands: HTMLElement[] = []
    for (let i = 0; i < slot.capacity; i++) {
      const w = slot.workers[i]
      stands.push(w ? settled(standingFigure(w.colonist, 'var(--lot-figure-h)'), settling(w.colonist)) : emptyPlace('var(--lot-figure-h)'))
    }
    box.append(atTheDoor(stands))
  }
  // what it makes, and the warning mark, hang over the top of the drawing like a sign; a sign wider
  // than the building widens its lot rather than running into the next one
  const pill = madeHere(s, st, slot)
  const sign = h('span', { class: 'sign' }, slot.warning ? h('span', { class: 'flag', title: slot.warning }, '!') : null, pill)
  const who = slot.capacity > 0 ? `, ${slot.workers.length} of ${slot.capacity} at work` : ''
  return withWidth(box, h('button', {
    class: 'lot' + (lit ? ' can-take' : ''), type: 'button',
    'aria-label': `${slot.name}, ${slot.conversion}${who}${slot.output > 0 ? `, making ${slot.output}` : ''}${slot.warning ? `. ${slot.warning}` : ''}`,
    onClick: () => app.settlementTapSlot(st, slot),
  }, sign, box, h('span', { class: 'name' }, slot.name)))
}

/** The lot takes its drawing's width, so its name can wrap under the drawing rather than past it. */
function withWidth(box: HTMLElement, lot: HTMLElement): HTMLElement {
  lot.style.setProperty('--w', box.style.getPropertyValue('--w'))
  return lot
}

/** The building going up, as its frame, with what it still needs under it. */
function frameLot(app: App, st: Settlement): HTMLElement {
  const b = st.building!
  const cost = C.buildings.costs[b.id.tier]!
  const name = buildingName(b.id)
  const box = art(FRAME_PICTURE, hash01(st.id * 31 + 97, 17))
  const share = cost.frame > 0 ? Math.min(1, b.frame / cost.frame) : 1
  const toolShare = cost.tooling > 0 ? Math.min(1, b.tooling / cost.tooling) : 1
  const progress = h('span', { class: 'progress' }, h('i', { style: { width: `${Math.round(Math.min(share, toolShare) * 100)}%` } }))
  const needs = `${b.frame}/${cost.frame} frame${cost.tooling ? `, ${b.tooling}/${cost.tooling} tooling` : ''}`
  return withWidth(box, h('button', {
    class: 'lot building-up', type: 'button',
    'aria-label': `Building ${name}: ${needs}. Opens the build order.`,
    onClick: () => app.open({ kind: 'build', settlement: st.id }),
  }, box, h('span', { class: 'name' }, name, progress, h('span', { class: 'needs' }, needs))))
}

/** Something that could be built, as a faint plot with its cost; a gated one gives its gate on tap. */
function plotLot(app: App, st: Settlement, slot: BuildingSlot): HTMLElement {
  const box = h('span', { class: 'art plot' + (slot.gate ? ' gated' : '') }, h('span', { class: 'ground' }, slot.cost ?? ''))
  return h('button', {
    class: 'lot plot', type: 'button',
    'aria-label': `${slot.name}, could be built for ${slot.cost ?? 'nothing'}${slot.gate ? `. ${slot.gate}` : ''}`,
    onClick: () => app.settlementTapSlot(st, slot),
  }, box, h('span', { class: 'name' }, slot.name))
}

/** The idle, at the head of the street: tap one to pick them, and every place that can take them is
 *  marked; Assign all beside them. */
function idleLot(app: App, st: Settlement, idle: { c: Colonist; i: number }[], pick: number | null, settling: (c: Colonist) => number | null): HTMLElement {
  const people = idle.map(({ c, i }) => {
    const picked = pick === i
    const stand = settled(standingFigure(c, 'var(--lot-figure-h)'), settling(c))
    return h('button', {
      class: 'idler' + (picked ? ' picked' : ''), type: 'button',
      'aria-label': `${picked ? 'Picked: ' : ''}an idle ${standingWords(c)} colonist. Tap a marked tile or building to put them to work.`,
      'aria-pressed': picked ? 'true' : 'false',
      onClick: () => app.pickColonist(st, i),
    }, stand)
  })
  return h('div', { class: 'lot idle' },
    h('span', { class: 'art idlers' }, people),
    h('span', { class: 'name' }, button('Assign all', () => app.dispatch({ t: 'autoAssign', settlement: st.id }, 'Assigned'), 'tiny ghost')),
  )
}

/** The units in the settlement, at the far end of the street: a tap goes back to the map with the
 *  unit chosen. */
function unitsLot(app: App, units: Unit[]): HTMLElement {
  const figures = units.map(u => {
    const piece = unitPiece(u.kind)
    const p = piece ? UNITS_SHEET.pieces[piece] : null
    // as tall as the drawing makes it against a person, and never taller than the street; the button
    // as wide as the drawing, so a hauler does not stand across its neighbour
    const tall = p ? Math.min(p.h / (p.personPx ?? p.h), 2.4) : 1
    const height = `min(calc(var(--lot-figure-h) * ${tall.toFixed(3)}), var(--lot-ground))`
    const button = h('button', {
      class: 'unit-here', type: 'button',
      'aria-label': `${unitLabel(u.kind)}, here. Choose it on the map.`,
      onClick: () => { app.closeSheet(); app.select(u.id) },
    }, standingUnit(u.kind, height))
    if (p) button.style.width = `max(var(--tap-min), calc(${height} * ${(p.w / p.h).toFixed(3)}))`
    return button
  })
  return h('div', { class: 'lot units' },
    h('span', { class: 'art idlers' }, figures),
    h('span', { class: 'name' }, units.length === 1 ? unitLabel(units[0].kind) : plural(units.length, 'unit')),
  )
}

/** The street. `lit` are the lines that can take the colonist being held. */
export function townView(app: App, s: GameState, st: Settlement, pick: number | null, lit: Set<BuildingLine>, settling: (c: Colonist) => number | null): HTMLElement {
  const slots = buildingSlots(s, st)
  const street = h('div', { class: 'street' })
  const idle = st.colonists.map((c, i) => ({ c, i })).filter(x => x.c.job.kind === 'idle')
  if (idle.length) street.append(idleLot(app, st, idle, pick, settling))
  slots.filter(x => x.built).forEach((slot, k) => street.append(buildingLot(app, s, st, slot, k, lit.has(slot.line), settling)))
  if (st.building) street.append(frameLot(app, st))
  for (const slot of slots.filter(x => !x.built)) street.append(plotLot(app, st, slot))
  const here = s.units.filter(u => u.owner === 0 && u.tile === st.tile && unitPiece(u.kind))
  if (here.length) street.append(unitsLot(app, here))
  const town = h('div', { class: 'st-town' }, street)
  town.style.setProperty('--ground', tileLook(s, st.tile).colour)
  // a person at the street's scale, as a share of its height
  town.style.setProperty('--lot-person', (PERSON_SHEET_PX / STREET_SHEET_PX).toFixed(4))
  return town
}

