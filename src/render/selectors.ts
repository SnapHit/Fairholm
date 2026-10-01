// Read-only views of the state for the renderer, where it needs something the simulation already
// knows but does not export. Nothing here writes to the state, and nothing in /src/sim knows this
// file exists.

import type { GameState, Wave } from '../sim/state'
import { waveCoast } from '../sim/fleet'

/** The coast a wave at sea might still come ashore on, as far as the player can tell: the fleet's
 *  own reading, so the two agree. */
export function waveCandidates(s: GameState, wave: Wave): number[] {
  return waveCoast(s, wave)
}

/** Open water within reach of a point: the water tile with the most water around it, so a thing
 *  put down there is clearly at sea rather than on the beach. */
export function openWaterNear(s: GameState, x: number, z: number, reach: number): [number, number] | null {
  const w = s.world.width, h = s.world.height
  let best = -Infinity, bx = 0, bz = 0
  for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
    const nx = Math.floor(x) + dx, nz = Math.floor(z) + dz
    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
    if (s.world.tiles[nz * w + nx].terrain !== 'water') continue
    let water = 0
    for (let ez = -1; ez <= 1; ez++) for (let ex = -1; ex <= 1; ex++) {
      const t = s.world.tiles[(nz + ez) * w + (nx + ex)]
      if (t && t.terrain === 'water') water++
    }
    const score = water * 2 - Math.hypot(dx, dz) * 0.5
    if (score > best) { best = score; bx = nx + 0.5; bz = nz + 0.5 }
  }
  return best > -Infinity ? [bx, bz] : null
}
