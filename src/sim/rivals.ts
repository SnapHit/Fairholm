// Rival charters. Rival charters brief throughout. Three charters at observable depth: real
// settlements and tiles on the map, abstract population and strength underneath. They sell into
// the same Company market, coupled to the player's prices by a fraction. Relations move by what
// happens (crowding, raiding, attack), never by a diplomacy screen. At hard and punitive they may
// declare against their own Company and win or fall.

import type { GameState, TurnContext, QueueItem, Settlement, GoodId } from './state'
import type { System } from './turn'
import { C, difficultyOf } from './constants'
import { foundSettlement } from './settlement'
import { recompute } from './market'
import { chance, pick, next } from './rng'
import { neighbours8, isLand, dist } from './worldgen'
import { spawnHostile, landTileNear } from './military'
import { isArmed, isHull } from './units'

const RIVAL_GOODS: GoodId[] = ['timber', 'ore', 'metal', 'linen', 'cordage', 'dye', 'attar', 'horses', 'flax', 'hemp', 'madder']

function rivalSettlements(s: GameState, id: number): Settlement[] { return s.settlements.filter(x => x.owner === id) }

export function foundRivals(s: GameState, ctx: TurnContext) {
  for (const ch of s.charters) {
    if (ch.player) continue
    if (rivalSettlements(s, ch.id).length) continue
    const tile = landTileNear(s, ch.landing, ctx)
    const st = foundSettlement(s, tile, ch.id, [], `${ch.name.split(' ')[0]} Landing`)
    st.abstractPop = 3
    st.nameChosen = true
    ch.strength = 2
  }
}

function viableSite(s: GameState, tile: number): boolean {
  const t = s.world.tiles[tile]
  if (!isLand(t) || t.terrain === 'mountain') return false
  const w = s.world.width
  if (s.settlements.some(st => dist(w, st.tile, tile) < 3)) return false
  if (s.predecessors.some(p => p.territory.includes(tile))) return false
  let food = 0
  for (const n of neighbours8(w, s.world.height, tile)) { const nt = s.world.tiles[n]; if (nt.terrain === 'grassland' || nt.terrain === 'plains' || nt.terrain === 'water') food++ }
  return food >= 2
}

function expand(s: GameState, id: number, ctx: TurnContext) {
  const w = s.world.width
  const own = rivalSettlements(s, id)
  if (!own.length) return
  const from = pick(ctx.rngPlay, own)
  const cands: number[] = []
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    const x = (from.tile % w) + dx, z = Math.floor(from.tile / w) + dz
    if (x < 0 || z < 0 || x >= w || z >= s.world.height) continue
    const i = z * w + x
    const d = Math.max(Math.abs(dx), Math.abs(dz))
    if (d < 3 || d > 6) continue
    if (viableSite(s, i) && !s.settlements.some(st => st.owner === 0 && dist(w, st.tile, i) < 4)) cands.push(i)
  }
  if (!cands.length) return
  const tile = pick(ctx.rngPlay, cands)
  const ch = s.charters[id]
  const st = foundSettlement(s, tile, id, [], `${ch.name.split(' ')[0]} ${['Reach', 'Cross', 'Ford', 'Stand', 'Hollow', 'Rise', 'Bank', 'Gate'][own.length % 8]}`)
  st.abstractPop = 2
  st.nameChosen = true
  ctx.log({ kind: 'rival', text: `${ch.name} founded ${st.name}.`, tile })
}

export const rivalsSystem: System = {
  id: 'rivals',
  enabled: () => C.flags.rivals,
  resolve(s: GameState, ctx: TurnContext) {
    const diff = difficultyOf(s.settings.difficulty)
    const w = s.world.width
    const mine = s.settlements.filter(x => x.owner === 0)
    const player = s.market.tables[0]
    for (const ch of s.charters) {
      if (ch.player || ch.fell) continue
      const own = rivalSettlements(s, ch.id)
      if (!own.length) continue
      // growth and strength, abstract
      for (const st of own) {
        st.abstractPop += C.rivals.popGrowthPerTurn * (0.6 + next(ctx.rngPlay) * 0.8)
        if (st.abstractPop > 6 && st.buildings.works === 0 && chance(ctx.rngPlay, 0.02)) st.buildings.works = 1
        if (st.abstractPop > 12 && st.buildings.works === 1 && chance(ctx.rngPlay, 0.01)) st.buildings.works = 2
        if (st.abstractPop > 4 && st.buildings.smelter === 0 && chance(ctx.rngPlay, 0.02)) st.buildings.smelter = 1
        if (st.abstractPop > 8 && st.buildings.linenWorks === 0 && chance(ctx.rngPlay, 0.015)) st.buildings.linenWorks = 1
      }
      ch.strength += C.rivals.strengthPerTurn * diff.rivalExpansion
      // expansion slows as a charter grows, and the map caps how many settlements all rivals hold
      const rivalTotal = s.settlements.filter(x => x.owner > 0).length
      const cap = C.rivals.settlementCap[s.settings.size]
      ch.expansion += C.rivals.expansionBase / (1 + own.length * C.rivals.expansionPerSettlement) * diff.rivalExpansion * (0.7 + next(ctx.rngPlay) * 0.6)
      if (ch.expansion >= 1 && rivalTotal < cap) { ch.expansion = 0; expand(s, ch.id, ctx) }
      else if (ch.expansion >= 1) ch.expansion = 1
      // market footprint: they sell into their own table, and a fraction couples into the player's
      const pop = own.reduce((a, st) => a + st.abstractPop, 0)
      const table = s.market.tables[ch.id]
      for (let k = 0; k < 2; k++) {
        const g = pick(ctx.rngPlay, RIVAL_GOODS)
        const units = pop * C.rivals.marketFootprintPerPop * 0.5
        if (table && table[g]) { table[g].pressure += units; recompute(table[g], g) }
        if (player[g]) { player[g].pressure += units * C.market.rivalCoupling; recompute(player[g], g) }
      }
      // relations: crowding and suspicion
      let crowded = 0
      for (const st of own) for (const m of mine) if (dist(w, st.tile, m.tile) <= C.rivals.crowdingRadius) crowded++
      const before = ch.relation
      if (ch.relation === 'peace' && (crowded > 0 && chance(ctx.rngPlay, C.rivals.crowdingRelationPerTurn * crowded) || ch.suspicion >= C.rivals.tenseAt)) ch.relation = 'tense'
      else if (ch.relation === 'tense' && crowded === 0 && ch.suspicion < C.rivals.tenseAt && chance(ctx.rngPlay, 0.01)) ch.relation = 'peace'
      if (ch.relation === 'tense' && ch.suspicion >= C.rivals.warAt) ch.relation = 'war'
      ch.suspicion = Math.max(0, ch.suspicion - 0.005)
      if (before !== ch.relation) ctx.log({ kind: 'rival', text: `${ch.name} are now ${ch.relation} toward you.`, why: ch.relation === 'tense' ? 'Settlements within a few tiles of each other crowd, and crowding wears on relations.' : ch.relation === 'war' ? 'Suspicion became certainty.' : 'Distance and quiet mended it.' })
      // war parties: at war, a rival sends a militia from its nearest settlement now and then
      if (ch.relation === 'war' && chance(ctx.rngPlay, 0.08) && mine.length) {
        const from = own.reduce((a, b) => dist(w, a.tile, mine[0].tile) < dist(w, b.tile, mine[0].tile) ? a : b)
        const fielded = s.units.filter(u => u.owner === ch.id && isArmed(u.kind) && !isHull(u.kind)).length
        if (fielded < Math.max(1, Math.floor(ch.strength / 4))) spawnHostile(s, ch.id, chance(ctx.rngPlay, 0.3) ? 'outrider' : 'militia', from.tile, ch.strength > 12 ? 'hardened' : 'raw')
      }
      // at hard and punitive a rival may tear up its own charter and either win or fall
      if (diff.rivalsMayDeclare && !ch.declared && pop > 20 && s.turn > 150 && chance(ctx.rngPlay, 0.004)) {
        ch.declared = true
        ctx.log({ kind: 'rival', text: `${ch.name} have torn up their charter. Their Company will send a fleet.`, why: 'Rival charters at hard terms can declare. If they win they are independent; if they fall their settlements revert to their Company.' })
      }
      if (ch.declared && !ch.independent && !ch.fell && chance(ctx.rngPlay, 0.02)) {
        if (next(ctx.rngPlay) < Math.min(0.8, ch.strength / 30)) { ch.independent = true; ctx.log({ kind: 'rival', text: `${ch.name} won their war and are independent.` }) }
        else { ch.fell = true; ctx.log({ kind: 'rival', text: `${ch.name} fell. Their settlements are Company holdings now.` }) }
      }
    }
    const anyNear = s.settlements.some(st => st.owner > 0 && mine.some(m => dist(w, st.tile, m.tile) <= 8))
    if (anyNear || s.turn >= C.onboarding.unlockBackstop.rivals) s.charters[0].unlocked.rivals = true
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    if (!s.charters[0].unlocked.rivals) return out
    for (const ch of s.charters) {
      if (ch.player || ch.fell) continue
      if (ch.relation === 'tense' && (ch.suspicion >= C.rivals.warAt * 0.7)) {
        out.push({ key: `tense:${ch.id}`, group: 'tense', type: 3, title: `${ch.name} are close to war`, body: 'Raiding laid at your door and crowding have worn relations thin. Distance and quiet mend them; there is no one to talk to.', explain: 'Relations with the other charters move by what happens, not by what is said.', magnitude: 1, since: s.turn, choices: [] })
      }
    }
    return out
  },
}
