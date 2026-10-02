// A route: where a unit of the player's would go if told to go to a tile, planned before anything
// moves. Feel brief sections 1 and 4: a hold plots, and only a tap on the route's end or the Go
// control commits. This is the plan the interface draws and the words it says; committing it is the
// ordinary move, attack or boarding action, so what is drawn is what happens.
//
// Planned on what the player knows: water and ground nobody has seen are taken as open (findPath's
// blind planning), units are seen only in sight, settlements only once seen. Where a tile cannot be
// reached the plan says why rather than drawing a way.

import type { GameState, Unit } from './state'
import { C } from './constants'
import { findPath, enterCost, maxMoves, isArmed, isAfloat, isHull } from './units'
import { neighbours8 } from './worldgen'
import { sightMask, canSee, unitVisible, settlementKnown } from './fog'
import { attackOdds } from './military'
import { unitLabel } from './queue'

/** What the last step of a route does: walk onto the tile, attack what is on it, or go aboard the
 *  lander that is on it. */
export type RouteKind = 'move' | 'attack' | 'board'

/** Why a tile cannot be reached. */
export type RouteProblem =
  | 'here'            // the unit is already there
  | 'noMoves'         // nothing left to move with this turn
  | 'landerAshore'    // the lander goes ashore by founding, not by sailing
  | 'shipOnLand'      // a ship held land that is not a port
  | 'landOnWater'     // a land unit held water
  | 'roughGround'     // a hauler held ground it cannot cross
  | 'cannotAttack'    // something of others is there, and this unit does not fight
  | 'noWay'           // the terrain allows no way there
  | 'unitsInWay'      // there is a way, but others' armed units stand across it

export interface Route {
  ok: true
  unit: number
  /** The tile held. For a move the walk ends on it; for an attack or a boarding the walk ends
   *  beside it and the last step is taken onto it. */
  end: number
  kind: RouteKind
  /** The tiles walked, from the first step to the last, not counting where the unit stands. */
  path: number[]
  /** For each tile of the path, whether nobody had seen it when the route was plotted: the way
   *  through it is a guess, and the move stops at any coast it meets there. */
  unseen: boolean[]
  /** Where each turn's movement runs out, as indices into the path; the last is where the walk
   *  ends. Empty when there is no walk, only a last step from where the unit stands. */
  turnEnds: number[]
  /** The turn, one being this one, on which the last step can be taken: the walk's own last turn
   *  for a move, the turn the unit has moves left beside the target for an attack or a boarding. */
  arrives: number
  /** For an attack: the chance it wins, when the target is in sight; null when it cannot be known. */
  odds: number | null
  /** For an attack on a charter not at war with the player: the charter it would declare war on. */
  declares: number | null
  /** For an attack: what is attacked, in words. */
  target: string | null
}

export interface NoRoute {
  ok: false
  unit: number
  end: number
  problem: RouteProblem
  /** Why, in plain words. */
  words: string
  /** For the lander holding the shore beside it: that shore, for the founding control. */
  shore: number | null
}

export type RoutePlan = Route | NoRoute

/** A unit in words as the queue names it, with its article: "A colonist", "Militia", "The lander". */
const label = (u: Unit) => unitLabel(u.kind)
/** The same in the middle of a sentence: "a colonist", "militia", "Company regulars". */
const phrase = (kind: string) => { const l = unitLabel(kind); return l.startsWith('Company') ? l : l.charAt(0).toLowerCase() + l.slice(1) }
/** Without its article, after an owner's name: "militia", "outrider", "Company regulars". */
const bare = (kind: string) => phrase(kind).replace(/^(a|an|the) /, '')

/** Plot where a unit of the player's would go if sent to a tile. */
export function planRoute(s: GameState, u: Unit, end: number): RoutePlan {
  const w = s.world.width, h = s.world.height
  const fog = C.flags.fogOfWar
  const t = s.world.tiles[end]
  const known = !fog || t.explored
  const no = (problem: RouteProblem, words: string, shore: number | null = null): NoRoute => ({ ok: false, unit: u.id, end, problem, words, shore })
  if (end === u.tile) return no('here', 'It is already here.')

  // what stands on the tile, as far as the player can see
  const mask = fog ? sightMask(s) : null
  // a ship of others is not something a unit attacks by order (decision 23); it is passed by
  const foreignUnit = s.units.find(o => o.tile === end && o.owner !== u.owner && !isHull(o.kind) && (!mask || unitVisible(s, o, mask)))
  const foreignSettlement = known ? s.settlements.find(st => st.tile === end && st.owner !== u.owner && (!fog || settlementKnown(st))) : undefined
  const ownLander = s.units.find(o => o.tile === end && o.owner === u.owner && o.kind === 'lander')

  // ---- an attack -----------------------------------------------------------------------------
  if (foreignUnit || foreignSettlement) {
    if (!isArmed(u.kind)) {
      return no('cannotAttack', isAfloat(u.kind)
        ? 'Ships fight when they meet; they are not sent to attack.'
        : `${label(u)} cannot attack. Only armed units can.`)
    }
    if (u.moves <= 0) return no('noMoves', 'No moves left this turn. It can go again next turn.')
    const approach = approachTo(s, u, end)
    if (!approach) return wayProblem(s, u, end, no)
    const owner = foreignUnit ? foreignUnit.owner : foreignSettlement!.owner
    const walk = walkTurns(s, u, approach)
    const what = foreignSettlement ? foreignSettlement.name : owner === -1 ? phrase(foreignUnit!.kind) : `${s.charters[owner]?.name ?? 'a rival'}'s ${bare(foreignUnit!.kind)}`
    return {
      ok: true, unit: u.id, end, kind: 'attack', path: approach, unseen: approach.map(k => fog && !s.world.tiles[k].explored), turnEnds: walk.ends,
      arrives: walk.left > 0 ? Math.max(1, walk.ends.length) : walk.ends.length + 1,
      odds: !fog || canSee(s, end, mask ?? undefined) ? attackOdds(s, u, end) : null,
      declares: owner > 0 && s.charters[owner]?.relation !== 'war' ? owner : null,
      target: what,
    }
  }

  // ---- going aboard the lander ----------------------------------------------------------------
  if (ownLander && u.kind === 'colonist' && u.colonist) {
    if (u.moves <= 0 && !neighbours8(w, h, u.tile).includes(end)) return no('noMoves', 'No moves left this turn. It can go again next turn.')
    const approach = approachTo(s, u, end)
    if (!approach) return wayProblem(s, u, end, no)
    const walk = walkTurns(s, u, approach)
    return {
      ok: true, unit: u.id, end, kind: 'board', path: approach, unseen: approach.map(k => fog && !s.world.tiles[k].explored), turnEnds: walk.ends,
      // going aboard takes no movement: it happens on the turn the walk reaches the lander
      arrives: Math.max(1, walk.ends.length), odds: null, declares: null, target: null,
    }
  }

  // ---- a move ---------------------------------------------------------------------------------
  if (known && !isFinite(enterCost(s, u, end))) {
    if (u.kind === 'lander') {
      const beside = neighbours8(w, h, u.tile).includes(end)
      return no('landerAshore', beside
        ? 'The lander goes ashore by founding. The control below beaches it here.'
        : 'The lander goes ashore by founding, not by sailing. Sail in beside this shore, then pick it in the lander\'s sheet.', beside ? end : null)
    }
    if (isAfloat(u.kind)) return no('shipOnLand', 'Ships stay on the water. Hold a tile of water, or one of your ports.')
    if (t.terrain === 'water') return no('landOnWater', `${label(u)} cannot go on the water.`)
    if (u.kind === 'hauler') return no('roughGround', 'A hauler needs a road or open country, and this ground is too rough.')
    return no('noWay', `There is no way onto that ground for ${phrase(u.kind)}.`)
  }
  if (u.moves <= 0) return no('noMoves', 'No moves left this turn. It can go again next turn.')
  const path = findPath(s, u, u.tile, end)
  if (!path || !path.length) return wayProblem(s, u, end, no)
  const walk = walkTurns(s, u, path)
  return {
    ok: true, unit: u.id, end, kind: 'move', path, unseen: path.map(k => fog && !s.world.tiles[k].explored), turnEnds: walk.ends,
    arrives: walk.ends.length, odds: null, declares: null, target: null,
  }
}

/** The way to the tile beside a target from which the last step is taken: nothing when the unit is
 *  already beside it, otherwise the shortest way to any tile beside it the unit can stand on. */
function approachTo(s: GameState, u: Unit, target: number): number[] | null {
  const w = s.world.width, h = s.world.height
  if (neighbours8(w, h, u.tile).includes(target)) return []
  let best: number[] | null = null, bestCost = Infinity
  for (const n of neighbours8(w, h, target)) {
    const t = s.world.tiles[n]
    if ((!C.flags.fogOfWar || t.explored) && !isFinite(enterCost(s, u, n))) continue
    const p = findPath(s, u, u.tile, n)
    if (!p || !p.length) continue
    const c = p.reduce((a, k) => a + stepCost(s, u, k), 0)
    if (c < bestCost) { bestCost = c; best = p }
  }
  return best
}

/** Why there is no way: others' armed units across it, or the ground itself. */
function wayProblem(s: GameState, u: Unit, end: number, no: (p: RouteProblem, words: string) => NoRoute): NoRoute {
  const open = findPath(s, u, u.tile, end, 400, true)
  if (open && open.length) return no('unitsInWay', 'Others\' armed units stand across the way. Go round them, or deal with them first.')
  if (u.kind === 'lander' || isAfloat(u.kind)) return no('noWay', 'There is no way there by water from here.')
  return no('noWay', `There is no way there over land from here for ${phrase(u.kind)}.`)
}

/** What a step onto a tile costs as the plan sees it: the real cost on known ground, the cheapest on
 *  ground nobody has seen, which is how the way was planned. */
function stepCost(s: GameState, u: Unit, tile: number): number {
  if (C.flags.fogOfWar && u.owner === 0 && !s.world.tiles[tile].explored) return 1
  return enterCost(s, u, tile)
}

/** Walk a path as `advance` does, a turn's movement at a time, starting with what the unit has left
 *  now and the whole of its movement on each turn after: where each turn runs out, and what is left
 *  at the end. A unit steps while it has any movement left, so a step may cost more than is left. */
function walkTurns(s: GameState, u: Unit, path: number[]): { ends: number[]; left: number } {
  const ends: number[] = []
  let moves = u.moves
  for (let i = 0; i < path.length; i++) {
    if (moves <= 0) { ends.push(i - 1); moves = maxMoves(u) }
    moves -= stepCost(s, u, path[i])
  }
  if (path.length) ends.push(path.length - 1)
  return { ends, left: moves }
}

