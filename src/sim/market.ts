// The Company market. Remaining systems proposal section 3. Prices fall with cumulative volume and
// recover when supply stops (ratchet one). Three goods drift upward all game (ratchet two). A
// consignment is processed in lots so a large shipment walks its own price down.

import { C, difficultyOf } from './constants'
import type { GameState, GoodId, PriceTable, PriceEntry, Market, Settlement, TurnContext, QueueItem } from './state'
import { GOODS } from './state'
import type { System } from './turn'
import { wordForValue } from './labour'
import { chance, int } from './rng'
import { isCoastalSettlement } from './settlement'
import { isBlockaded } from './military'

export function initMarket(charters: number): Market {
  const tables: PriceTable[] = []
  for (let i = 0; i < charters; i++) {
    const t = {} as PriceTable
    for (const g of GOODS) {
      const p = C.market.goods[g]
      t[g] = { price: p.open, baseline: p.open, pressure: 0, soldThisTurn: 0, autoPressure: 0 }
    }
    tables.push(t)
  }
  return { tables }
}

export function recompute(e: PriceEntry, g: GoodId): number {
  const p = C.market.goods[g]
  const raw = e.baseline - e.pressure / p.volumeToShift
  e.price = Math.max(p.floor, Math.min(p.ceiling, Math.round(raw)))
  return e.price
}

export function sellPrice(s: GameState, g: GoodId, charter = 0): number {
  return s.market.tables[charter][g].price
}

export function buyPrice(s: GameState, g: GoodId, charter = 0): number {
  let spread = C.market.goods[g].spread
  if (s.charters[0].signatories.includes(1)) spread = Math.max(1, Math.round(spread * 0.5))
  return s.market.tables[charter][g].price + spread
}

/** The third soft pressure: freight distance to the water. Freight landers come down offshore of
 *  any coastal settlement the player owns, so a coastal settlement pays nothing and an inland one
 *  pays for the haul to the nearest coastal one. Setting brief section 7. */
export function freightLoss(s: GameState, st: Settlement): number {
  if (st.buildings.consignment > 0) return 0
  if (isCoastalSettlement(s, st)) return 0
  const w = s.world.width
  let d = Infinity
  for (const o of s.settlements) {
    if (o.owner !== 0 || !isCoastalSettlement(s, o)) continue
    const dd = Math.max(Math.abs(o.tile % w - st.tile % w), Math.abs(Math.floor(o.tile / w) - Math.floor(st.tile / w)))
    if (dd < d) d = dd
  }
  if (!isFinite(d)) return C.market.freightLossMax
  return Math.min(C.market.freightLossMax, d * C.market.freightLossPerTile)
}

/** Can this settlement consign at all? Coastal, or holding a consignment office. Inland settlements
 * without an office must haul to the coast. See DECISIONS.md. */
export function canConsign(s: GameState, st: Settlement): { ok: boolean; reason?: string } {
  if (isBlockaded(s, st)) return { ok: false, reason: 'Blockaded. A hostile armed ship lies off the settlement.' }
  if (st.buildings.consignment > 0) return { ok: true }
  if (isCoastalSettlement(s, st)) return { ok: true }
  return { ok: false, reason: 'Inland. Haul goods to the coast, or build a consignment office.' }
}

export function isEmbargoed(s: GameState, g: GoodId): boolean {
  return s.company.embargoed.includes(g)
}

export interface SaleResult { units: number; gold: number; word: number; first: number; last: number; due: number }

/** Consign goods from a settlement. Processed in lots; the price recalculates between lots. The
 * revenue is paid after the crossing, with Word. Smuggler's rate applies after the declaration. A
 * sale made by standing order (`automatic`) is remembered as such on the price, for the dumping card. */
export function consign(s: GameState, st: Settlement, g: GoodId, amount: number, ctx: TurnContext | null, viaOffice = false, automatic = false): SaleResult {
  const table = s.market.tables[0]
  const e = table[g]
  const p = C.market.goods[g]
  const result: SaleResult = { units: 0, gold: 0, word: 0, first: e.price, last: e.price, due: s.turn }
  if (!p.traded) return result
  if (isEmbargoed(s, g) && !viaOffice) return result
  amount = Math.min(amount, st.stock[g])
  if (amount <= 0) return result
  const smuggling = !!(s.declaration?.declared && !s.declaration.won)
  const rate = (1 - s.company.charge) * (1 - freightLoss(s, st)) * (smuggling ? C.market.smugglerRate : 1)
  let remaining = amount
  while (remaining > 0) {
    const lot = Math.min(C.market.lotSize, remaining)
    const value = e.price * lot
    result.gold += value * rate
    result.word += wordForValue(s, value)
    e.pressure += lot
    if (automatic) e.autoPressure = (e.autoPressure ?? 0) + lot
    e.soldThisTurn += lot
    result.last = e.price
    recompute(e, g)
    remaining -= lot
    result.units += lot
  }
  st.stock[g] -= amount
  result.gold = Math.round(result.gold)
  result.word = Math.round(result.word * 10) / 10
  const due = s.turn + C.market.crossingTurns[s.settings.crossing]
  result.due = due
  s.company.payments.push({ due, gold: result.gold, word: result.word })
  if (s.telemetry.firstConsignment === null) s.telemetry.firstConsignment = s.turn
  if (ctx) {
    const fell = result.first - e.price
    ctx.log({
      kind: 'market',
      text: `${st.name} consigned ${amount} ${g} at ${result.first}${fell > 0 ? ` falling to ${e.price}` : ''}. ${result.gold} gold due in ${due - s.turn} turns.`,
      why: fell > 0 ? `The Company pays less the more of a good it has been sent. ${amount} units moved the price by ${fell}.` : 'Sold below the volume that moves the price.',
      settlement: st.id,
    })
  }
  return result
}

export function buyFromCompany(s: GameState, st: Settlement, g: GoodId, amount: number): number {
  const price = buyPrice(s, g)
  const ch = s.charters[0]
  const affordable = Math.min(amount, Math.floor(ch.gold / price))
  if (affordable <= 0) return 0
  ch.gold -= affordable * price
  st.stock[g] += affordable
  return affordable
}

/** The goods the player's own standing orders have dumped: a fall below the baseline of at least
 *  `dumpingAlertDrop` of it, of which at least `dumpingAlertShare` is automatic selling. For the
 *  dumping card and for anyone else who needs to say so. */
export function dumpedGoods(s: GameState): { good: GoodId; price: number; below: number; autoShare: string }[] {
  const out: { good: GoodId; price: number; below: number; autoShare: string }[] = []
  const table = s.market.tables[0]
  for (const g of GOODS) {
    const p = C.market.goods[g]
    if (!p.traded) continue
    const e = table[g]
    const auto = e.autoPressure ?? 0
    if (e.pressure <= 0 || auto <= 0) continue
    const below = Math.round(e.baseline) - e.price
    if (below < Math.max(1, Math.round(e.baseline * C.market.dumpingAlertDrop))) continue
    const share = auto / e.pressure
    if (share < C.market.dumpingAlertShare) continue
    out.push({ good: g, price: e.price, below, autoShare: share >= 0.95 ? 'all' : share >= 0.75 ? 'most' : 'half' })
  }
  return out
}

/** The good most consigned recently, for the Company's next demand. Falls back to the best price. */
function demandGood(s: GameState): GoodId {
  const table = s.market.tables[0]
  let best: GoodId = 'timber', bestP = -1
  for (const g of GOODS) {
    if (!C.market.goods[g].traded || isEmbargoed(s, g)) continue
    const score = table[g].pressure * 3 + table[g].price
    if (score > bestP) { bestP = score; best = g }
  }
  return best
}

export function answerDemand(s: GameState, accept: boolean, ctx: TurnContext | null) {
  const d = s.company.demand
  if (!d) return
  s.company.demand = null
  const diff = difficultyOf(s.settings.difficulty)
  if (accept) {
    s.company.charge = Math.min(0.8, s.company.charge + d.rise)
    s.company.demandsAccepted++
    ctx?.log({ kind: 'company', text: `You accepted the Company's demand. Its charge on consignments is now ${Math.round(s.company.charge * 100)} per cent.`, why: 'Accepting a demand raises the charge permanently.' })
  } else {
    if (s.company.embargoShield > 0) {
      s.company.embargoShield--
      ctx?.log({ kind: 'company', text: `You refused the Company's demand. Your signatory blocked the embargo that would have followed.` })
    } else {
      if (!s.company.embargoed.includes(d.good)) s.company.embargoed.push(d.good)
      ctx?.log({ kind: 'company', text: `You refused the Company's demand. It struck ${d.good} from your charter: you can no longer consign it.`, why: 'Refusing a demand is a public act. The Company embargoes the good and grievance rises.' })
    }
    const burst = C.market.embargoGrievanceBurst
    s.charters[0].grievance += burst
    s.charters[0].grievanceTotal += burst
    for (const st of s.settlements) if (st.owner === 0) st.grievance += burst / Math.max(1, s.settlements.filter(x => x.owner === 0).length)
  }
  const interval = Math.max(10, Math.round(diff.turnsBetweenDemands * Math.pow(C.market.demandAcceleration, s.company.demandsAccepted)))
  s.company.nextDemandTurn = s.turn + interval
}

/** Turn loop step 7: consignment office sells, prices recover, secular drift applied, demands arrive. */
export const marketSystem: System = {
  id: 'market',
  enabled: c => c.flags.market,
  resolve(s: GameState, ctx: TurnContext) {
    const diff = difficultyOf(s.settings.difficulty)
    // consignment office and surplus orders
    for (const st of s.settlements) {
      if (st.owner !== 0) continue
      const office = st.buildings.consignment > 0
      const dest = st.orders.surplus.destination
      if (!office && dest.kind !== 'consign') continue
      if (!office && !canConsign(s, st).ok) continue
      const threshold = office ? Math.min(st.orders.surplus.threshold, C.market.consignmentOfficeThreshold) : st.orders.surplus.threshold
      for (const g of GOODS) {
        const p = C.market.goods[g]
        if (!p.traded) continue
        if (!office && isEmbargoed(s, g)) continue
        // keep inputs a building needs, and keep tooling, arms and horses which are capability not cargo
        if (g === 'tooling' || g === 'arms' || g === 'horses' || g === 'instruments') continue
        const isInput = Object.values(C.buildings.lines).some(l => (l.input === g || l.secondInput === g) && st.buildings[Object.keys(C.buildings.lines).find(k => C.buildings.lines[k as keyof typeof C.buildings.lines] === l) as keyof typeof st.buildings] > 0)
        const keep = isInput ? threshold * 2 : threshold
        const surplus = st.stock[g] - keep
        if (surplus >= C.market.lotSize) {
          const r = consign(s, st, g, surplus, null, office, true)
          if (r.units > 0) {
            // what the sale did to the price, and what it will pay: a machine that sells for the
            // player says exactly what a player's own consignment says, so the lesson is never missed
            const fell = r.first - r.last
            const e = s.market.tables[0][g]
            const below = Math.round(e.baseline) - e.price
            ctx.log({
              kind: 'market',
              text: `${st.name} ${office ? 'sold' : 'consigned'} ${r.units} ${g} by standing order at ${r.first}${fell > 0 ? `, falling to ${r.last}` : ''}. ${r.gold} gold due in ${r.due - s.turn} turn${r.due - s.turn === 1 ? '' : 's'}.`,
              why: `Surplus above the standing-order threshold is consigned automatically.${fell > 0 ? ` ${r.units} units moved the price by ${fell}.` : ''}${below > 0 ? ` ${g} now stands ${below} below where it would be with nothing sold.` : ''}`,
              settlement: st.id,
            })
          }
        }
      }
    }
    // recovery and drift, per charter table
    for (let ci = 0; ci < s.market.tables.length; ci++) {
      const table = s.market.tables[ci]
      for (const g of GOODS) {
        const e = table[g]
        const p = C.market.goods[g]
        const quiet = e.soldThisTurn < p.recovery * 2
        if (quiet && p.recovery > 0 && e.pressure > 0) {
          const before = e.pressure
          e.pressure = Math.max(0, e.pressure - p.recovery * diff.recoveryRate)
          // the automatic share recovers in step with the whole
          e.autoPressure = before > 0 ? Math.min(e.pressure, (e.autoPressure ?? 0) * (e.pressure / before)) : 0
        }
        if (p.drift > 0) e.baseline = Math.min(p.ceiling, e.baseline + p.drift)
        if (ci === 0 && chance(ctx.rngPlay, C.market.priceJitter)) e.baseline += int(ctx.rngPlay, -1, 1) * 0.5
        e.baseline = Math.max(p.floor, Math.min(p.ceiling, e.baseline))
        e.soldThisTurn = 0
        recompute(e, g)
      }
    }
    // the Company's demands
    if (!s.company.demand && s.turn >= s.company.nextDemandTurn && s.turn >= C.market.demandFirstTurn && !(s.declaration?.declared)) {
      s.company.demand = { turnOffered: s.turn, rise: diff.chargeRise, good: demandGood(s) }
      s.charters[0].unlocked.demands = true
      ctx.log({ kind: 'company', text: `The Company demands a higher charge on consignments: ${Math.round(diff.chargeRise * 100)} points more.`, why: 'Demands arrive on a schedule set by the charter and accelerate as they are accepted.' })
    }
    if (s.company.demand && s.turn - s.company.demand.turnOffered > C.market.demandDeadline) {
      ctx.log({ kind: 'company', text: 'The Company took your silence as acceptance.' })
      answerDemand(s, true, ctx)
    }
    // onboarding: the market unlocks when there is something worth freighting
    if (!s.charters[0].unlocked.market) {
      const worth = s.settlements.filter(st => st.owner === 0).reduce((acc, st) => acc + GOODS.reduce((a, g) => a + (C.market.goods[g].traded ? st.stock[g] * s.market.tables[0][g].price : 0), 0), 0)
      if (worth >= C.onboarding.marketUnlockValue || s.turn >= C.onboarding.unlockBackstop.market) {
        s.charters[0].unlocked.market = true
        s.charters[0].unlocked.marketSince = true
        s.flags['marketUnlockedTurn'] = true
      }
    }
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    // dumping by standing order: a price the player's own automation has walked well down
    for (const d of dumpedGoods(s)) {
      const sellers = s.settlements.filter(st => st.owner === 0 && (st.buildings.consignment > 0 || st.orders.surplus.destination.kind === 'consign'))
      const worst = sellers.sort((a, b) => b.stock[d.good] - a.stock[d.good])[0]
      out.push({
        key: `dumping:${d.good}`, group: 'dumping', type: 1, title: `Your standing orders are dumping ${d.good}`,
        body: `${d.good} stands at ${d.price}, ${d.below} below where it would be with nothing sold, and ${d.autoShare} of that fall is your own automatic selling. Each lot fetches less than the last.`,
        settlement: worst?.id, magnitude: d.below, since: s.turn, choices: [], opens: 'orders',
        explain: 'A standing order sells everything above its threshold every turn, and the Company pays less the more it is sent. Raise the threshold, hold the good, or sell it in smaller lots.',
      })
    }
    if (s.company.demand) {
      const d = s.company.demand
      const left = C.market.demandDeadline - (s.turn - d.turnOffered)
      out.push({
        key: 'demand', group: 'demand', type: 2, title: `The Company demands ${Math.round(d.rise * 100)} points more on its charge`,
        body: `Accept and the charge rises to ${Math.round((s.company.charge + d.rise) * 100)} per cent for good. Refuse and ${d.good} is struck from your charter. ${left} turn${left === 1 ? '' : 's'} to answer.`,
        magnitude: 10, since: d.turnOffered, opens: 'demand',
        choices: [
          { label: 'Accept', action: { t: 'answerDemand', accept: true } },
          { label: `Refuse, lose ${d.good}`, action: { t: 'answerDemand', accept: false } },
        ],
        explain: 'The Company raises its charge over time. Every refusal costs a good and produces grievance.',
      })
    }
    // first consignment opportunity
    const ch = s.charters[0]
    if (ch.unlocked.market && s.telemetry.firstConsignment === null) {
      const st = s.settlements.find(x => x.owner === 0 && canConsign(s, x).ok && GOODS.some(g => C.market.goods[g].traded && x.stock[g] >= 10))
      if (st) out.push({
        key: 'firstConsignment', group: 'firstConsignment', type: 5, title: 'Your first consignment',
        body: `${st.name} holds goods the Company will pay for.`, settlement: st.id, magnitude: 3, since: s.turn, choices: [], opens: 'market',
        explain: 'The Company pays for what you ship, and pays less the more of it you send.',
      })
    }
    return out
  },
}
