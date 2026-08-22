// Rival expansion, measured. Protects the cap in C.rivals.settlementCap and records, in the test
// output, how many settlements the three rivals hold at turns 100, 250 and 480 by map size and
// charter terms. DECISIONS.md carries the numbers from this build; rerun to refresh them. The
// assertion is only the cap and the absence of crashes; the table is the evidence.

import { describe, it, expect } from 'vitest'
import { createGame, applyAction } from '../src/sim/actions'
import { C } from '../src/sim/constants'

describe('rival expansion', () => {
  it('never exceeds the map cap, and the counts are reported', () => {
    const rows: string[] = ['size\tterms\tt100\tt250\tt480\tcap\trival state at 480']
    for (const size of ['small', 'standard', 'large'] as const) {
      for (const difficulty of ['generous', 'standard', 'hard', 'punitive'] as const) {
        const s = createGame('rivals-' + size + '-' + difficulty, { size, difficulty }, 3)
        applyAction(s, { t: 'land', site: s.world.landingSites[0] })
        s.rng.play = [7, 7, 7, 7]
        const at: Record<number, number> = {}
        for (let i = 0; i < 480; i++) {
          applyAction(s, { t: 'endTurn' })
          const n = s.settlements.filter(x => x.owner > 0).length
          expect(n).toBeLessThanOrEqual(C.rivals.settlementCap[size])
          if (s.turn === 100 || s.turn === 250 || s.turn === 480) at[s.turn] = n
        }
        expect(s.dispatch.filter(d => /system failed this turn/.test(d.text))).toEqual([])
        const state = s.charters.slice(1).map(c => `${c.relation}${c.declared ? (c.independent ? ' independent' : c.fell ? ' fell' : ' declared') : ''}`).join(', ')
        rows.push(`${size}\t${difficulty}\t${at[100]}\t${at[250]}\t${at[480]}\t${C.rivals.settlementCap[size]}\t${state}`)
      }
    }
    console.log(rows.join('\n'))
  }, 120000)
})
