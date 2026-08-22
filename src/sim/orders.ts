// Standing orders. Turn queue brief section 3 and 11, interaction brief section 4. Automation never
// fights: it moves goods and units along routes the player set, stops when something is in the way,
// and says so in the queue. The consign rule is handled by the market system; this handles surplus
// shipped between settlements, improver tasks, and the orders units carry.

import type { GameState, TurnContext, QueueItem, Unit, Settlement, GoodId } from './state'
import { GOODS } from './state'
import type { System } from './turn'
import { C } from './constants'
import { findPath, advance, maxMoves, cargoCapacity, isArmed, isHull } from './units'
import { neighbours8, isLand, dist } from './worldgen'
import { isHostileTo } from './military'
import { pick } from './rng'
import { unitLabel } from './queue'

/** Goods in transit between settlements under a surplus rule. Abstract, arriving after a few turns. */
function transits(s: GameState) { if (!s.transits) s.transits = []; return s.transits }

function hostileNear(s: GameState, tile: number, radius: number): boolean {
  const w = s.world.width
  return s.units.some(u => u.owner !== 0 && isArmed(u.kind) && !isHull(u.kind) && isHostileTo(s, u.owner, 0) && dist(w, u.tile, tile) <= radius)
}

function shipSurplus(s: GameState, st: Settlement, ctx: TurnContext) {
  const dest = st.orders.surplus.destination
  if (dest.kind !== 'ship') return
  const to = s.settlements[dest.settlement]
  if (!to || to.owner !== 0) { st.conditions['orderUnsatisfiable'] = st.conditions['orderUnsatisfiable'] ?? s.turn; return }
  const w = s.world.width
  const d = dist(w, st.tile, to.tile)
  if (hostileNear(s, st.tile, 3) || hostileNear(s, to.tile, 3)) { st.conditions['orderBlocked'] = st.conditions['orderBlocked'] ?? s.turn; return }
  delete st.conditions['orderBlocked']
  delete st.conditions['orderUnsatisfiable']
  const threshold = st.orders.surplus.threshold
  // a road most of the way halves the time
  const roaded = neighbours8(w, s.world.height, st.tile).filter(n => s.world.tiles[n].road).length > 0 && neighbours8(w, s.world.height, to.tile).filter(n => s.world.tiles[n].road).length > 0
  const turns = Math.max(1, Math.ceil(d / (roaded ? 4 : 2)))
  for (const g of GOODS) {
    if (g === 'tooling' || g === 'arms' || g === 'horses' || g === 'instruments') continue
    const surplus = st.stock[g] - threshold
    if (surplus >= 10) {
      st.stock[g] -= surplus
      transits(s).push({ to: to.id, good: g, amount: surplus, due: s.turn + turns })
      ctx.log({ kind: 'note', text: `${st.name} sent ${surplus} ${g} to ${to.name} under standing orders, ${turns} turns on the road.`, settlement: st.id })
    }
  }
}

function runImprover(s: GameState, u: Unit, ctx: TurnContext) {
  if (!u.order || u.order.kind !== 'improve') return
  const task = u.order.tasks[0]
  if (!task) { u.order = null; return }
  if (u.tile !== task.tile) {
    const path = findPath(s, u, u.tile, task.tile)
    if (!path) { u.order = null; u.since['contact'] = s.turn; return }
    u.path = path; advance(s, u); return
  }
  const t = s.world.tiles[task.tile]
  const fast = s.charters[0].signatories.includes(3)
  const need = task.task === 'road' && fast ? 1 : C.terrain.improveTurns[task.task] * (fast ? 0.5 : 1)
  u.progress += 1
  if (u.progress < need) return
  u.progress = 0
  u.order.tasks.shift()
  if (task.task === 'road') t.road = true
  else if (task.task === 'clear' && t.forest) {
    t.terrain = C.terrain.forestClearsTo[t.forest]
    t.forest = null
    const home = s.settlements.filter(x => x.owner === 0).reduce<Settlement | null>((a, b) => !a || dist(s.world.width, b.tile, u.tile) < dist(s.world.width, a.tile, u.tile) ? b : a, null)
    if (home) home.stock.timber += C.terrain.clearingTimber
  } else if (task.task === 'plough') t.improved = true
  ctx.log({ kind: 'build', text: `An improver finished ${task.task === 'road' ? 'a road' : task.task === 'clear' ? 'clearing' : 'ploughing'}.`, tile: task.tile })
  if (!u.order.tasks.length) u.order = null
}

function runExplore(s: GameState, u: Unit, ctx: TurnContext) {
  const w = s.world.width, h = s.world.height
  // head for the nearest unexplored land tile, else wander
  let best = -1, bd = 1e9
  for (let i = 0; i < s.world.tiles.length; i++) {
    const t = s.world.tiles[i]
    if (t.explored || !isLand(t) || t.terrain === 'mountain') continue
    const d = dist(w, u.tile, i)
    if (d < bd) { bd = d; best = i }
  }
  if (best < 0) {
    const cands = neighbours8(w, h, u.tile).filter(n => isLand(s.world.tiles[n]) && s.world.tiles[n].terrain !== 'mountain')
    if (!cands.length) return
    best = pick(ctx.rngPlay, cands)
  }
  const path = findPath(s, u, u.tile, best, 120)
  if (!path) { u.order = null; return }
  u.path = path
  advance(s, u)
  for (const n of neighbours8(w, h, u.tile)) s.world.tiles[n].explored = true
  // a predecessor settlement in sight is scouted
  for (const p of s.predecessors) if (dist(w, p.tile, u.tile) <= 2) p.scouted = true
}

function runHaul(s: GameState, u: Unit, ctx: TurnContext) {
  if (!u.order || u.order.kind !== 'haul') return
  const o = u.order
  if (!o.stops.length) { u.order = null; return }
  const stop = o.stops[o.next % o.stops.length]
  const to = s.settlements[stop.settlement]
  if (!to || to.owner !== 0) { u.order = null; u.since['contact'] = s.turn; return }
  if (o.risk === 'avoid' && hostileNear(s, u.tile, 3)) { u.since['contact'] = u.since['contact'] ?? s.turn; return }
  if (u.tile !== to.tile) {
    const path = findPath(s, u, u.tile, to.tile)
    if (!path) { u.since['contact'] = s.turn; return }
    u.path = path; advance(s, u)
    if (u.tile !== to.tile) return
  }
  // at the stop: unload then load
  for (const [g, n] of Object.entries(stop.unload) as [GoodId, number][]) {
    const have = u.cargo[g] ?? 0
    const take = Math.min(have, n)
    if (take > 0) { u.cargo[g] = have - take; to.stock[g] += take; if (u.cargo[g]! <= 0) delete u.cargo[g] }
  }
  let held = Object.values(u.cargo).reduce((a, b) => a + (b ?? 0), 0)
  for (const [g, n] of Object.entries(stop.load) as [GoodId, number][]) {
    const room = cargoCapacity(u) - held
    const take = Math.max(0, Math.min(n, to.stock[g], room))
    if (take > 0) { to.stock[g] -= take; u.cargo[g] = (u.cargo[g] ?? 0) + take; held += take }
  }
  o.next = (o.next + 1) % o.stops.length
  delete u.since['contact']
}

export const ordersSystem: System = {
  id: 'orders',
  enabled: () => C.flags.orders,
  resolve(s: GameState, ctx: TurnContext) {
    // arrivals
    const tr = transits(s)
    for (let i = tr.length - 1; i >= 0; i--) {
      const t = tr[i]
      if (t.due > s.turn) continue
      const to = s.settlements[t.to]
      if (to && to.owner === 0) { to.stock[t.good] += t.amount; ctx.log({ kind: 'note', text: `${t.amount} ${t.good} arrived at ${to.name}.`, settlement: to.id }) }
      tr.splice(i, 1)
    }
    for (const st of s.settlements) if (st.owner === 0) shipSurplus(s, st, ctx)
    for (const u of [...s.units]) {
      if (u.owner !== 0 || !u.order) continue
      switch (u.order.kind) {
        case 'improve': runImprover(s, u, ctx); break
        case 'explore': runExplore(s, u, ctx); break
        case 'goto': {
          if (u.tile === u.order.tile) { u.order = null; break }
          if (!u.path.length) u.path = findPath(s, u, u.tile, u.order.tile) ?? []
          if (!u.path.length) { u.order = null; u.since['contact'] = s.turn; break }
          if (hostileNear(s, u.path[0], 1) && !isArmed(u.kind)) { u.since['contact'] = u.since['contact'] ?? s.turn; break }
          advance(s, u)
          if (u.tile === u.order.tile) u.order = null
          break
        }
        case 'haul': runHaul(s, u, ctx); break
        case 'patrol': {
          const o = u.order
          if (!o.tiles.length) { u.order = null; break }
          const target = o.tiles[o.next % o.tiles.length]
          if (u.tile === target) { o.next = (o.next + 1) % o.tiles.length; break }
          const path = findPath(s, u, u.tile, target)
          if (!path) { o.next = (o.next + 1) % o.tiles.length; break }
          u.path = path; advance(s, u)
          break
        }
        case 'garrison': case 'reserve': case 'screen': break
      }
    }
    // the orders unlock
    if (s.settlements.filter(x => x.owner === 0).length >= 2 || s.turn >= C.onboarding.unlockBackstop.orders) s.charters[0].unlocked.orders = true
    // haulers and improvers idle without an order are noted for the queue by unit items
    void maxMoves
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    for (const st of s.settlements) {
      if (st.owner !== 0) continue
      if (st.conditions['orderBlocked'] !== undefined) out.push({ key: `orderBlocked:${st.id}`, group: 'orderBlocked', type: 3, title: `${st.name} cannot ship its surplus`, body: 'Hostile units are near the road. The goods wait until it is clear.', settlement: st.id, magnitude: 1, since: st.conditions['orderBlocked'], choices: [], opens: 'orders', explain: 'Automation never fights. A blocked order waits and tells you.' })
      if (st.conditions['orderUnsatisfiable'] !== undefined) out.push({ key: `orderUnsat:${st.id}`, group: 'orderUnsat', type: 3, title: `${st.name} has an order it cannot follow`, body: 'The destination settlement is gone or not yours. Set a new surplus rule.', settlement: st.id, magnitude: 1, since: st.conditions['orderUnsatisfiable'], choices: [], opens: 'orders' })
    }
    for (const u of s.units) {
      if (u.owner !== 0 || !u.order) continue
      if (u.since['contact'] !== undefined && (u.order.kind === 'haul' || u.order.kind === 'goto')) {
        out.push({ key: `haulStopped:${u.id}`, group: 'haulStopped', type: 3, title: `A ${unitLabel(u.kind)} stopped on its route`, body: u.order.kind === 'haul' ? 'Hostile units near, or no way through. It waits for you.' : 'No way through to where it was sent.', unit: u.id, tile: u.tile, magnitude: 1, since: u.since['contact'], choices: [{ label: 'Clear the order', action: { t: 'setUnitOrder', unit: u.id, order: null } }], opens: 'unit' })
      }
    }
    return out
  },
}
