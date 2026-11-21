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
import type { GameState, Unit, TileGood, Settlement, QueueItem } from './state'
import type { Action } from './actions'
import type { System } from './turn'
import { foundingProblem } from './settlement'
import { tileOffers, tileYield, foodBalance, clerksRequired } from './labour'
import { neighbours8, isLand, isCoastal, sailingDistance, landingViable, dist } from './worldgen'
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

/** The best ground for new settlements within reach of a settlement, best first: legal to found, not
 *  on a people's land or crowding a rival's settlement, scored by the ring, with a bonus for a coast,
 *  less for every tile of walking and for ground nobody has seen. The settlers of the machine players
 *  take the first; the interface marks the best three for the player's own (DECISIONS.md 195). With
 *  `spread`, no two closer than that; with `walk`, only ground a colonist could walk to from here;
 *  with `seen`, only ground the player has seen. */
export function bestSites(s: GameState, from: Pick<Settlement, 'tile'>, n = 3, opts: { spread?: number; walk?: boolean; seen?: boolean } = {}): number[] {
  const w = s.world.width, h = s.world.height
  const tiles = s.world.tiles
  const r = C.autopilot.settleRange
  const found: { i: number; score: number }[] = []
  for (let dz = -r.max; dz <= r.max; dz++) for (let dx = -r.max; dx <= r.max; dx++) {
    const x = (from.tile % w) + dx, z = Math.floor(from.tile / w) + dz
    if (x < 0 || z < 0 || x >= w || z >= h) continue
    const i = z * w + x
    const d = Math.max(Math.abs(dx), Math.abs(dz))
    if (d < r.min || d > r.max) continue
    const t = tiles[i]
    if (!isLand(t) || t.terrain === 'mountain') continue
    // the player is shown only ground they have seen: marking a place in the fog would tell them
    // what lies under it
    if (opts.seen && !t.explored) continue
    if (foundingProblem(s, i) !== null) continue
    if (s.settlements.some(st => st.owner > 0 && dist(w, st.tile, i) < C.autopilot.rivalClearance)) continue
    if (s.predecessors.some(p => p.territory.includes(i))) continue
    // ground nobody has seen is a guess; a settler walking to it sees it on the way
    const score = siteScore(s, i) + (isCoastal(w, h, tiles, i) ? C.autopilot.coastalSiteBonus : 0) - d - (t.explored ? 0 : C.autopilot.unseenSitePenalty)
    found.push({ i, score })
  }
  // best first; equal scores keep the order of the scan, which is the order the settlers always took
  found.sort((a, b) => b.score - a.score)
  const walker = opts.walk ? ({ id: -1, owner: 0, kind: 'colonist', tile: from.tile, quality: 'raw', moves: 1, cargo: {}, colonist: null, order: null, path: [], damage: 0, progress: 0, since: {}, flagged: true, aboard: [] } as Unit) : null
  const out: number[] = []
  for (const f of found) {
    if (out.length >= n) break
    if (opts.spread && out.some(o => dist(w, o, f.i) < opts.spread!)) continue
    if (walker && !findPath(s, walker, from.tile, f.i)) continue
    out.push(f.i)
  }
  return out
}

/** Who a settlement could send out to found: someone idle past the clerks the ledger needs, else the
 *  one whose work is worth least, a body on food only where the settlement stays fed without them,
 *  and never a master. Only from a settlement of `C.founding.fromPeople` or more. -1 when nobody. */
export function settlerFrom(s: GameState, st: Settlement): number {
  if (st.colonists.length < C.founding.fromPeople) return -1
  const idle = st.colonists.map((c, i) => c.job.kind === 'idle' ? i : -1).filter(i => i >= 0)
  const clerks = clerksRequired(st.colonists.length)
  if (idle.length > clerks) return idle[clerks]
  const fed = foodBalance(s, st)
  let pick = -1, pv = Infinity
  st.colonists.forEach((c, i) => {
    if (c.standing === 'master' || c.job.kind === 'idle') return
    const makes = c.job.kind === 'tile' ? tileYield(s, c.job.tile, c.job.good, c) : 0
    if (c.job.kind === 'tile' && c.job.good === 'food' && fed - makes < 0) return
    const v = c.job.kind === 'tile' ? makes * (c.job.good === 'food' ? 3 : 1) : 6
    if (v < pv) { pv = v; pick = i }
  })
  return pick
}

/** Where a settlement could found a new one: the opportunity card, on the biggest settlement that can
 *  spare someone and has good ground within a walk, while none of the player's colonists is out on
 *  the land already. It offers Send someone out, which equips them as a colonist on foot; the
 *  interface then chooses them and rings the best ground (DECISIONS.md 195). */
export function foundingChances(s: GameState): QueueItem[] {
  const own = s.settlements.filter(x => x.owner === 0)
  if (!own.length) return []
  // the first time, not before the aim line asks for it: fed first, then a consignment, then new
  // ground (onboarding brief section 10). An opportunity lapses once it has been passed over twice,
  // and one shown in the first busy turns would be gone before it was wanted
  if (own.length === 1 && !s.intent.startsWith('Found')) return []
  if (s.units.some(u => u.owner === 0 && u.kind === 'colonist')) return []
  const w = s.world.width
  for (const st of own.slice().sort((a, b) => b.colonists.length - a.colonists.length)) {
    const who = settlerFrom(s, st)
    if (who < 0) continue
    const site = bestSites(s, st, 1, { walk: true, seen: true })[0]
    const explain = 'A colonist sent out walks to new ground and founds a settlement there. Ground of another kind grows what this one cannot.'
    if (site !== undefined) {
      const d = dist(w, st.tile, site)
      return [{
        key: `canFound:${st.id}`, group: 'canFound', type: 5, title: `${st.name} can found a new settlement`,
        body: `Someone can be spared, and good ground lies ${d} tiles ${compass(w, st.tile, site)}. Send them out, then hold one of the marked places and let go.`,
        explain, settlement: st.id, magnitude: 1, since: s.turn, opens: 'settlement',
        choices: [{ label: 'Send someone out', action: { t: 'equip', settlement: st.id, colonist: who, as: 'colonist' } }],
      }]
    }
    // nothing fit seen yet: one goes out to look, and stops when they see some
    if (!unseenLandNear(s, st.tile, C.autopilot.settleRange.max)) continue
    return [{
      key: `canFound:${st.id}`, group: 'canFound', type: 5, title: `${st.name} could found a new settlement`,
      body: 'Someone can be spared, but no ground fit for a settlement has been seen within a walk. Send them out to look: they stop when they see some.',
      explain, settlement: st.id, magnitude: 1, since: s.turn, opens: 'settlement',
      choices: [{ label: 'Send someone out to look', action: { t: 'equip', settlement: st.id, colonist: who, as: 'colonist', order: { kind: 'explore', until: 'site' } } }],
    }]
  }
  return []
}

/** Whether there is land nobody has seen within `r` tiles: somewhere a colonist could go and look. */
export function unseenLandNear(s: GameState, tile: number, r: number): boolean {
  const w = s.world.width, h = s.world.height
  const x0 = tile % w, z0 = Math.floor(tile / w)
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, z = z0 + dz
    if (x < 0 || z < 0 || x >= w || z >= h) continue
    const t = s.world.tiles[z * w + x]
    if (!t.explored && isLand(t) && t.terrain !== 'mountain') return true
  }
  return false
}

/** The founding opportunity as a system: nothing to resolve, one card at most (DECISIONS.md 195). */
export const foundingSystem: System = {
  id: 'founding',
  enabled: c => c.flags.settlement,
  resolve: () => {},
  queueItems: s => foundingChances(s),
}

/** Which way one tile lies from another, in a word of the compass. */
export function compass(w: number, from: number, to: number): string {
  const dx = (to % w) - (from % w), dz = Math.floor(to / w) - Math.floor(from / w)
  const ns = dz < -Math.abs(dx) / 2 ? 'north' : dz > Math.abs(dx) / 2 ? 'south' : ''
  const ew = dx > Math.abs(dz) / 2 ? 'east' : dx < -Math.abs(dz) / 2 ? 'west' : ''
  return ns && ew ? `${ns}${ew}` : ns || ew || 'here'
}

/** The best coastal site a lander at `from` could make for: legal to found, land beside water the
 *  lander can reach, within `reach` tiles of sailing (three turns of it unless told otherwise),
 *  scored by the ring, with a good deal for a coast that can feed a settlement (food, timber and
 *  fresh water within reach, which is what the generator measured the splashdown against) and less
 *  for every turn of sailing. Nothing closer to a tile in `avoid` than its clearance. Null when
 *  there is no coast within reach. */
export function bestLanding(s: GameState, from: number, reach = C.lander.moves * C.lander.autopilot.reachTurns, avoid: { tile: number; clear: number }[] = []): { tile: number; water: number; score: number } | null {
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
    if (avoid.some(a => dist(w, a.tile, i) < a.clear)) continue
    // the water tile beside it that the lander can reach soonest
    let water = -1, wd = 1e9
    for (const n of neighbours8(w, h, i)) if (tiles[n].terrain === 'water' && d[n] >= 0 && d[n] < wd) { wd = d[n]; water = n }
    if (water < 0) continue
    const viable = landingViable(w, h, tiles, i) ? C.lander.autopilot.viableBonus : 0
    const score = siteScore(s, i) + viable - (wd / C.lander.moves) * C.lander.autopilot.sailPenaltyPerTurn
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
  // a sailing distance of one is the water beside the coast, where the lander can already found
  return d[lander.tile] < 0 ? Infinity : Math.ceil((d[lander.tile] - 1) / C.lander.moves)
}
