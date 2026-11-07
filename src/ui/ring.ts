// The ring: the nine tiles a settlement works, as the map's own picture of them. Settlement screen and
// layout brief section 2, version 3, and the build brief's phase 1.
//
// The picture is drawn by the map's renderer (Scene.drawRing): the same ground, water, rivers, roads,
// trees, buildings and units the map shows, in the season's light. Over it, in the DOM, a hairline
// grid in the map's own grid colour, a veil on the tiles that cannot be worked, and nine transparent
// tap targets that behave as the cells always have (App.settlementTapTile). When the renderer cannot
// draw, after a lost context, the ring falls back to the swatches of version 2, drawn from the same
// palette through src/render/tiles.ts, and says nothing about it.
//
// The picture is drawn when the screen opens and again only when something it shows changes: the
// cache key is the settlement, the turn, the picture's size in pixels, the settlement's composition
// (the drawn buildings piecesFor would choose, and its population) and the units standing where the
// picture can see them. Assigning a worker changes none of those, so it moves a figure in the DOM and
// draws nothing.

import type { GameState, Settlement, Colonist } from '../sim/state'
import { neighbours8 } from '../sim/worldgen'
import type { TileLook } from '../render/tiles'
import { RING_PICTURE } from '../render/look'
import { piecesFor, pieceCount } from '../render/sprites'
import { h } from './dom'
import { RING_PICTURES_KEPT, SWIPE_PX, SWIPE_SLOP_PX } from './theme'
import { centreYield, goodWord, standingWords, type RingCell } from './selectors'
import { standingFigure, yieldPill } from './pictures'
import type { App } from './app'

/** The ring cell's ground: the tile's own colour, then its features drawn over it. Every colour comes
 *  from the renderer's palette; every size and tint comes from the theme. The fallback when the
 *  renderer cannot draw, and the founding preview's cells (decision 108). */
export function terrainLayers(look: TileLook): HTMLElement[] {
  const ground = h('div', { class: 'terrain', style: { background: look.colour } })
  const bits: string[] = []
  if (look.canopy) {
    bits.push(`radial-gradient(circle at 28% 32%, ${look.canopy} 0 20%, transparent 21%)`)
    bits.push(`radial-gradient(circle at 68% 52%, ${look.canopy} 0 17%, transparent 18%)`)
    bits.push(`radial-gradient(circle at 44% 76%, ${look.canopy} 0 14%, transparent 15%)`)
    bits.push(`radial-gradient(circle at 80% 82%, ${look.canopy} 0 11%, transparent 12%)`)
  }
  if (look.river) {
    const half = look.river === 2 ? 9 : 5
    bits.push(`linear-gradient(102deg, transparent ${50 - half}%, ${look.riverColour} ${50 - half}% ${50 + half}%, transparent ${50 + half}%)`)
  }
  if (look.road) bits.push(`repeating-linear-gradient(90deg, ${look.roadColour} 0 5px, transparent 5px 11px)`)
  if (look.improved) bits.push('repeating-linear-gradient(0deg, var(--furrow) 0 2px, transparent 2px 7px)')
  const layers: HTMLElement[] = [ground]
  if (bits.length) {
    const style: Record<string, string> = { backgroundImage: bits.join(', ') }
    // the road reads as a track across the middle rather than over the whole cell
    if (look.road) { style.backgroundSize = 'auto'; style.backgroundRepeat = 'repeat-x'; style.backgroundPosition = 'center' }
    layers.push(h('div', { class: 'feature', style }))
  }
  return layers
}

// ---- the picture, and what it is kept by -------------------------------------------------------

/** Pictures already drawn, most recently used last. A few, so that swiping between settlements and
 *  back does not draw again; each is a canvas of up to about two megabytes. */
const pictures = new Map<string, HTMLCanvasElement>()

function keep(key: string, canvas: HTMLCanvasElement) {
  pictures.delete(key)
  pictures.set(key, canvas)
  while (pictures.size > RING_PICTURES_KEPT) pictures.delete(pictures.keys().next().value as string)
}

/** Everything the picture shows that can change within a game: the settlement, the turn (which is
 *  also the season), its size in pixels, the buildings drawn at the middle and the population that
 *  chooses them, the units standing where the picture can see them (the nine tiles and the ring
 *  round them that the soft edge shows a little of), and the renderer's epoch, which moves when
 *  the props are laid again. */
function pictureKey(app: App, s: GameState, st: Settlement, px: number): string {
  const pop = st.colonists.length
  const pieces = piecesFor(st, pop).slice(0, pieceCount(pop)).join('+')
  const w = s.world.width, hh = s.world.height
  const seen = new Set<number>([st.tile])
  for (const n of neighbours8(w, hh, st.tile)) { seen.add(n); for (const m of neighbours8(w, hh, n)) seen.add(m) }
  const units = s.units.filter(u => seen.has(u.tile)).map(u => `${u.id}.${u.kind}.${u.tile}.${u.owner}`).sort().join(',')
  return [s.seed, st.id, s.turn, px, pieces, pop, units, app.scene.epoch].join('|')
}

/** The picture at `px` pixels square, from the cache or drawn now; null when it would have to be
 *  drawn and the renderer cannot. A picture already drawn is a plain 2D canvas, so it outlives a
 *  lost WebGL context and is still shown through one. */
function pictureFor(app: App, s: GameState, st: Settlement, px: number): HTMLCanvasElement | null {
  const key = pictureKey(app, s, st, px)
  const had = pictures.get(key)
  if (had) { keep(key, had); return had }
  if (!app.scene.canDraw) return null
  const drawn = app.scene.drawRing(st.tile, px)
  // a picture taken while a move is being drawn shows the move half way; it is shown, not kept
  if (drawn && !app.scene.moving) keep(key, drawn)
  return drawn
}

/** The swatches of version 2, where the renderer cannot draw. */
function swatches(cells: RingCell[]): HTMLElement {
  return h('div', { class: 'swatches' }, cells.map(c => c.look ? h('div', { class: 'cell' }, ...terrainLayers(c.look)) : h('div', { class: 'cell off' })))
}

/** The pixels a picture this many CSS pixels across is drawn at. */
export function ringPixels(cssPx: number): number {
  return Math.max(1, Math.round(cssPx * Math.min(window.devicePixelRatio || 1, RING_PICTURE.dprCap)))
}

/** Put the picture into the ring once the ring has a size, and again if the size changes. The first
 *  size arrives after layout and before the first paint, so the screen never shows the ring empty. */
function attachPicture(app: App, s: GameState, st: Settlement, ring: HTMLElement, holder: HTMLElement, cells: RingCell[]) {
  let shownPx = -1
  const place = (cssPx: number) => {
    const px = ringPixels(cssPx)
    if (px === shownPx || cssPx < 1) return
    shownPx = px
    const canvas = pictureFor(app, s, st, px)
    holder.replaceChildren(canvas ?? swatches(cells))
    holder.classList.toggle('drawn', !!canvas)
  }
  if (typeof ResizeObserver === 'undefined') { requestAnimationFrame(() => place(ring.getBoundingClientRect().width)); return }
  const ro = new ResizeObserver((entries) => {
    if (!ring.isConnected) { ro.disconnect(); return }
    for (const e of entries) place(e.contentRect.width)
  })
  ro.observe(ring)
}

// ---- the ring ------------------------------------------------------------------------------------

/** What a tile carries over the picture: the caller decides, so the ring is only the ring. */
export type TileContent = (cell: RingCell, el: HTMLElement) => void

/** Who works each tile and what it makes, over the picture: a figure standing on each worked tile
 *  with its standing beside its feet and its yield in a pill beside it; on each tile that could be
 *  worked and is not, its best yield in a faint pill; at the centre, what the settlement's own ground
 *  makes for nothing. `settling` says whether a colonist has just been sent where they now stand. */
export function tileFigures(s: GameState, st: Settlement, settling: (c: Colonist) => number | null): TileContent {
  const own = centreYield(s, st)
  return (cell, el) => {
    if (cell.centre) {
      if (own.length) el.append(h('span', { class: 'pills' }, own.map(y => yieldPill(y.yield, y.good))))
      return
    }
    if (cell.worker) {
      const c = cell.worker.colonist
      el.append(settled(standingFigure(c, 'var(--ring-figure)'), settling(c)))
      el.append(h('span', { class: 'pills' }, yieldPill(cell.worker.yield, cell.worker.good)))
    } else if (cell.available && cell.best) {
      el.append(h('span', { class: 'pills' }, yieldPill(cell.best.yield, cell.best.good, true)))
    }
  }
}

/** A figure that arrived `ms` ago settles in, carrying on from where it had got to. */
export function settled(stand: HTMLElement, ms: number | null): HTMLElement {
  if (ms === null) return stand
  stand.classList.add('settle')
  stand.style.animationDelay = `${-Math.round(ms)}ms`
  return stand
}

/** A tile in words, for a reader that cannot see the picture. */
function tileLabel(cell: RingCell): string {
  if (cell.worker) return `${cell.words}. Worked for ${cell.worker.yield} ${goodWord(cell.worker.good).toLowerCase()} by a colonist, standing ${standingWords(cell.worker.colonist)}.`
  if (cell.centre) return `${cell.words}. The settlement.`
  if (cell.available && cell.best) return `${cell.words}. Could make ${cell.best.yield} ${goodWord(cell.best.good).toLowerCase()}.`
  return `${cell.words}. ${cell.reason ?? ''}`
}

/** The ring: the picture, the hairlines, and nine tap targets. `marked` are the tiles that can take
 *  the colonist being held. */
export function ringView(app: App, s: GameState, st: Settlement, cells: RingCell[], marked: Set<number>, content: TileContent): HTMLElement {
  const ring = h('div', { class: 'st-ring' })
  // the nine tiles sit inside the picture's margin, which is a share of its width
  const inset = RING_PICTURE.margin / (3 + 2 * RING_PICTURE.margin) * 100
  ring.style.setProperty('--ring-inset', `${inset.toFixed(3)}%`)
  const holder = h('div', { class: 'picture' })
  const tiles = h('div', { class: 'tiles' })
  for (const cell of cells) {
    if (cell.tile === null) { tiles.append(h('div', { class: 'tile off', 'aria-label': cell.words })); continue }
    const lit = marked.has(cell.tile)
    const veiled = !cell.centre && !cell.available && !cell.worker
    const el = h('button', {
      class: 'tile' + (cell.centre ? ' centre' : '') + (veiled ? ' veiled' : '') + (lit ? ' can-take' : ''),
      type: 'button',
      'aria-label': tileLabel(cell),
      onClick: () => app.settlementTapTile(st, cell),
    })
    content(cell, el)
    tiles.append(el)
  }
  // the hairlines: two each way, in the map's own grid colour, so nine tiles read as nine
  const hair = h('div', { class: 'hairlines' },
    h('i', { class: 'v a' }), h('i', { class: 'v b' }), h('i', { class: 'h a' }), h('i', { class: 'h b' }))
  ring.append(holder, hair, tiles)
  attachPicture(app, s, st, ring, holder, cells)
  attachRingSwipe(app, ring)
  return ring
}

/** A horizontal drag across the ring moves to the previous or the next settlement, the same as the
 *  header's arrows. Section 5 of the brief: in a large empire, going back to the map is a chore. */
function attachRingSwipe(app: App, ring: HTMLElement) {
  let x0 = 0, y0 = 0, id: number | null = null
  ring.addEventListener('pointerdown', (e: PointerEvent) => { id = e.pointerId; x0 = e.clientX; y0 = e.clientY })
  const end = (e: PointerEvent) => {
    if (id !== e.pointerId) return
    id = null
    const dx = e.clientX - x0, dy = e.clientY - y0
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dy) <= SWIPE_SLOP_PX) app.gotoSettlement(dx < 0 ? 1 : -1)
  }
  ring.addEventListener('pointerup', end)
  ring.addEventListener('pointercancel', () => { id = null })
}

