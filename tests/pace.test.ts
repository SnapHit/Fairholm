// The reachability tables. Three policies (src/sim/policy.ts) play whole games on three sizes and
// the milestones are printed as a table: turns after founding for the early ones, fraction of the
// game for the rest. DECISIONS.md carries the numbers from this build; rerun to refresh them. The
// assertions are the targets the pace was tuned to, loosely, for the competent policy on small, so
// that a constant moved by accident shows up here.
//
// Narrow a run with PACE_SIZES=small PACE_POLICIES=competent PACE_TERMS=standard.

import { describe, it, expect } from 'vitest'
import { createGame, applyAction } from '../src/sim/actions'
import { C } from '../src/sim/constants'
import { policyTurn, freshMilestones, noteMilestones, POLICIES, type Policy, type Milestones } from '../src/sim/policy'
import type { MapSize, Difficulty } from '../src/sim/state'

const env: Record<string, string | undefined> = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const SIZES: MapSize[] = (env.PACE_SIZES?.split(',') as MapSize[] | undefined) ?? ['small', 'standard', 'large']
const RUN_POLICIES: Policy[] = (env.PACE_POLICIES?.split(',') as Policy[] | undefined) ?? POLICIES
const TERMS: Difficulty[] = (env.PACE_TERMS?.split(',') as Difficulty[] | undefined) ?? ['standard']
const SEED = env.PACE_SEED ?? 'pace'
const SEEDS = Number(env.PACE_SEEDS ?? 1)

export function playGame(policy: Policy, size: MapSize, difficulty: Difficulty, seed = SEED): { m: Milestones; turns: number; dispatch: string[] } {
  const s = createGame(`${seed}-${size}-${difficulty}-${policy}`, { size, difficulty }, 7)
  const m = freshMilestones()
  const startPop = s.units.find(u => u.owner === 0 && u.kind === 'lander')?.aboard.length ?? 0
  const turns = C.session.sizes[size].turns
  while (s.turn < turns) {
    policyTurn(s, policy)
    applyAction(s, { t: 'endTurn' })
    noteMilestones(s, m, startPop)
    if (s.declaration && (s.declaration.won || s.declaration.lost) && s.turn > (m.warOver ?? 0) + 5) break
    const failed = s.dispatch.filter(d => /system failed this turn/.test(d.text))
    if (failed.length) throw new Error(`a system failed on turn ${s.turn}: ${failed[0].text}`)
  }
  return { m, turns, dispatch: s.dispatch.map(d => `${d.turn}\t${d.kind}\t${d.text}`) }
}

function after(m: Milestones, t: number | null): string { return t === null || m.founded === null ? '-' : String(t - m.founded) }
function share(turns: number, t: number | null): string { return t === null ? '-' : `${Math.round(100 * t / turns)}%` }

describe('the pace of a whole game', () => {
  it('three policies on three sizes reach the eras the design wants, and the table is reported', () => {
    const rows: string[] = ['policy\tsize\tterms\tfounded\t+consign\t+colonist\t+pricefall\t+2nd\t2nd%\ttier2\ttier3\tpop25\tdemand\trival\topen\tdeclared\tover\twon\twaves\tfleet\tpop\tsettl\trivals\tsign\tarmed\tgold']
    const results: Record<string, Milestones> = {}
    for (const policy of RUN_POLICIES) for (const size of SIZES) for (const difficulty of TERMS) for (let k = 0; k < SEEDS; k++) {
      const { m, turns } = playGame(policy, size, difficulty, k === 0 ? SEED : `${SEED}${k + 1}`)
      results[`${policy}-${size}-${difficulty}`] = m
      rows.push([policy, size, difficulty + (k ? ` #${k + 1}` : ''), m.founded ?? '-', after(m, m.firstConsignment), after(m, m.firstColonist), after(m, m.firstPriceFall), after(m, m.secondSettlement), share(turns, m.secondSettlement),
        share(turns, m.tierTwo), share(turns, m.tierThree), share(turns, m.popTwentyFive), share(turns, m.firstDemand), share(turns, m.rivalLeftPeace), share(turns, m.declarationOpen), share(turns, m.declared), share(turns, m.warOver),
        m.won === null ? '-' : m.won ? 'yes' : 'no', m.waves, m.fleet, m.pop, m.settlements, m.rivalSettlements, m.signatories, m.armed, m.gold].join('\t'))
    }
    console.log(rows.join('\n'))
    // the targets the pace was tuned to (DECISIONS.md 152 to 155), for the competent policy on small
    // at standard terms, as windows a seed's luck fits inside: a constant moved by accident shows
    // here as a milestone outside its window
    const c = results['competent-small-standard']
    if (c) {
      const turns = C.session.sizes.small.turns
      const founded = c.founded!
      expect(founded).not.toBeNull()
      expect(c.firstConsignment! - founded).toBeGreaterThanOrEqual(4)
      expect(c.firstConsignment! - founded).toBeLessThanOrEqual(20)
      expect(c.firstColonist! - founded).toBeLessThanOrEqual(30)
      expect(c.firstPriceFall! - founded).toBeLessThanOrEqual(40)
      expect(c.secondSettlement! - founded).toBeLessThanOrEqual(50)
      expect(c.tierTwo! / turns).toBeLessThanOrEqual(0.45)
      expect(c.popTwentyFive! / turns).toBeGreaterThanOrEqual(0.25)
      expect(c.popTwentyFive! / turns).toBeLessThanOrEqual(0.65)
      expect(c.declarationOpen! / turns).toBeGreaterThanOrEqual(0.5)
      expect(c.declarationOpen! / turns).toBeLessThanOrEqual(0.8)
      expect(c.declared).not.toBeNull()
      expect(c.waves).toBeGreaterThanOrEqual(3)
      expect(c.fleet).toBeGreaterThanOrEqual(12)
      expect(c.fleet).toBeLessThanOrEqual(30)
      // before halfway is the target; a competent player who holds a good whose price it has walked
      // down undercuts nobody, so crowding alone has to do it on some seeds, a little later
      expect(c.rivalLeftPeace! / turns).toBeLessThanOrEqual(0.75)
    }
  }, 600000)
})
