// Carrying a colonist on the settlement screen (DECISIONS.md 206). A figure on the ring, at a
// building's door or among the idle can be picked up with a finger and put down on a tile, a building
// or the idle: the same placing a tap on the figure and then a tap on the place does, in one movement.
// It is not a unit's move on the map, which only the hold and release make; it stays inside the
// settlement and is undone like any other change of work.
//
// While a figure is carried every place that can take it is marked, as for a picked colonist; a
// copy of the figure follows the finger, and held near either end of the street the street scrolls.
// Let go anywhere that is not a place and nothing happens.

import type { App } from './app'
import type { BuildingLine } from '../sim/state'
import { CARRY } from './theme'

export type CarryTarget = { tile: number } | { line: BuildingLine } | { idle: true }

let carrying: { pointer: number; ended: number } | null = null

/** Whether a pointer is carrying a figure, so the ring's swipe leaves it alone. */
export function isCarrying(pointer: number): boolean { return carrying !== null && carrying.pointer === pointer }

/** Make a figure something a finger can carry. `colonist` is its index in the settlement. */
export function carryable(app: App, settlement: number, colonist: number, figure: HTMLElement): HTMLElement {
  figure.classList.add('carryable')
  figure.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || carrying) return
    start(app, settlement, colonist, figure, e)
  })
  return figure
}

function start(app: App, settlement: number, colonist: number, figure: HTMLElement, down: PointerEvent) {
  const x0 = down.clientX, y0 = down.clientY
  const pointer = down.pointerId
  let ghost: HTMLElement | null = null
  let x = x0, y = y0
  let frame = 0
  let street: HTMLElement | null = null

  const lift = () => {
    // the stand has no size of its own; its picture's height, a little larger as if lifted, goes
    // with the copy, since the street's and the ring's sizes do not reach the body
    const tall = figure.querySelector('.figure')?.getBoundingClientRect().height ?? 0
    ghost = figure.cloneNode(true) as HTMLElement
    ghost.classList.remove('settle', 'carryable')
    ghost.classList.add('carried')
    ghost.style.animationDelay = ''
    ghost.style.setProperty('--fig-h', `${tall * CARRY.lift}px`)
    document.body.append(ghost)
    place()
    street = document.querySelector('#sheet .st-town')
    carrying = { pointer, ended: 0 }
    app.carryStart(settlement, colonist)
    frame = requestAnimationFrame(tick)
  }
  const place = () => {
    if (!ghost) return
    // the feet just over the finger, so the figure is never under it
    ghost.style.transform = `translate(${x}px, ${y - CARRY.footPx}px)`
  }
  // held near either end of the street, the street scrolls under the carried figure
  const tick = () => {
    street = street?.isConnected ? street : document.querySelector('#sheet .st-town')
    if (street) {
      const r = street.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom) {
        if (x < r.left + CARRY.edgePx) street.scrollLeft -= CARRY.edgeStepPx
        else if (x > r.right - CARRY.edgePx) street.scrollLeft += CARRY.edgeStepPx
      }
    }
    frame = requestAnimationFrame(tick)
  }
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return
    x = e.clientX; y = e.clientY
    if (!ghost && Math.hypot(x - x0, y - y0) >= CARRY.startPx) lift()
    if (ghost) { e.preventDefault(); place() }
  }
  const finish = (e: PointerEvent, drop: boolean) => {
    if (e.pointerId !== pointer) return
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    if (!ghost) return
    cancelAnimationFrame(frame)
    ghost.remove()
    // the click the browser sends after a carry is not a tap on whatever it ended over
    const swallow = (c: Event) => { c.stopPropagation(); c.preventDefault() }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), CARRY.clickGuardMs)
    carrying = null
    app.carryEnd(settlement, colonist, drop ? targetAt(e.clientX, e.clientY) : null)
  }
  const up = (e: PointerEvent) => finish(e, true)
  const cancel = (e: PointerEvent) => finish(e, false)
  window.addEventListener('pointermove', move, { passive: false })
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}

/** The place under a point: a ring tile, a building, or the idle at the head of the street. */
function targetAt(x: number, y: number): CarryTarget | null {
  const el = document.elementFromPoint(x, y)
  if (!el || !el.closest('#sheet')) return null
  const tile = el.closest<HTMLElement>('[data-tile]')
  if (tile) return { tile: Number(tile.dataset.tile) }
  const lot = el.closest<HTMLElement>('[data-line]')
  if (lot) return { line: lot.dataset.line as BuildingLine }
  if (el.closest('.lot.idle')) return { idle: true }
  return null
}
