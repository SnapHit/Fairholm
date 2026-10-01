// Shared by the tests: a game played through its opening by the machine, so that a test about the
// market or the war begins ashore the way a player's game does, with the lander beached and the
// first settlement founded where the autopilot judged best.

import { createGame, applyAction } from '../src/sim/actions'
import { openingAction } from '../src/sim/autopilot'
import type { GameState, Settings } from '../src/sim/state'

/** Sail the player's lander to the best coast and found. Returns the turn the settlement was
 *  founded on, or -1 if the voyage ran out of turns. Nothing else is done with the turns. */
export function playOpening(s: GameState, maxTurns = 40): number {
  for (let i = 0; i < maxTurns; i++) {
    if (s.settlements.some(x => x.owner === 0)) return s.turn
    let guard = 0
    for (;;) {
      const a = openingAction(s)
      if (!a || guard++ > 4) break
      applyAction(s, a)
      if (a.t === 'found') break
    }
    if (s.settlements.some(x => x.owner === 0)) return s.turn
    applyAction(s, { t: 'endTurn' })
  }
  return -1
}

/** A new game, ashore. The play stream is left where the opening left it unless the caller sets it. */
export function arrived(seed: string, partial: Partial<Settings> = {}, now = 5): GameState {
  const s = createGame(seed, partial, now)
  const founded = playOpening(s)
  if (founded < 0) throw new Error(`the opening did not found within forty turns for seed ${seed}`)
  return s
}
