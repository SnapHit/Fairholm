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
import type { GoodId } from '../sim/state'

export type IconName =
  | GoodId | 'frame' | 'grievance'
  | 'coin' | 'word' | 'resolve' | 'colonist'
  | 'sprout' | 'sun' | 'leaf' | 'frost'
  | 'crate' | 'cannon' | 'sail' | 'seal' | 'banner'

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

/** One icon, as an inline svg that the stylesheet sizes (class `ic`, one em square unless a size
 *  class says otherwise). Decorative: whatever it stands for is said in words beside it or in the
 *  label of the control it sits in. */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#ic-${name}`)
  svg.append(use)
  return svg
}
