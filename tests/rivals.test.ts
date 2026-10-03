// Rival expansion, measured. The drag in src/sim/rivals.ts, not the cap in C.rivals.settlementCap,
// is what sets how many settlements the rivals hold (DECISIONS.md 15 and 149). This protects the
// cap as a backstop, checks that it did not bind on standard terms by the end of a game, and
// records in the test output how many settlements the three rivals hold at turns 100 and 250 and at
// the end of the game by map size and charter terms. DECISIONS.md carries the numbers from this
// build; rerun to refresh them.

import { describe, it, expect } from 'vitest'
import { createGame, applyAction } from '../src/sim/actions'
import { C } from '../src/sim/constants'
import { playOpening } from './helpers'

describe('rival expansion', () => {
  it('runs against a drag, never exceeds the map cap, and the counts are reported', () => {
    const rows: string[] = ['size\tterms\tt100\tt250\tend\tat\tcap\tper rival at end\trival state at end']
    const bound: string[] = []
    for (const size of ['small', 'standard', 'large'] as const) {
      const end = C.session.sizes[size].turns
      for (const difficulty of ['generous', 'standard', 'hard', 'punitive'] as const) {
        const s = createGame('rivals-' + size + '-' + difficulty, { size, difficulty }, 3)
        playOpening(s)
        s.rng.play = [7, 7, 7, 7]
        const at: Record<number, number> = {}
        while (s.turn < end) {
          applyAction(s, { t: 'endTurn' })
          const n = s.settlements.filter(x => x.owner > 0).length
          expect(n).toBeLessThanOrEqual(C.rivals.settlementCap[size])
          if (s.turn === 100 || s.turn === 250 || s.turn === end) at[s.turn] = n
        }
        expect(s.dispatch.filter(d => /system failed this turn/.test(d.text))).toEqual([])
        // the cap is a backstop: on standard terms the curve, not the cap, sets the count
        if (difficulty === 'standard' && at[end] >= C.rivals.settlementCap[size]) bound.push(size)
        const each = s.charters.slice(1).map(c => s.settlements.filter(x => x.owner === c.id).length).join('/')
        const state = s.charters.slice(1).map(c => `${c.relation}${c.declared ? (c.independent ? ' independent' : c.fell ? ' fell' : ' declared') : ''}`).join(', ')
        rows.push(`${size}\t${difficulty}\t${at[100]}\t${at[250]}\t${at[end]}\t${end}\t${C.rivals.settlementCap[size]}\t${each}\t${state}`)
      }
    }
    console.log(rows.join('\n'))
    expect(bound).toEqual([])
  }, 180000)
})
