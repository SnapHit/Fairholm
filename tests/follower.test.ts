// A player who does only what the cards offer (DECISIONS.md 194 to 199). On three small worlds on
// generous terms, for 150 turns, it takes the first fix of the highest card that offers one, or the
// one tap of a group that has it, up to eight a turn, and makes the one gesture the cards teach: a
// colonist with no orders is held on the best marked ground within a walk and let go. Nothing else.
//
// It protects three things the cards promise. A fix changes what it fixes: no tap leaves its card
// as it was. The cards alone grow a colony: a second settlement and six new kinds of building on
// every world. And the card at the top leads somewhere: fewer than one turn in ten has a top card
// with nothing to do, or the same card fixed at the top two turns running.

import { describe, it, expect } from 'vitest'
import { createGame, applyAction, fixAll, type Action } from '../src/sim/actions'
import { deriveQueue, bulkFix } from '../src/sim/queue'
import { SYSTEMS } from '../src/sim/systems'
import { openingAction, bestSites } from '../src/sim/autopilot'
import type { GameState, QueueItem, DerivedQueue } from '../src/sim/state'

const TURNS = 150
const SEEDS = ['follow-seed', 'follow-two', 'follow-three']

function tryApply(s: GameState, a: Action): boolean { try { applyAction(s, a); return true } catch { return false } }
const mine = (s: GameState) => s.settlements.filter(x => x.owner === 0)
const lines = (s: GameState) => mine(s).reduce((n, st) => n + Object.values(st.buildings).filter(t => t > 0).length, 0)
const cards = (q: DerivedQueue) => [...q.shown, ...q.folded].flatMap(g => g.items)
const same = (a: QueueItem | undefined, b: QueueItem) => !!a && a.body === b.body && a.choices[0]?.label === b.choices[0]?.label

/** The lander sailed to the best coast and beached, as the opening card leads. */
function found(s: GameState) {
  for (let t = 0; t < 60 && !mine(s).length; t++) {
    for (let k = 0; k < 6; k++) { const a = openingAction(s); if (!a || !tryApply(s, a)) break; if (mine(s).length) break }
    if (!mine(s).length) applyAction(s, { t: 'endTurn' })
  }
}

/** One tap: the group tap of the highest group that has one and takes something, or else the first
 *  fix of the highest card that offers one. Returns the cards the tap was for, or null. */
function tap(s: GameState): QueueItem[] | null {
  const q = deriveQueue(s, SYSTEMS)
  for (const g of [...q.shown, ...q.folded]) {
    const bulk = bulkFix(g)
    if (bulk && fixAll(s, bulk.keys).length) return g.items.filter(it => bulk.keys.includes(it.key))
    for (const it of g.items) if (it.choices[0] && tryApply(s, it.choices[0].action as Action)) return [it]
  }
  return null
}

function follow(seed: string) {
  const s = createGame(seed, { size: 'small', difficulty: 'generous' }, 7)
  found(s)
  expect(mine(s).length, seed).toBe(1)
  const start = s.turn, lines0 = lines(s)
  let unchanged = 0, nowhere = 0, circles = 0, prev = ''
  const left: string[] = []
  while (s.turn < start + TURNS) {
    const top = deriveQueue(s, SYSTEMS).shown[0]
    const topFix = top?.items.find(it => it.choices.length > 0)
    for (let k = 0; k < 8; k++) {
      const took = tap(s)
      if (!took) break
      const now = cards(deriveQueue(s, SYSTEMS))
      for (const it of took) if (same(now.find(x => x.key === it.key), it)) { unchanged++; left.push(`${s.turn} ${it.key}: ${it.choices[0].label}`) }
    }
    if (top && !topFix) nowhere++
    if (topFix && topFix.key === prev) circles++
    prev = topFix?.key ?? ''
    // the one gesture: hold the best marked ground and let go
    for (const u of s.units.filter(x => x.owner === 0 && x.kind === 'colonist' && !x.order)) {
      const site = bestSites(s, { tile: u.tile }, 1, { walk: true, seen: true })[0]
      if (site !== undefined && site !== u.tile) tryApply(s, { t: 'moveUnit', unit: u.id, path: [site] })
    }
    applyAction(s, { t: 'endTurn' })
  }
  return { settlements: mine(s).length, built: lines(s) - lines0, unchanged, left, nowhere, circles }
}

describe('a player who only takes what the cards offer', () => {
  it('grows a colony on every world, and every tap changes what it was for', () => {
    let bad = 0
    for (const seed of SEEDS) {
      const r = follow(seed)
      console.log(`follower ${seed}: ${r.settlements} settlements, ${r.built} new kinds of building, ${r.unchanged} taps left their card as it was, top card led nowhere on ${r.nowhere} and round in circles on ${r.circles} of ${TURNS} turns`)
      expect(r.left, `${seed}: taps that left their card as it was`).toEqual([])
      expect(r.settlements, seed).toBeGreaterThanOrEqual(2)
      expect(r.built, seed).toBeGreaterThanOrEqual(6)
      bad += r.nowhere + r.circles
    }
    expect(bad / (SEEDS.length * TURNS)).toBeLessThan(0.1)
  }, 60000)
})
