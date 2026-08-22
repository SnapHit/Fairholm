// Grievance and signatories. Remaining systems proposal sections 1 and 2. Grievance is gathered by
// civic workers at the meeting house and spread by the press; it raises a settlement's resolve,
// buys signatories, and scales the recall fleet the Company will send. The declaration opens at
// sixty per cent resolve across the player's settlements.

import type { GameState, TurnContext, QueueItem, Settlement, SignatoryCategory } from './state'
import type { System } from './turn'
import { C, difficultyOf } from './constants'
import { buildingWorkers } from './labour'

export interface Signatory { index: number; category: SignatoryCategory; name: string; effect: string }

/** The twelve, in recruitment order within their category. Indexes are zero-based everywhere. */
export const SIGNATORIES: Signatory[] = [
  { index: 0, category: 'trade', name: 'Ansel Marrow', effect: 'a consignment office can be built' },
  { index: 1, category: 'trade', name: 'Ottilie Bracken', effect: 'the Company spread is halved' },
  { index: 2, category: 'trade', name: 'Piers Vellacott', effect: 'embargoes lifted, the next two blocked' },
  { index: 3, category: 'land', name: 'Hesper Quill', effect: 'improvers work twice as fast, roads are free' },
  { index: 4, category: 'land', name: 'Rook Dunmore', effect: 'new settlements are founded with a palisade' },
  { index: 5, category: 'land', name: 'Idony Stray', effect: 'the whole coast is surveyed' },
  { index: 6, category: 'arms', name: 'Caleb Thorne', effect: 'batteries cost less' },
  { index: 7, category: 'arms', name: 'Maud Ferrier', effect: 'faster promotion, militia sworn in' },
  { index: 8, category: 'arms', name: 'Jory Lask', effect: 'coastal batteries count double' },
  { index: 9, category: 'voice', name: 'Wren Calloway', effect: 'the bulletin can be printed' },
  { index: 10, category: 'voice', name: 'Tobias Hale', effect: 'grievance gathers half again as fast' },
  { index: 11, category: 'voice', name: 'Eliza Penhallow', effect: 'passages cost half' },
]

export function signatoryList(): Signatory[] { return SIGNATORIES }

export function signatoryCost(n: number): number { return C.grievance.signatoryFirstCost + n * C.grievance.signatoryStep }

/** Grievance a settlement gathers this turn. Two at the meeting house, each worth three, the press
 * multiplies, the bulletin multiplies more, capped per settlement. */
export function grievanceGathered(s: GameState, st: Settlement): number {
  if (st.buildings.meeting === 0) return 0
  let g = buildingWorkers(st, 'meeting') * C.grievance.perWorker
  if (g <= 0) return 0
  if (st.buildings.press >= 2) g *= C.grievance.bulletinMultiplier
  else if (st.buildings.press >= 1) g *= C.grievance.pressMultiplier
  g += buildingWorkers(st, 'press') * C.grievance.perWorker * 0.5
  if (s.charters[0].signatories.includes(10)) g *= 1 + C.grievance.signatoryVoiceBonus
  return Math.min(C.grievance.maxPerSettlement, g)
}

export function nationalResolve(s: GameState): number {
  const mine = s.settlements.filter(x => x.owner === 0)
  const pop = mine.reduce((a, st) => a + st.colonists.length, 0)
  if (pop === 0) return 0
  return mine.reduce((a, st) => a + Math.min(1, st.resolve) * st.colonists.length, 0) / pop
}

export function fleetStrengthFor(s: GameState): number {
  const diff = difficultyOf(s.settings.difficulty)
  const units = C.military.fleetBase + s.charters[0].grievanceTotal * C.military.fleetPerGrievance * diff.fleetMultiplier
  return Math.min(C.military.fleetMaxUnits, Math.round(units * 10) / 10)
}

function nextSignatory(s: GameState): Signatory | null {
  const ch = s.charters[0]
  const open = SIGNATORIES.filter(x => !ch.signatories.includes(x.index))
  if (!open.length) return null
  const inTarget = open.filter(x => x.category === ch.signatoryTarget)
  return inTarget[0] ?? open[0]
}

export function applySignatory(s: GameState, sig: Signatory, ctx: TurnContext) {
  const ch = s.charters[0]
  ch.signatories.push(sig.index)
  switch (sig.index) {
    case 2:
      s.company.embargoed = []
      s.company.embargoShield += 2
      break
    case 5:
      for (const t of s.world.tiles) t.explored = true
      break
    case 7:
      for (const u of s.units) if (u.owner === 0 && (u.kind === 'militia' || u.kind === 'outrider') && u.quality === 'raw') u.quality = 'hardened'
      break
  }
  ctx.log({ kind: 'event', text: `${sig.name} put their name to the cause: ${sig.effect}.`, why: `Signatories are bought with grievance. The next costs ${signatoryCost(ch.signatories.length)}.` })
}

export const grievanceSystem: System = {
  id: 'grievance',
  enabled: () => C.flags.grievance,
  resolve(s: GameState, ctx: TurnContext) {
    const ch = s.charters[0]
    for (const st of s.settlements) {
      if (st.owner !== 0) continue
      const g = grievanceGathered(s, st)
      if (g > 0) {
        st.grievance += g
        ch.grievance += g
        ch.grievanceTotal += g
        ch.unlocked.grievance = true
      } else {
        st.grievance *= 1 - C.grievance.decayPerTurn
      }
      const need = C.grievance.perPopulationForResolve * Math.max(1, st.colonists.length)
      st.resolve = Math.min(1.2, st.grievance / need)
    }
    s.company.fleetStrength = fleetStrengthFor(s)
    let guard = 0
    while (C.flags.signatories && guard++ < 3) {
      const cost = signatoryCost(ch.signatories.length)
      if (ch.grievance < cost) break
      const sig = nextSignatory(s)
      if (!sig) break
      ch.grievance -= cost
      applySignatory(s, sig, ctx)
      ch.unlocked.signatories = true
    }
    const pop = s.settlements.filter(x => x.owner === 0).reduce((a, st) => a + st.colonists.length, 0)
    if (pop >= C.onboarding.grievanceUnlockPop || s.turn >= C.onboarding.unlockBackstop.grievance) ch.unlocked.grievance = true
    if (s.turn >= C.onboarding.unlockBackstop.signatories) ch.unlocked.signatories = true
    if (nationalResolve(s) >= C.grievance.declarationGate || s.turn >= C.onboarding.unlockBackstop.fleet) ch.unlocked.fleet = true
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    const ch = s.charters[0]
    if (!ch.unlocked.grievance) return out
    const mine = s.settlements.filter(x => x.owner === 0)
    for (const st of mine) {
      if (st.buildings.meeting === 0 && st.colonists.length >= C.onboarding.grievanceUnlockPop && !st.buildQueue.some(b => b.line === 'meeting') && !(st.building && st.building.id.line === 'meeting')) {
        out.push({
          key: `meeting:${st.id}`, group: 'meeting', type: 5, title: `${st.name} could hold a meeting house`, body: 'A meeting house gathers grievance against the Company. Grievance buys signatories and, in the end, the declaration.',
          explain: 'Nothing here is forced. Grievance is a slow thing you choose to start.', settlement: st.id, magnitude: 1, since: s.turn, choices: [{ label: 'Queue it', action: { t: 'setBuildOrder', settlement: st.id, queue: [...st.buildQueue, { line: 'meeting', tier: 1 }] } }], opens: 'settlement',
        })
      }
    }
    if (ch.unlocked.signatories && ch.signatories.length < SIGNATORIES.length && ch.grievance >= signatoryCost(ch.signatories.length) * 0.8 && ch.grievance < signatoryCost(ch.signatories.length)) {
      const sig = nextSignatory(s)
      if (sig) out.push({ key: 'signatory:near', group: 'signatory', type: 5, title: `${sig.name} is close to signing`, body: `${Math.round(signatoryCost(ch.signatories.length) - ch.grievance)} more grievance and ${sig.effect}.`, explain: 'Twelve people of standing can be brought to the cause. Choose which kind you are seeking.', magnitude: 1, since: s.turn, choices: [], opens: 'signatories' })
    }
    const resolve = nationalResolve(s)
    if (ch.unlocked.fleet && !s.declaration?.declared && resolve >= C.grievance.declarationGate) {
      out.push({ key: 'declaration:open', group: 'declaration', type: 5, title: 'The charter could be torn up', body: `Resolve stands at ${Math.round(resolve * 100)} per cent. The recall fleet would be ${Math.round(s.company.fleetStrength)} strong. Declare when you are ready, not before.`, explain: 'The declaration is never forced. The fleet grows with grievance, so the size you would face is always in view.', magnitude: 0.5, since: s.turn, choices: [], opens: 'declaration' })
    }
    return out
  },
}
