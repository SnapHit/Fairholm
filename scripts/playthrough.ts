// A seeded small map played to the end by the competent policy, its dispatch saved as a report:
// what a whole game reads like, turn by turn, with the milestones at the top. The verification of
// the reachability run (DECISIONS.md 158); rerun after any tuning and read the difference.
//
// Run with:  npx vite-node scripts/playthrough.ts
//            SEED=fairholm-playthrough OUT=reports/playthrough-small.txt npx vite-node scripts/playthrough.ts

import { writeFileSync } from 'node:fs'
import { createGame, applyAction } from '../src/sim/actions'
import { C } from '../src/sim/constants'
import { policyTurn, freshMilestones, noteMilestones } from '../src/sim/policy'
import { nationalResolve } from '../src/sim/grievance'

const SEED = process.env.SEED ?? 'fairholm-playthrough'
const OUT = process.env.OUT ?? 'reports/playthrough-small.txt'
const s = createGame(SEED, { size: 'small', difficulty: 'standard' }, 7)
const m = freshMilestones()
const startPop = s.units.find(u => u.owner === 0 && u.kind === 'lander')?.aboard.length ?? 0
const turns = C.session.sizes.small.turns
const lines: string[] = []
const dispatchSeen = new Set<object>()
const snapshots: string[] = []
while (s.turn < turns) {
  policyTurn(s, 'competent')
  applyAction(s, { t: 'endTurn' })
  noteMilestones(s, m, startPop)
  // the dispatch is capped, so the lines are copied out as they appear
  for (const d of s.dispatch) if (!dispatchSeen.has(d)) { dispatchSeen.add(d); lines.push(`${String(d.turn).padStart(3)}  ${d.kind.padEnd(11)} ${d.text}${d.why ? `  (${d.why})` : ''}`) }
  if (s.turn % 25 === 0) {
    const mine = s.settlements.filter(x => x.owner === 0)
    snapshots.push(`turn ${s.turn}: ${mine.length} settlements, ${mine.reduce((a, st) => a + st.colonists.length, 0)} people, ${Math.round(s.charters[0].gold)} gold, resolve ${Math.round(nationalResolve(s) * 100)}%, fleet ${s.company.fleetStrength}, charge ${Math.round(s.company.charge * 100)}%, rivals ${s.charters.slice(1).map(c => c.relation).join('/')}, ${s.settlements.filter(x => x.owner > 0).length} rival settlements` + (s.declaration?.declared ? `, war: ${s.declaration.waves.length} waves, ${s.company.fleetPool?.length ?? 0} still to come` : ''))
  }
  if (s.declaration && (s.declaration.won || s.declaration.lost) && s.turn > (m.warOver ?? 0) + 3) break
}
const after = (t: number | null) => t === null || m.founded === null ? 'never' : `turn ${t} (${t - m.founded} after founding)`
const share = (t: number | null) => t === null ? 'never' : `turn ${t} (${Math.round(100 * t / turns)}% of the game)`
const head = [
  `Fairholm, a small map, standard terms, seed ${SEED}, played by the competent policy (src/sim/policy.ts).`,
  `${s.turn} turns of ${turns}. ${s.declaration?.won ? 'The charter is torn up and the fleet is spent: won.' : s.declaration?.lost ? 'The Landing fell: lost.' : 'The game ran its course without a war.'}`,
  '',
  'Milestones',
  `  founded                 turn ${m.founded}`,
  `  first consignment       ${after(m.firstConsignment)}`,
  `  first new colonist      ${after(m.firstColonist)}`,
  `  first visible price fall ${after(m.firstPriceFall)}`,
  `  second settlement       ${after(m.secondSettlement)}`,
  `  tier two building       ${share(m.tierTwo)}`,
  `  tier three building     ${share(m.tierThree)}`,
  `  twenty-five people      ${share(m.popTwentyFive)}`,
  `  first Company demand    ${share(m.firstDemand)}`,
  `  a rival left peace      ${share(m.rivalLeftPeace)}`,
  `  declaration available   ${share(m.declarationOpen)}`,
  `  declared                ${share(m.declared)}`,
  `  war over                ${share(m.warOver)}${m.won === null ? '' : m.won ? ', won' : ', lost'}`,
  `  waves ${m.waves}, fleet ${m.fleet}, people ${m.pop}, settlements ${m.settlements}, rival settlements ${m.rivalSettlements}, signatories ${m.signatories}`,
  '',
  'Every twenty-five turns',
  ...snapshots.map(x => '  ' + x),
  '',
  'The dispatch',
]
writeFileSync(OUT, [...head, ...lines].join('\n') + '\n')
console.log(head.slice(0, 20).join('\n'))
console.log(`${lines.length} dispatch lines written to ${OUT}`)
