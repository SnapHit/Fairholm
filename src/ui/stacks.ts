// The count on a stacked tile. Several of the player's units on one tile fan out a little and are
// told apart by the stack sheet when the tile is tapped; this is the number that says, before the
// tap, that there are several. It counts what the stack sheet lists, the player's units on the
// tile, so the two never disagree.
//
// It is a strip of DOM over the map rather than something drawn, because the map draws no text, and
// it follows the camera from the renderer's frame hook. Below the zoom where a unit is a mark the
// count goes too: a mark is one mark however many stand there.

import type { GameState } from '../sim/state'
import type { Scene } from '../render/scene'
import { h, clear } from './dom'

/** Where on the tile the count sits, in tiles from the tile's middle: the lower right, clear of the
 *  figures, which fan out across the middle. */
const OFFSET: [number, number] = [0.34, 0.3]

export interface StackCounts {
  /** After a state change: which tiles have a stack, and how many. */
  rebuild(s: GameState): void
  /** Every frame: where they are on the screen. */
  place(): void
}

export function mountStackCounts(root: HTMLElement, scene: Scene): StackCounts {
  const layer = h('div', { id: 'stacks' })
  root.append(layer)
  let stacks: { x: number; z: number; el: HTMLElement }[] = []
  const rebuild = (s: GameState) => {
    clear(layer)
    const w = s.world.width
    const count = new Map<number, number>()
    for (const u of s.units) if (u.owner === 0) count.set(u.tile, (count.get(u.tile) ?? 0) + 1)
    stacks = []
    for (const [tile, n] of count) {
      if (n < 2) continue
      const el = h('div', { class: 'stack' }, String(n))
      layer.append(el)
      stacks.push({ x: (tile % w) + 0.5 + OFFSET[0], z: Math.floor(tile / w) + 0.5 + OFFSET[1], el })
    }
    place()
  }
  const place = () => {
    const shown = scene.drawnClose
    for (const st of stacks) {
      const [sx, sy] = scene.cam.worldToScreen(st.x, st.z)
      const on = shown && sx > -40 && sy > -40 && sx < scene.cam.width + 40 && sy < scene.cam.height + 40
      st.el.style.display = on ? '' : 'none'
      if (on) st.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`
    }
  }
  return { rebuild, place }
}
