// The icon set: every good, the two things a building makes that are not goods (frame and
// grievance), and the few things the interface counts that are not goods either: the treasury's
// gold, Word, resolve, people, the four seasons, a hold, guns, speed, a signatory's seal and a
// charter's banner.
//
// They are drawn for this game in src/ui/icons.svg, on a 64 unit square, lit from the upper left
// like the painted sheets, in flat planes with no outlines, and each stands on a soft shadow so it
// reads as a thing rather than a symbol. One sprite is put into the document once; an icon is a
// small svg that points at it, so every icon on the screen is the same few hundred bytes and they
// scale to any size without a second drawing.
//
// The banner takes its colour from the CSS colour of the element it is drawn in (currentColor), so
// a charter's banner is the charter's own colour. Every other icon carries its own colours.
//
// When painted art for the goods exists, it replaces a symbol here and nothing else changes: this
// file and goodMark in src/ui/pictures.ts are the only places a good becomes a picture.

import sprite from './icons.svg?raw'
import { GOODS, type GoodId } from '../sim/state'

/** The icons that are not goods, in the order the sprite draws them. */
const OTHER_ICONS = [
  'frame', 'grievance',
  'coin', 'word', 'resolve', 'colonist',
  'sprout', 'sun', 'leaf', 'frost',
  'crate', 'cannon', 'sail', 'seal', 'banner',
] as const

export type IconName = GoodId | typeof OTHER_ICONS[number]

/** Every icon by name: what tests/icons.test.ts holds the sprite to. */
export const ICON_NAMES: readonly IconName[] = [...GOODS, ...OTHER_ICONS]

/** The sizes an icon is drawn at, each a token in src/ui/theme.ts: in a sentence, in a yield pill, on
 *  the goods shelf, on a tile of a board or a catalogue, at the head of a sheet, and in the top strip.
 *  One drawing at every size (art direction brief section 11a). */
export type IconSize = 'inline' | 'pill' | 'shelf' | 'tile' | 'hero' | 'hud'

/** The season's icon, by the index into SEASON_NAMES in src/sim/turn.ts: new green, deep summer,
 *  the turn of the leaf, bare ground. */
export const SEASON_ICONS: readonly IconName[] = ['sprout', 'sun', 'leaf', 'frost']

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Put the sprite into the document, once, hidden but rendered (gradients inside an svg that is
 *  display none do not draw in every browser, so it is sized to nothing instead). */
export function installIcons(doc: Document = document): void {
  if (doc.getElementById('ic-food')) return
  const holder = doc.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.position = 'absolute'
  holder.style.width = '0'
  holder.style.height = '0'
  holder.style.overflow = 'hidden'
  holder.innerHTML = sprite
  doc.body.prepend(holder)
}

/** One icon, as an inline svg that the stylesheet sizes (class `ic` and `ic-<size>`). Decorative:
 *  whatever it stands for is said in words beside it or in the label of the control it sits in. */
export function icon(name: IconName, size: IconSize = 'inline', cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', `ic ic-${size}${cls ? ' ' + cls : ''}`)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#ic-${name}`)
  svg.append(use)
  return svg
}

/** Whether a word is a good's id, so that a sentence can put the good's icon before it. */
export function isGood(word: string): word is GoodId {
  return (GOODS as string[]).includes(word)
}
