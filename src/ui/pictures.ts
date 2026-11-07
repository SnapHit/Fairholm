// Pictures in the DOM, from the same sheets the map draws from. Settlement screen and layout brief
// section 2, and section 6 point 2: every picture comes from a manifest through one seam, so a new
// sheet replaces a placeholder without the layout changing.
//
// A drawing is a cropped background image of its sheet, sized in percentages of its own box, so the
// layout sets its height (a CSS length, often a share of the tile or the street it stands in) and the
// drawing is right at whatever size that comes to. Its anchor, where it meets the ground, rides along
// as two custom properties, so it can be stood on a point.

import type { Colonist, GoodId, BuildingLine, UnitKind } from '../sim/state'
import { SETTLEMENT_ATLAS } from '../render/settlement-atlas'
import UNITS_ATLAS_JSON from '../../public/textures/units.json'
import { manifestFrom, type AtlasManifest } from '../render/billboards'
import { UNIT_SPRITE } from '../render/look'
import { h, fmt } from './dom'
import { goodWord, standingLevel } from './selectors'

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

/** A good as the screen marks it: its word for now. Waits for the goods sheet of icons; when it
 *  arrives, the icon is drawn here and nowhere else. */
export function goodMark(g: GoodId | 'frame' | 'grievance'): HTMLElement {
  return h('span', { class: 'mark' }, goodWord(g))
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

/** What something makes, as a small pill: the number and the good. Faint for what a tile could make
 *  if someone worked it. */
export function yieldPill(n: number, good: GoodId | 'frame' | 'grievance', faint = false): HTMLElement {
  return h('span', { class: 'pill' + (faint ? ' faint' : '') }, h('b', {}, fmt(n)), ' ', goodMark(good))
}
