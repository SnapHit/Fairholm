// The predecessor peoples. Remaining systems proposal section 5 and colonists brief section 9.
// They buy manufactured goods only, pay a premium for what they want most, never the same good
// twice running, never more than a cap in one transaction, with no Company charge. Each people
// teaches one of the four crops to one colonist, ever. Taking their ground raises their alarm;
// an agent stationed with them slows it and improves the terms. They are never conquerable.

import type { GameState, TurnContext, Unit, GoodId, QueueItem, PredecessorSettlement } from './state'
import type { System } from './turn'
import { C, difficultyOf } from './constants'
import { sellPrice } from './market'
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

export function offerToPredecessor(s: GameState, u: Unit, pi: number, g: GoodId, amount: number, haggle: boolean, ctx: TurnContext) {
  const p = predecessorOf(s, pi)
  if (!adjacent(s, u, p)) throw new Error('not beside them')
  if (p.closed) throw new Error('they are closed to you')
  if (p.alarm > C.predecessors.alarmRefuse) throw new Error('they will not trade while alarmed')
  if (!MANUFACTURED.includes(g)) throw new Error('they buy manufactured goods only')
  if (p.lastBought === g) throw new Error('they bought that last time')
  const have = u.cargo[g] ?? 0
  amount = Math.min(amount, have)
  if (amount <= 0) throw new Error('nothing to offer')
  let price = predecessorPrice(s, p, g, u)
  if (haggle) {
    if (chance(ctx.rngPlay, C.predecessors.haggleSuccess)) price = Math.round(price * (1 + C.predecessors.haggleGain))
    else price = Math.round(price * (1 - C.predecessors.haggleGain * 0.5))
  }
  // the cap and their purse both bound the sale
  const capUnits = Math.max(1, Math.floor(C.predecessors.transactionCap / price))
  amount = Math.min(amount, capUnits, Math.max(1, Math.floor((p.wealth + 200) / price)))
  const value = amount * price
  u.cargo[g] = have - amount
  if ((u.cargo[g] ?? 0) <= 0) delete u.cargo[g]
  // in kind: gold from their store, and a gift of what they grow when they are pleased
  s.charters[0].gold += value
  p.wealth = Math.max(0, p.wealth - value * 0.35) + value * 0.1
  p.lastBought = g
  let gift = ''
  if (chance(ctx.rngPlay, C.predecessors.giftChance)) {
    const crop = p.teaches as GoodId
    u.cargo[crop] = (u.cargo[crop] ?? 0) + C.predecessors.giftAmount
    gift = ` They added ${C.predecessors.giftAmount} ${crop} as a gift.`
  }
  p.scouted = true
  s.charters[0].unlocked.predecessors = true
  ctx.log({ kind: 'predecessor', text: `${p.name} took ${amount} ${g} for ${value} gold.${gift}`, why: g === p.strong ? `${g} is what they want most, so they paid the strong premium.` : 'No Company charge is paid on trade with them.', tile: p.tile })
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
      // ground taken inside their territory alarms them
      let taken = 0
      for (const t of p.territory) if (s.world.tiles[t].owner === 0) taken++
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
      // a unit beside them scouts them
      for (const u of s.units) if (u.owner === 0 && adjacent(s, u, p)) { p.scouted = true; s.charters[0].unlocked.predecessors = true }
    }
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
