// Pictures in the DOM, from the same sheets the map draws from. Settlement screen and layout brief
// section 2, and section 6 point 2: every picture comes from a manifest through one seam, so a new
// sheet replaces a placeholder without the layout changing.
//
// A drawing is a cropped background image of its sheet, sized in percentages of its own box, so the
// layout sets its height (a CSS length, often a share of the tile or the street it stands in) and the
// drawing is right at whatever size that comes to. Its anchor, where it meets the ground, rides along
// as two custom properties, so it can be stood on a point.

import type { Colonist, GoodId, BuildingLine, UnitKind, GameState, DispatchKind } from '../sim/state'
import { SETTLEMENT_ATLAS } from '../render/settlement-atlas'
import UNITS_ATLAS_JSON from '../../public/textures/units.json'
import { manifestFrom, type AtlasManifest } from '../render/billboards'
import { UNIT_SPRITE } from '../render/look'
import { STREET_SHEET_PX } from './theme'
import { h, fmt } from './dom'
import { standingLevel } from './selectors'
import { icon, isGood, type IconSize, type IconName } from './icons'

/** The people's sheet, as the map reads it, and the early era's buildings. */
export const UNITS_SHEET: AtlasManifest = manifestFrom(UNITS_ATLAS_JSON, 'units.json')
export const SETTLEMENT_SHEET: AtlasManifest = SETTLEMENT_ATLAS

/** One drawing from a sheet as an element `height` tall (any CSS length), as wide as the drawing's
 *  own proportions make it, cropped from the sheet as a background image. It carries its anchor as
 *  `--ax` and `--ay`, shares of its own width and height, so that
 *  `translate(calc(-1 * var(--ax)), calc(-1 * var(--ay)))` stands it with its feet on its position.
 *  A piece the sheet does not have comes back as an empty element of the same class, so a missing
 *  drawing costs its picture and nothing else. */
export function atlasPicture(sheet: AtlasManifest, name: string, height: string, cls = ''): HTMLElement {
  const el = h('i', { class: 'pic' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' })
  const p = sheet.pieces[name]
  if (!p) return el
  const [W, H] = sheet.size
  const st = el.style
  st.height = height
  st.aspectRatio = `${p.w} / ${p.h}`
  st.backgroundImage = `url("textures/${sheet.texture}")`
  // in percentages of the element, so the crop holds at any size: the sheet is drawn this many
  // times the piece's size, and a percentage position lines the piece's corner up with the box's
  st.backgroundSize = `${(W / p.w) * 100}% ${(H / p.h) * 100}%`
  st.backgroundPosition = `${W > p.w ? (p.x / (W - p.w)) * 100 : 0}% ${H > p.h ? (p.y / (H - p.h)) * 100 : 0}%`
  st.setProperty('--ax', `${(p.anchorX / p.w) * 100}%`)
  st.setProperty('--ay', `${(p.anchorY / p.h) * 100}%`)
  return el
}

// ---- the seams: one function each, for the art this screen is waiting for ------------------------

/** Which drawing stands for a colonist. Always the colonist for now. Waits for the trades sheet (the
 *  colonist holding the tool of each trade, settlement screen brief section 2, "The art this screen
 *  is waiting for"); when it arrives, the choice by job and standing is made here and nowhere else. */
export function figureFor(c: Colonist): string {
  void c
  return 'colonist'
}

/** Which drawing stands for a unit on the people's sheet: its own piece, or the one it borrows, as
 *  the map chooses (src/render/units.ts, pieceFor). */
export function unitPiece(kind: UnitKind): string | null {
  if (UNITS_SHEET.pieces[kind]) return kind
  const alias = UNIT_SPRITE.pieces[kind]
  return alias && UNITS_SHEET.pieces[alias] ? alias : null
}

/** A good as the screen marks it: its icon from src/ui/icons.svg, at any of the icon sizes. The one
 *  seam a good becomes a picture through (art direction brief section 11a, rule 6): when painted
 *  goods art exists, it is drawn here and nothing else changes. Decorative, so whatever it sits in
 *  says the good in words, as `goodWord` gives it. */
export function goodMark(g: GoodId | 'frame' | 'grievance', size: IconSize = 'inline', cls = ''): SVGSVGElement {
  return icon(g, size, cls)
}

/** Which of the seven early era drawings stands for each building line. Waits for the three building
 *  sheets of six (settlement screen brief section 2, "The art this screen is waiting for"), one
 *  picture per line; until then each line borrows the nearest of the seven and the name under it
 *  carries the difference. The palisade borrows the steading for its fence, and the works borrow the
 *  workshops they would grow from. */
export const BUILDING_PICTURE: Record<BuildingLine, string> = {
  carpenter: 'lodge',
  smelter: 'yard', toolworks: 'yard', armoury: 'yard', finishing: 'yard',
  linenWorks: 'longhouse', ropeWorks: 'longhouse', dyeWorks: 'longhouse', still: 'longhouse',
  meeting: 'hall', press: 'hall', school: 'hall', agentOffice: 'hall',
  storage: 'barn', consignment: 'barn', wharf: 'barn',
  stable: 'steading', works: 'steading',
}

/** The drawing of something being built: the frame the map draws at the settlement. */
export const FRAME_PICTURE = 'frame'

/** How many pixels of the settlement sheet a sheet's picture box stands for, so every building in a
 *  catalogue is drawn at one scale, as the street draws them (STREET_SHEET_PX in src/ui/theme.ts). */
const BUILDING_BOX_SHEET_PX = STREET_SHEET_PX

/** A building's drawing for a sheet, standing at the foot of a box `box` tall (any CSS length) at the
 *  one scale every building is drawn at, so a hall stands taller than a barn. The line's picture
 *  comes from the one table, BUILDING_PICTURE; `piece` names another drawing, such as the frame. */
export function buildingPicture(line: BuildingLine | null, box: string, piece?: string): HTMLElement {
  const name = piece ?? (line ? BUILDING_PICTURE[line] : FRAME_PICTURE)
  const p = SETTLEMENT_SHEET.pieces[name]
  const holder = h('span', { class: 'pic-box building' })
  holder.style.height = box
  if (p) holder.append(atlasPicture(SETTLEMENT_SHEET, name, `calc(${box} * ${(p.h / BUILDING_BOX_SHEET_PX).toFixed(4)})`, 'drawing'))
  return holder
}

/** A unit drawn as the map draws it, at its own size against a person `person` tall (any CSS length):
 *  the drawing's height in people is on the sheet's manifest, and a hull that borrows the trader's
 *  drawing is drawn at the share the map draws it at (UNIT_SPRITE.scale), so a lighter is a small
 *  ship and a cutter nearly a trader. Empty where the sheet has no drawing for the kind. */
export function unitPicture(kind: UnitKind, person: string): HTMLElement {
  const piece = unitPiece(kind)
  const holder = h('span', { class: 'pic-box unit' })
  const p = piece ? UNITS_SHEET.pieces[piece] : null
  if (!piece || !p) return holder
  const people = p.h / (p.personPx ?? p.h)
  const scale = UNIT_SPRITE.scale[kind] ?? 1
  holder.append(atlasPicture(UNITS_SHEET, piece, `calc(${person} * ${(people * scale).toFixed(4)})`, 'drawing'))
  return holder
}

/** A colonist standing in a box of their own, for a list of people: the figure `height` tall on its
 *  feet at the foot of the box, with its standing as chevrons beside them. */
export function personPicture(c: Colonist, height: string, cls = ''): HTMLElement {
  const holder = h('span', { class: 'pic-box person' + (cls ? ' ' + cls : '') })
  holder.style.setProperty('--fig-box', height)
  holder.append(standingFigure(c, height))
  return holder
}

// ---- people standing, and what things make ---------------------------------------------------------

/** A colonist standing on a point: the element is the point, and the drawing stands on it with a
 *  shadow under its feet and its standing as chevrons beside them (none for a debtor, one contracted,
 *  two free, three a master). `height` is the drawing's height, any CSS length. */
export function standingFigure(c: Colonist, height: string, cls = ''): HTMLElement {
  const stand = h('span', { class: 'stand' + (cls ? ' ' + cls : '') })
  stand.style.setProperty('--fig-h', height)
  stand.append(h('i', { class: 'foot-shadow', 'aria-hidden': 'true' }), atlasPicture(UNITS_SHEET, figureFor(c), 'var(--fig-h)', 'figure'))
  const n = standingLevel(c)
  if (n > 0) stand.append(chevrons(n))
  return stand
}

/** A place a colonist could stand and nobody does: the same figure, faint, so a gap reads as a gap. */
export function emptyPlace(height: string): HTMLElement {
  const stand = h('span', { class: 'stand empty' })
  stand.style.setProperty('--fig-h', height)
  stand.append(atlasPicture(UNITS_SHEET, 'colonist', 'var(--fig-h)', 'figure'))
  return stand
}

/** A unit standing on a point, drawn as the map draws it, or nothing where the sheet has no drawing
 *  for its kind. */
export function standingUnit(kind: UnitKind, height: string): HTMLElement {
  const stand = h('span', { class: 'stand unit' })
  stand.style.setProperty('--fig-h', height)
  const piece = unitPiece(kind)
  if (piece) stand.append(h('i', { class: 'foot-shadow', 'aria-hidden': 'true' }), atlasPicture(UNITS_SHEET, piece, 'var(--fig-h)', 'figure'))
  return stand
}

const SVG = 'http://www.w3.org/2000/svg'

/** Up to three chevrons, one above another, bone on a dark halo so they read on any ground. */
export function chevrons(n: number): Element {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'chev')
  svg.setAttribute('viewBox', '0 0 10 16')
  svg.setAttribute('aria-hidden', 'true')
  for (const layer of ['halo', 'ink']) {
    for (let k = 0; k < n; k++) {
      const a = 11 - k * 5
      const line = document.createElementNS(SVG, 'polyline')
      line.setAttribute('points', `1.5,${a + 3.5} 5,${a} 8.5,${a + 3.5}`)
      line.setAttribute('class', layer)
      svg.append(line)
    }
  }
  return svg
}

// ---- what leads a card, a line of the dispatch, the resume card --------------------------------
// Build brief phase 4: a leading icon by kind where one fits. The good for goods, the cannon for
// raiders and war, the frame for build orders, the colonist for people and idleness, the coin for
// money owed or due, the letter for Word and passage, the seal for signatories, the banner for rivals
// in the rival's own colour, the flame for the declaration. Where nothing fits there is no icon, and
// the card's coloured edge says its kind as it always has.

/** A queue card's group, by the icon that leads it. */
const QUEUE_ICONS: Record<string, IconName> = {
  hunger: 'food', spoilage: 'crate', haulStopped: 'crate', orderBlocked: 'crate', orderUnsat: 'crate',
  demand: 'coin', firstConsignment: 'coin',
  sail: 'cannon', threat: 'cannon', wave: 'cannon', muster: 'cannon', blockade: 'cannon',
  tense: 'banner', unitContact: 'banner',
  buildEmpty: 'frame', buildBlocked: 'frame',
  idle: 'colonist', unitIdle: 'colonist', growthAsk: 'colonist',
  signatory: 'seal', declaration: 'resolve', meeting: 'grievance', learn: 'sprout',
  // what is not working, and what is going to waste (src/sim/problems.ts)
  buildStalled: 'frame', inputWasted: 'crate', workerWasted: 'colonist', masterMisplaced: 'colonist',
  schoolStalled: 'colonist', schoolFutile: 'colonist', schoolIdle: 'colonist', machineStarved: 'instruments',
  purposeLost: 'sprout', exploreDone: 'colonist', haulEmpty: 'crate',
}

/** The first good a sentence names, gold aside: in a sentence gold is as often money as the good. */
function goodNamed(text: string): GoodId | null {
  for (const m of text.toLowerCase().matchAll(/[a-z]+/g)) if (m[0] !== 'gold' && isGood(m[0])) return m[0]
  return null
}

/** A banner in a charter's own colour, or in the colour of the words round it. */
function bannerFor(s: GameState, charter: number | null, size: IconSize): SVGSVGElement {
  const el = icon('banner', size)
  const c = charter !== null ? s.charters[charter] : undefined
  if (c && !c.player) el.style.color = c.colour
  return el
}

/** What leads a queue card: its good where it is about one (the dumping card names it in its key),
 *  else the icon for its kind. */
export function queueIcon(s: GameState, group: string, key: string, size: IconSize = 'tile'): SVGSVGElement | null {
  if (group === 'dumping') { const g = key.split(':')[1]; if (g && isGood(g)) return icon(g, size) }
  if (group === 'tense') return bannerFor(s, Number(key.split(':')[1]), size)
  const name = QUEUE_ICONS[group]
  return name ? icon(name, size) : null
}

/** What leads a line of the dispatch: the good it names where it is about goods, the letter for
 *  passage and Word, the seal for a signature, the flame for the declaration, else its kind's. */
export function dispatchIcon(s: GameState, kind: DispatchKind, text: string, size: IconSize = 'tile'): SVGSVGElement | null {
  if (/passage|\bWord\b/.test(text)) return icon('word', size)
  if (/\bsignator|\bsigned\b|\bsigns\b/i.test(text)) return icon('seal', size)
  if (/declar/i.test(text) && kind !== 'war') return icon('resolve', size)
  const good = kind === 'market' || kind === 'loss' || kind === 'predecessor' || kind === 'note' || kind === 'event' ? goodNamed(text) : null
  if (good) return icon(good, size)
  switch (kind) {
    case 'market': case 'company': return icon('coin', size)
    case 'loss': return icon('crate', size)
    case 'growth': return icon('colonist', size)
    case 'build': return icon('frame', size)
    case 'rival': return bannerFor(s, s.charters.findIndex(c => !c.player && text.includes(c.name)), size)
    case 'war': return icon('cannon', size)
    case 'predecessor': return icon('sprout', size)
    default: return null
  }
}

/** "Turns into", between what goes into a building and what comes out: a small arrow in the colour of
 *  the words around it. */
export function intoArrow(): Element {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'into')
  svg.setAttribute('viewBox', '0 0 16 10')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', 'M1.5 5 H13.5 M9.5 1.5 L13.5 5 L9.5 8.5')
  svg.append(path)
  return svg
}

/** What something makes, as a small pill: the good's icon and the number (rule 1: three food is the
 *  food icon and a 3). Faint for what a tile could make if someone worked it. The pill sits inside
 *  a control that says the good in words. */
export function yieldPill(n: number, good: GoodId | 'frame' | 'grievance', faint = false): HTMLElement {
  return h('span', { class: 'pill' + (faint ? ' faint' : '') }, goodMark(good, 'pill'), h('b', {}, fmt(n)))
}
