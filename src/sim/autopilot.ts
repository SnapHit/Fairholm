// The voyage, played by the machine. Two things need to sail a lander to a coast and found: the
// rival charters, whose landers come down in fog at fair distances and found by the player's own
// rules, and the tests, which have to get a game ashore before they can test anything. Both use
// this. It is a rule of thumb, not a plan: score every legal coastal site the lander could reach
// by what its ring would yield, prefer the near ones, sail toward the best, and found when it is
// beside it.
//
// Nothing here writes to the state. It returns actions for the player, and for the rivals it
// returns the choice and lets rivals.ts make it.

import { C } from './constants'
import type { GameState, Unit, TileGood } from './state'
import type { Action } from './actions'
import { foundingProblem } from './settlement'
import { tileOffers, tileYield } from './labour'
import { neighbours8, isLand, isCoastal, sailingDistance, landingViable } from './worldgen'
import { findPath } from './units'

/** How good a settlement would be here: the best yield of each ring tile, food counting for more,
 *  plus a little for water beside it and a river through it. The settlement's own tile yields its
 *  food free, so the centre counts twice. */
export function siteScore(s: GameState, tile: number): number {
  const w = s.world.width, h = s.world.height
  let score = 0, water = 0, river = 0
  for (const i of [tile, ...neighbours8(w, h, tile)]) {
    const t = s.world.tiles[i]
    if (t.terrain === 'water') { water++; score += 2; continue }
    if (t.river) river++
    let best = 0
    for (const g of tileOffers(t) as TileGood[]) {
      const v = tileYield(s, i, g, null) * (g === 'food' ? 1.5 : g === 'timber' ? 1.2 : 1)
      if (v > best) best = v
    }
    score += best * (i === tile ? 2 : 1)
  }
  // a little water is a port and a river is fresh water; a ring that is mostly sea is thin ground
  score += Math.min(water, 3) * 1.5 - Math.max(0, water - 4) * 3 + (river ? 3 : 0)
  return score
}

/** The best coastal site a lander at `from` could make for: legal to found, land beside water the
 *  lander can reach, within `reach` tiles of sailing, scored by the ring, with a good deal for a
 *  coast that can feed a settlement (food, timber and fresh water within reach, which is what the
 *  generator measured the voyage against) and less for every turn of sailing. The sailing penalty
 *  is steep enough that a rich coast ten turns off loses to a fair one beside the lander: the
 *  voyage is meant to be a few turns, not a tour. Null when there is no coast within reach. */
export function bestLanding(s: GameState, from: number, reach = 10): { tile: number; water: number; score: number } | null {
  const w = s.world.width, h = s.world.height
  const tiles = s.world.tiles
  // sailing distance from the lander itself, over water
  const d = new Int32Array(w * h).fill(-1)
  const queue = [from]
  d[from] = 0
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]
    if (d[c] >= reach) continue
    for (const n of neighbours8(w, h, c)) if ((tiles[n].terrain === 'water' || tiles[n].river === 2) && d[n] < 0) { d[n] = d[c] + 1; queue.push(n) }
  }
  let best: { tile: number; water: number; score: number } | null = null
  for (let i = 0; i < tiles.length; i++) {
    if (!isLand(tiles[i]) || !isCoastal(w, h, tiles, i)) continue
    if (foundingProblem(s, i) !== null) continue
    // the water tile beside it that the lander can reach soonest
    let water = -1, wd = 1e9
    for (const n of neighbours8(w, h, i)) if (tiles[n].terrain === 'water' && d[n] >= 0 && d[n] < wd) { wd = d[n]; water = n }
    if (water < 0) continue
    const viable = landingViable(w, h, tiles, i) ? 15 : 0
    const score = siteScore(s, i) + viable - (wd / C.lander.moves) * 3
    if (!best || score > best.score) best = { tile: i, water, score }
  }
  return best
}

/** The player's lander, if it is still at sea. */
export function playerLander(s: GameState): Unit | undefined {
  return s.units.find(u => u.owner === 0 && u.kind === 'lander')
}

/** What the machine would do this turn with the player's lander: found if it is beside the best
 *  site, otherwise sail toward it. Null when there is nothing to do, including after founding. */
export function openingAction(s: GameState): Action | null {
  const lander = playerLander(s)
  if (!lander) return null
  const w = s.world.width, h = s.world.height
  const site = bestLanding(s, lander.tile)
  if (!site) return null
  if (neighbours8(w, h, lander.tile).includes(site.tile)) return { t: 'found', unit: lander.id, tile: site.tile }
  if (lander.moves <= 0) return null
  if (lander.tile === site.water) {
    // beside the water but the site is across a corner the lander cannot see from here
    const other = neighbours8(w, h, lander.tile).find(n => isLand(s.world.tiles[n]) && foundingProblem(s, n) === null)
    return other !== undefined ? { t: 'found', unit: lander.id, tile: other } : null
  }
  const path = findPath(s, lander, lander.tile, site.water)
  if (!path || !path.length) return null
  return { t: 'moveUnit', unit: lander.id, path }
}

/** How many turns of sailing the player's lander is from the nearest coast it could found on, by
 *  the generator's measure: for the opening's telemetry and for the tests. */
export function turnsToCoast(s: GameState): number {
  const lander = playerLander(s)
  if (!lander) return 0
  const w = s.world.width, h = s.world.height
  const d = sailingDistance(w, h, s.world.tiles, i => isLand(s.world.tiles[i]) && isCoastal(w, h, s.world.tiles, i) && foundingProblem(s, i) === null)
  return d[lander.tile] < 0 ? Infinity : Math.ceil(d[lander.tile] / C.lander.moves)
}
