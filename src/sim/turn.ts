// The turn loop, build specification section 6. Order matters and getting it wrong produces bugs that
// present as balance problems. When something feels wrong in the economy, check this order before
// touching a constant.
//
//  1. Advance turn counter and season
//  2. Production. Tiles, then buildings
//  3. Consumption. Food eaten, imported machines consume Instruments, buildings consume inputs
//  4. Growth
//  5. Construction
//  6. Orders. Haulers run routes, units execute standing orders
//  7. Market. Consignment office sells, prices recover, secular drift applied
//  8. Word and passage
//  9. Grievance
// 10. Rivals
// 11. Predecessors
// 12. Fleet
// 13. Combat
// 14. Spoilage
// 15. Queue. Derived last, always, from the settled world. See queue.ts; it is never stored.

import { C, type Constants } from './constants'
import type { GameState, TurnContext, QueueItem, DispatchEntry } from './state'
import { maxMoves } from './units'

/** Every simulation system exports this shape, so the turn loop is uniform and a stub is safe.
 * A stubbed system returns false from enabled, does nothing in resolve, and returns an empty array. */
export interface System {
  id: string
  enabled(c: Constants): boolean
  resolve(s: GameState, ctx: TurnContext): void
  queueItems(s: GameState): QueueItem[]
}

/** A working no-op, for anything not finished. */
export function noopSystem(id: string): System {
  return { id, enabled: () => false, resolve: () => {}, queueItems: () => [] }
}

export function makeContext(s: GameState): TurnContext {
  return {
    rngPlay: s.rng.play,
    log: (e: Omit<DispatchEntry, 'turn'>) => pushDispatch(s, { ...e, turn: s.turn }),
  }
}

export function pushDispatch(s: GameState, e: DispatchEntry) {
  s.dispatch.push(e)
  if (s.dispatch.length > C.session.dispatchCap) s.dispatch.splice(0, s.dispatch.length - C.session.dispatchCap)
}

export function season(turn: number): 0 | 1 | 2 | 3 {
  // turn 1 is the first month after landing, in new green
  const t = Math.max(0, turn - 1)
  return (Math.floor((t % C.session.turnsPerYear) / C.session.turnsPerSeason) % 4) as 0 | 1 | 2 | 3
}

export function year(turn: number): number {
  return Math.floor(Math.max(0, turn - 1) / C.session.turnsPerYear) + 1
}

export const SEASON_NAMES = ['new green', 'deep summer', 'the turn of the leaf', 'bare ground']

/** Run one turn over the given systems, in the order given. Mutates the draft in place. */
export function runTurn(s: GameState, systems: System[]): void {
  s.turn++
  s.actionsThisTurn = 0
  const ctx = makeContext(s)
  for (const sys of systems) {
    if (!sys.enabled(C)) continue
    try {
      sys.resolve(s, ctx)
    } catch (err) {
      // A system must never take the turn loop down. Record it and carry on.
      pushDispatch(s, { turn: s.turn, kind: 'note', text: `The ${sys.id} system failed this turn and was skipped: ${(err as Error).message}` })
    }
  }
  // restore movement for every unit
  for (const u of s.units) u.moves = maxMoves(u)
}

/** Gather queue items from every enabled system. */
export function collectQueueItems(s: GameState, systems: System[]): QueueItem[] {
  const out: QueueItem[] = []
  for (const sys of systems) {
    if (!sys.enabled(C)) continue
    try { out.push(...sys.queueItems(s)) } catch { /* a broken queue source is skipped, never fatal */ }
  }
  return out
}
