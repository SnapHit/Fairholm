// The predecessor peoples. Remaining systems proposal section 5 and colonists brief section 9.
// They buy manufactured goods only, pay a premium for what they want most, never the same good
// twice running, never more than a cap in one transaction, with no Company charge. Each people
// teaches one of the four crops to one colonist, ever. Taking their ground raises their alarm;
// an agent stationed with them slows it and improves the terms. They are never conquerable.

import type { GameState, TurnContext, Unit, GoodId, QueueItem, PredecessorSettlement } from './state'
import type { System } from './turn'
import { C, difficultyOf } from './constants'
import { dist } from './worldgen'
import { sellPrice, buyPrice } from './market'
import { cargoCapacity } from './units'
import { surplusRuleFor } from './settlement'
import { chance, pick } from './rng'

const MANUFACTURED: GoodId[] = ['metal', 'tooling', 'arms', 'linen', 'cordage', 'dye', 'attar', 'cores', 'horses']

function adjacent(s: GameState, u: Unit, p: PredecessorSettlement): boolean {
  const w = s.world.width
  return Math.abs((p.tile % w) - (u.tile % w)) <= 1 && Math.abs(Math.floor(p.tile / w) - Math.floor(u.tile / w)) <= 1
}

function predecessorOf(s: GameState, i: number): PredecessorSettlement {
  const p = s.predecessors[i]
  if (!p) throw new Error('no such people')
  return p
}

/** What they would pay per unit, before haggling. */
export function predecessorPrice(s: GameState, p: PredecessorSettlement, g: GoodId, u: Unit | null): number {
  if (!MANUFACTURED.includes(g)) return 0
  let price = sellPrice(s, g) * C.predecessors.basePriceFraction
  if (g === p.strong) price *= C.predecessors.strongPremium
  else if (p.minor.includes(g)) price *= C.predecessors.minorPremium
  if (p.agent) price *= C.predecessors.agentTermsBonus
  if (u && u.kind === 'hauler') price *= C.predecessors.haulerBonus
  price *= 1 + Math.min(C.predecessors.wealthPriceCap, p.wealth * C.predecessors.wealthPerTrade)
  return Math.max(1, Math.round(price))
}

/** Their store of goods to give in kind, read safely from a save that predates it. */
export function predecessorStore(p: PredecessorSettlement): Partial<Record<GoodId, number>> {
  if (!p.store) p.store = {}
  return p.store
}

/** How many units of `want` an offer worth `value` buys in kind: the Company's buy price over the
 *  barter bonus, so goods for goods beats buying with the gold they would have paid. */
export function barterUnits(s: GameState, value: number, want: GoodId): number {
  return Math.floor(value * C.predecessors.barterBonus / Math.max(1, buyPrice(s, want)))
}

/** What a people could pay for an offer, and in what. `want` names a good taken in kind from their
 *  store, as far as it and the carrier's room allow, the rest in gold. Shared by the action and the
 *  sheet, so what is shown is what happens. */
export function offerTerms(s: GameState, p: PredecessorSettlement, u: Unit | null, g: GoodId, amount: number, want: GoodId | null, price?: number): { amount: number; price: number; value: number; inKind: number; gold: number } {
  price = price ?? predecessorPrice(s, p, g, u)
  const capUnits = Math.max(1, Math.floor(C.predecessors.transactionCap / price))
  amount = Math.max(0, Math.min(amount, capUnits, Math.max(1, Math.floor((p.wealth + 200) / price))))
  const value = amount * price
  let inKind = 0
  if (want && value > 0) {
    const have = predecessorStore(p)[want] ?? 0
    const held = u ? Object.values(u.cargo).reduce((a, b) => a + (b ?? 0), 0) : 0
    const room = u ? Math.max(0, cargoCapacity(u) - held + amount) : 0
    inKind = Math.min(barterUnits(s, value, want), have, room)
  }
  const covered = want && inKind > 0 ? Math.round(inKind * Math.max(1, buyPrice(s, want)) / C.predecessors.barterBonus) : 0
  return { amount, price, value, inKind, gold: Math.max(0, value - covered) }
}

export function offerToPredecessor(s: GameState, u: Unit, pi: number, g: GoodId, amount: number, haggle: boolean, ctx: TurnContext, want: GoodId | null = null) {
  const p = predecessorOf(s, pi)
  if (!adjacent(s, u, p)) throw new Error('not beside them')
  if (p.closed) throw new Error('they are closed to you')
  if (p.alarm > C.predecessors.alarmRefuse) throw new Error('they will not trade while alarmed')
  if (!MANUFACTURED.includes(g)) throw new Error('they buy manufactured goods only')
  if (p.lastBought === g) throw new Error('they bought that last time')
  if (want === g) throw new Error('that is what is being offered')
  if (want && !(predecessorStore(p)[want] ?? 0)) throw new Error(`they have no ${want} to give`)
  const have = u.cargo[g] ?? 0
  amount = Math.min(amount, have)
  if (amount <= 0) throw new Error('nothing to offer')
  let price = predecessorPrice(s, p, g, u)
  if (haggle) {
    if (chance(ctx.rngPlay, C.predecessors.haggleSuccess)) price = Math.round(price * (1 + C.predecessors.haggleGain))
    else price = Math.round(price * (1 - C.predecessors.haggleGain * 0.5))
  }
  // the cap and their purse both bound the sale; their store and the carrier's room bound the kind
  const terms = offerTerms(s, p, u, g, amount, want, price)
  amount = terms.amount
  const value = terms.value
  u.cargo[g] = have - amount
  if ((u.cargo[g] ?? 0) <= 0) delete u.cargo[g]
  // paid in kind as far as it goes, then in gold from their purse; and a gift of what they grow when
  // they are pleased
  if (want && terms.inKind > 0) {
    const store = predecessorStore(p)
    store[want] = (store[want] ?? 0) - terms.inKind
    u.cargo[want] = (u.cargo[want] ?? 0) + terms.inKind
  }
  s.charters[0].gold += terms.gold
  p.wealth = Math.max(0, p.wealth - terms.gold * 0.35) + value * 0.1
  // what they took, they have, and may give in kind to the next who asks
  const store = predecessorStore(p)
  store[g] = Math.min(C.predecessors.storeCap, (store[g] ?? 0) + amount)
  p.lastBought = g
  let gift = ''
  if (chance(ctx.rngPlay, C.predecessors.giftChance)) {
    const crop = p.teaches as GoodId
    u.cargo[crop] = (u.cargo[crop] ?? 0) + C.predecessors.giftAmount
    gift = ` They added ${C.predecessors.giftAmount} ${crop} as a gift.`
  }
  p.scouted = true
  s.charters[0].unlocked.predecessors = true
  const paid = want && terms.inKind > 0 ? `${terms.inKind} ${want}${terms.gold > 0 ? ` and ${terms.gold} gold` : ''}` : `${terms.gold} gold`
  ctx.log({ kind: 'predecessor', text: `${p.name} took ${amount} ${g} for ${paid}.${gift}`, why: want && terms.inKind > 0 ? `Goods for goods: ${want} reckoned at the Company's price over the barter bonus, and no charge paid.` : g === p.strong ? `${g} is what they want most, so they paid the strong premium.` : 'No Company charge is paid on trade with them.', tile: p.tile })
}

/** The surplus rule's offer destination: a settlement's surplus of a manufactured good, above its
 *  threshold, carried to a people within reach and sold for gold on their terms, the anti-repetition
 *  rule included, one good a turn. Nothing moves when they are alarmed or closed, and the queue says
 *  so through the settlement's order conditions. */
function offerSurplus(s: GameState, ctx: TurnContext) {
  for (const st of s.settlements) {
    if (st.owner !== 0) continue
    let any = false, blocked = false, unsatisfiable = false
    for (const g of MANUFACTURED) {
      const rule = surplusRuleFor(st, g)
      if (rule.destination.kind !== 'offer') continue
      any = true
      const p = s.predecessors[rule.destination.predecessor]
      if (!p || dist(s.world.width, st.tile, p.tile) > C.predecessors.offerReach) { unsatisfiable = true; continue }
      if (p.closed || p.alarm > C.predecessors.alarmRefuse) { blocked = true; continue }
      if (p.lastBought === g) continue
      const surplus = st.stock[g] - rule.threshold
      if (surplus < 10) continue
      const terms = offerTerms(s, p, null, g, surplus, null)
      if (terms.amount <= 0) continue
      st.stock[g] -= terms.amount
      s.charters[0].gold += terms.gold
      p.wealth = Math.max(0, p.wealth - terms.gold * 0.35) + terms.value * 0.1
      const store = predecessorStore(p)
      store[g] = Math.min(C.predecessors.storeCap, (store[g] ?? 0) + terms.amount)
      p.lastBought = g
      p.scouted = true
      s.charters[0].unlocked.predecessors = true
      ctx.log({ kind: 'predecessor', text: `${st.name} offered ${terms.amount} ${g} to ${p.name} under standing orders, for ${terms.gold} gold.`, why: 'A surplus rule can offer a good to a people within reach instead of the Company. No charge is paid, and they will not take the same good twice running.', settlement: st.id, tile: p.tile })
      break
    }
    if (!any) continue
    if (unsatisfiable) st.conditions['orderUnsatisfiable'] = st.conditions['orderUnsatisfiable'] ?? s.turn
    if (blocked) st.conditions['orderBlocked'] = st.conditions['orderBlocked'] ?? s.turn
  }
}

export function learnFromPredecessor(s: GameState, u: Unit, pi: number, ctx: TurnContext) {
  const p = predecessorOf(s, pi)
  if (!adjacent(s, u, p)) throw new Error('not beside them')
  if (p.closed || p.alarm > C.predecessors.alarmRefuse) throw new Error('they will not teach while alarmed')
  if (p.taught) throw new Error('they have taught one of yours already')
  if (u.kind !== 'colonist' || !u.colonist) throw new Error('only a colonist can learn')
  if (u.colonist.standing === 'debtor') throw new Error('a debtor cannot be taught')
  u.colonist.standing = 'master'
  u.colonist.speciality = p.teaches
  p.taught = true
  p.scouted = true
  s.charters[0].unlocked.predecessors = true
  ctx.log({ kind: 'predecessor', text: `${p.name} taught your colonist to grow ${p.teaches}. They will teach no one else.`, why: 'The four crops are only ever learnt from the people who were here first, one colonist per settlement of theirs.', tile: p.tile })
}

export function stationAgent(s: GameState, u: Unit, pi: number, ctx: TurnContext) {
  const p = predecessorOf(s, pi)
  if (!adjacent(s, u, p)) throw new Error('not beside them')
  if (p.closed) throw new Error('they are closed to you')
  if (p.agent) throw new Error('an agent is already stationed')
  if (u.kind !== 'colonist' || !u.colonist) throw new Error('only a colonist can be an agent')
  p.agent = true
  p.scouted = true
  s.units = s.units.filter(x => x !== u)
  ctx.log({ kind: 'predecessor', text: `An agent is stationed with ${p.name}. Better terms, and their alarm rises more slowly.`, tile: p.tile })
}

export function scoutPredecessor(s: GameState, u: Unit, pi: number, _ctx: TurnContext) {
  const p = predecessorOf(s, pi)
  if (adjacent(s, u, p)) p.scouted = true
}

export const predecessorsSystem: System = {
  id: 'predecessors',
  enabled: () => C.flags.predecessors,
  resolve(s: GameState, ctx: TurnContext) {
    const diff = difficultyOf(s.settings.difficulty)
    for (const p of s.predecessors) {
      // ground taken inside their territory alarms them, and so does a settlement of the player's
      // founded hard against it: the spacing rule keeps rings apart, so the nearest a settlement
      // can stand is with its ring touching theirs, and that counts as much as a tile taken
      let taken = 0
      for (const t of p.territory) if (s.world.tiles[t].owner === 0) taken++
      for (const st of s.settlements) if (st.owner === 0 && dist(s.world.width, st.tile, p.tile) <= C.predecessors.crowdingReach) taken++
      let rise = taken * C.predecessors.alarmPerTileTaken * diff.alarmSensitivity
      if (p.agent) rise *= C.predecessors.agentAlarmRelief
      const before = p.alarm
      p.alarm = Math.max(0, Math.min(1, p.alarm + rise - C.predecessors.alarmDecay))
      if (before <= C.predecessors.alarmClose && p.alarm > C.predecessors.alarmClose) {
        p.closed = true
        ctx.log({ kind: 'predecessor', text: `${p.name} have closed their gates to you. Too much of their ground has been taken.`, why: 'Alarm rises with every tile of theirs you work. An agent slows it; giving ground back lowers it.', tile: p.tile })
      }
      if (p.closed && p.alarm < C.predecessors.alarmRefuse) { p.closed = false; ctx.log({ kind: 'predecessor', text: `${p.name} will trade with you again.`, tile: p.tile }) }
      // their wants rotate slowly
      if (s.turn % C.predecessors.preferenceRotateEvery === 0) {
        const pool = MANUFACTURED.filter(g => g !== p.strong)
        const next = pick(ctx.rngPlay, pool)
        p.minor = [p.strong, p.minor[0]]
        p.strong = next
      }
      p.wealth = Math.min(C.predecessors.transactionCap, p.wealth + 3)
      // their crop comes in, to the store they trade in kind from
      const store = predecessorStore(p)
      const crop = p.teaches as GoodId
      store[crop] = Math.min(C.predecessors.storeCap, (store[crop] ?? 0) + C.predecessors.storePerTurn)
      // a unit beside them scouts them
      for (const u of s.units) if (u.owner === 0 && adjacent(s, u, p)) { p.scouted = true; s.charters[0].unlocked.predecessors = true }
    }
    offerSurplus(s, ctx)
    if (s.turn >= C.onboarding.unlockBackstop.predecessors) s.charters[0].unlocked.predecessors = true
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    if (!s.charters[0].unlocked.predecessors) return out
    for (const p of s.predecessors) {
      if (p.alarm > C.predecessors.alarmRefuse && !p.closed) {
        out.push({ key: `alarm:${p.id}`, group: 'alarm', type: 3, title: `${p.name} are alarmed`, body: 'They will not trade or teach until their alarm falls. Stop working their ground, or station an agent.', tile: p.tile, magnitude: p.alarm, since: s.turn, choices: [], opens: 'predecessor' })
      }
      // a colonist beside a people who still teach: a chance
      const learner = s.units.find(u => u.owner === 0 && u.kind === 'colonist' && u.colonist && u.colonist.standing !== 'debtor' && adjacent(s, u, p))
      if (learner && !p.taught && !p.closed && p.alarm <= C.predecessors.alarmRefuse) {
        out.push({ key: `learn:${p.id}`, group: 'learn', type: 5, title: `${p.name} would teach ${p.teaches}`, body: `Your colonist beside them can learn to grow ${p.teaches} as a master. They teach one colonist, once.`, explain: 'The four crops come only from the predecessor peoples. A master of a crop doubles its yield.', unit: learner.id, tile: p.tile, magnitude: 2, since: s.turn, choices: [{ label: 'Learn', action: { t: 'learn', unit: learner.id, predecessor: p.id } }], opens: 'predecessor' })
      }
    }
    return out
  },
}
