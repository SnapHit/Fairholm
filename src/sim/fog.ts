// Fog of war. Ground is hidden until one of the player's units or settlements sees it, and then
// stays revealed; other charters' units and ships are visible only within sight; a settlement once
// seen is remembered as it was seen. Sight is derived from the state whenever it is asked for and
// is never stored; what is stored is `tile.explored`, which only ever turns true.
//
// Nothing here writes to the state except `reveal`, which actions.ts calls after every action and
// turn.ts after every turn, and `revealFrom`, which units.ts calls at every step a unit of the
// player's takes, so the fog lifts along the way a unit goes and not only where it stops.
//
// This module imports nothing from units.ts, so that units.ts can call it while moving.

import { C } from './constants'
import type { GameState, Unit, UnitKind, Settlement } from './state'

/** The kinds that sail and see as a ship: the four hulls and the Company's landing craft. The lander
 *  has its own sight. Kept here rather than read from units.ts, which imports this module. */
const SHIPS: UnitKind[] = ['lighter', 'trader', 'raider', 'cutter', 'companyShip']

/** How far a unit of this kind sees, in tiles. */
export function sightOf(kind: UnitKind): number {
  if (kind === 'lander') return C.lander.sight
  if (kind === 'outrider' || kind === 'horse') return C.fog.sight.outrider
  if (SHIPS.includes(kind)) return C.fog.sight.hull
  if (kind === 'colonist') return C.fog.sight.colonist
  return C.fog.sight.default
}

/** Everything the player can see this instant: one byte a tile, one where in sight. */
export function sightMask(s: GameState, owner = 0): Uint8Array {
  const w = s.world.width, h = s.world.height
  const mask = new Uint8Array(w * h)
  const mark = (tile: number, r: number) => {
    const x = tile % w, z = Math.floor(tile / w)
    for (let dz = -r; dz <= r; dz++) {
      const zz = z + dz
      if (zz < 0 || zz >= h) continue
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= w) continue
        mask[zz * w + xx] = 1
      }
    }
  }
  for (const st of s.settlements) if (st.owner === owner) mark(st.tile, C.fog.sight.settlement)
  for (const u of s.units) if (u.owner === owner) mark(u.tile, sightOf(u.kind))
  return mask
}

/** Whether a tile is in the player's sight now. For one tile; for many, take the mask once. */
export function canSee(s: GameState, tile: number, mask?: Uint8Array): boolean {
  return (mask ?? sightMask(s))[tile] === 1
}

/** Whether another charter's unit is visible: the player's own always, the recall fleet's always
 *  (military brief section 9: its approach is always visible), anything else only in sight. */
export function unitVisible(s: GameState, u: Unit, mask?: Uint8Array): boolean {
  if (u.owner === 0) return true
  if (u.owner === -1) return true
  return canSee(s, u.tile, mask)
}

/** Whether a settlement is drawn at all: the player's own, or one the player has seen. */
export function settlementKnown(st: Settlement): boolean {
  return st.owner === 0 || st.seen !== null
}

/** What one of the player's units sees from where it stands now: the ground in its sight explored,
 *  any settlement there remembered as it is, any predecessor people there found. Called at each step
 *  of a move, so a lander sailing six tiles lifts the fog along all six. Does nothing for a unit
 *  that is not the player's. */
export function revealFrom(s: GameState, u: Unit) {
  if (u.owner !== 0) return
  const w = s.world.width, h = s.world.height
  const r = sightOf(u.kind)
  const x0 = u.tile % w, z0 = Math.floor(u.tile / w)
  const tiles = s.world.tiles
  const near = (tile: number) => Math.max(Math.abs((tile % w) - x0), Math.abs(Math.floor(tile / w) - z0)) <= r
  for (let dz = -r; dz <= r; dz++) {
    const z = z0 + dz
    if (z < 0 || z >= h) continue
    for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx
      if (x < 0 || x >= w) continue
      tiles[z * w + x].explored = true
    }
  }
  for (const st of s.settlements) if (st.owner !== 0 && near(st.tile)) st.seen = { turn: s.turn, pop: st.abstractPop, buildings: { ...st.buildings } }
  for (const p of s.predecessors) if (near(p.tile)) p.scouted = true
}

/** Mark everything in sight as explored, remember the settlements in sight as they are, and scout
 *  the predecessors in sight. */
export function reveal(s: GameState) {
  const mask = sightMask(s)
  const tiles = s.world.tiles
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1 && !tiles[i].explored) tiles[i].explored = true
  for (const st of s.settlements) {
    if (st.owner === 0) continue
    if (mask[st.tile] === 1) st.seen = { turn: s.turn, pop: st.owner === 0 ? st.colonists.length : st.abstractPop, buildings: { ...st.buildings } }
  }
  for (const p of s.predecessors) if (mask[p.tile] === 1) p.scouted = true
}
