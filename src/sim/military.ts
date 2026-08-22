// Military. Military and revolution brief sections 3 to 9 and 11. Equipment defines the unit;
// combat is best of three exchanges at P = A / (A + D); losers degrade rather than die. Works
// multiply the garrison's defence and cap its size. Ambush flips the terrain bonus against regulars
// in the open. Siege trains breach works after a threshold of adjacent turns. Company and hostile
// rival units are moved here too, toward the nearest player settlement, with a preference for the
// landing.

import type { GameState, TurnContext, Unit, QueueItem, Settlement, Quality } from './state'
import type { System } from './turn'
import { C, difficultyOf } from './constants'
import { unitAttack, unitDefence, isArmed, isCompany, isHull, findPath, advance, makeUnit, maxMoves } from './units'
import { chance, next } from './rng'
import { neighbours8, isLand, dist } from './worldgen'
import { unitLabel } from './queue'

const QUALITY: Quality[] = ['raw', 'hardened', 'sworn']

export function isHostileTo(s: GameState, owner: number, other: number): boolean {
  if (owner === other) return false
  if (owner === -1 || other === -1) return true
  const a = owner === 0 ? other : owner
  return s.charters[a]?.relation === 'war'
}

function settlementAt(s: GameState, tile: number): Settlement | undefined { return s.settlements.find(x => x.tile === tile) }

/** Defence of a single defender on a tile, with terrain, works and coastal battery bonuses. */
export function defenceOf(s: GameState, d: Unit, tile: number): number {
  const st = settlementAt(s, tile)
  const t = s.world.tiles[tile]
  let v = unitDefence(d, !!st)
  if (st) {
    v *= C.military.fortMultipliers[st.buildings.works] ?? 1
    if ((d.kind === 'battery' || d.kind === 'damagedBattery') && d.owner === 0 && s.charters[0].signatories.includes(8)) {
      const coastal = neighbours8(s.world.width, s.world.height, tile).some(n => s.world.tiles[n].terrain === 'water')
      if (coastal) v *= 2
    }
  } else {
    v *= C.military.terrainDefence[t.terrain] ?? 1
    if (t.forest) v *= C.military.forestDefence
    if (t.river) v *= C.military.riverDefence
  }
  return v
}

export function bestDefender(s: GameState, tile: number, owner: number): Unit | null {
  let best: Unit | null = null, bv = -1
  for (const u of s.units) {
    if (u.tile !== tile || u.owner === owner || isHull(u.kind)) continue
    const v = defenceOf(s, u, tile)
    if (v > bv) { bv = v; best = u }
  }
  return best
}

/** Degrade a loser. Returns a description, and removes the unit when it is captured. */
function degrade(s: GameState, u: Unit, victor: Unit, ctx: TurnContext): string {
  const st = settlementAt(s, u.tile)
  switch (u.kind) {
    case 'outrider': u.kind = 'militia'; return 'lost its horses and fights on as militia'
    case 'militia': u.kind = 'colonist'; u.order = null; return 'lost its arms and is a colonist again'
    case 'battery': u.kind = 'damagedBattery'; return 'was damaged, and stays damaged'
    case 'damagedBattery': s.units = s.units.filter(x => x !== u); return 'was destroyed'
    case 'siegeTrain': u.kind = 'damagedSiegeTrain'; return 'was damaged'
    case 'damagedSiegeTrain': s.units = s.units.filter(x => x !== u); return 'was destroyed'
    case 'regulars': case 'horse': s.units = s.units.filter(x => x !== u); return 'was broken and its survivors taken off'
    case 'colonist': case 'improver': case 'hauler': {
      s.units = s.units.filter(x => x !== u)
      if (victor.owner === 0 && u.colonist) {
        // a captured colonist joins the victor's side as a debtor
        const home = s.settlements.find(x => x.owner === 0)
        if (home) { u.colonist.standing = 'debtor'; u.colonist.job = { kind: 'idle' }; home.colonists.push(u.colonist); return `was captured and put to work at ${home.name}` }
      }
      if (st && st.owner === 0) return 'was captured'
      return 'was captured'
    }
    default: s.units = s.units.filter(x => x !== u); return 'was lost'
  }
}

function promote(s: GameState, u: Unit, ctx: TurnContext) {
  if (isCompany(u.kind) || isHull(u.kind) || !isArmed(u.kind)) return
  const i = QUALITY.indexOf(u.quality)
  if (i >= QUALITY.length - 1) return
  let p = C.military.promotionChance
  if (u.owner === 0 && s.charters[0].signatories.includes(7)) p *= 1.6
  if (chance(ctx.rngPlay, p)) { u.quality = QUALITY[i + 1]; if (u.owner === 0) ctx.log({ kind: 'war', text: `A ${unitLabel(u.kind)} is now ${u.quality}.`, tile: u.tile }) }
}

/** One fight. Returns true when the attacker won. */
export function fight(s: GameState, attacker: Unit, tile: number, ctx: TurnContext): boolean {
  const defender = bestDefender(s, tile, attacker.owner)
  const st = settlementAt(s, tile)
  if (!defender) return true
  let A = unitAttack(attacker, st ? 'settlement' : 'open')
  let D = defenceOf(s, defender, tile)
  // ambush: militia or outriders in cover against regulars in the open flip the terrain bonus
  const t = s.world.tiles[tile]
  const cover = !st && (t.forest || t.terrain === 'highland' || t.terrain === 'mountain')
  if (cover && (attacker.kind === 'militia' || attacker.kind === 'outrider') && isCompany(defender.kind)) {
    const bonus = (C.military.terrainDefence[t.terrain] ?? 1) * (t.forest ? C.military.forestDefence : 1)
    A *= bonus; D /= bonus
  }
  if (A <= 0) return false
  let wins = 0, losses = 0
  for (let i = 0; i < C.military.exchanges; i++) {
    const p = A / (A + D)
    if (next(ctx.rngPlay) < p) wins++; else losses++
  }
  const won = wins > losses
  const loser = won ? defender : attacker
  const victor = won ? attacker : defender
  const what = degrade(s, loser, victor, ctx)
  promote(s, victor, ctx)
  const mine = attacker.owner === 0 || defender.owner === 0
  if (mine) ctx.log({ kind: 'war', text: `${ownerName(s, attacker.owner)} ${unitLabel(attacker.kind)} attacked ${ownerName(s, defender.owner)} ${unitLabel(defender.kind)}${st ? ` at ${st.name}` : ''}: ${wins} exchanges to ${losses}. The ${unitLabel(loser.kind === 'colonist' && loser !== victor ? loser.kind : loser.kind)} ${what}.`, why: `Each exchange is won with chance ${Math.round(100 * A / (A + D))} per cent, attack ${Math.round(A * 10) / 10} against defence ${Math.round(D * 10) / 10}.`, tile })
  return won
}

function ownerName(s: GameState, owner: number): string { return owner === 0 ? 'your' : owner === -1 ? "the Company's" : `${s.charters[owner]?.name ?? 'a rival'}'s` }

/** Capture or fall of a settlement once its last defender is beaten. */
function takeSettlement(s: GameState, st: Settlement, by: number, ctx: TurnContext) {
  const from = st.owner
  if (by === -1) {
    // the Company does not hold ground; it breaks the place and moves on, unless it is the landing
    if (st.owner === 0 && st.tile === s.charters[0].landing && s.declaration) {
      if (s.declaration.lost) return
      s.declaration.lost = true
      ctx.log({ kind: 'war', text: `${st.name} fell to the Company. The charter holds.`, tile: st.tile })
      return
    }
    st.buildings.works = 0
    for (const k of Object.keys(st.stock) as (keyof typeof st.stock)[]) st.stock[k] = Math.floor(st.stock[k] * 0.5)
    ctx.log({ kind: 'war', text: `The Company sacked ${st.name}: the works are thrown down and half the store is gone.`, why: 'A settlement with no garrison left cannot keep the Company out.', tile: st.tile })
    return
  }
  st.owner = by
  if (by === 0) {
    st.abstractPop = 0
    if (st.colonists.length === 0) { st.colonists = [] }
  }
  for (const t of s.world.tiles) if (t.worked === st.id) t.owner = by
  ctx.log({ kind: 'war', text: `${st.name} was taken by ${by === 0 ? 'you' : s.charters[by].name}${from >= 0 ? ` from ${s.charters[from].name}` : ''}.`, tile: st.tile })
}

export function attackWith(s: GameState, u: Unit, tile: number, ctx: TurnContext) {
  if (!isArmed(u.kind)) throw new Error('that unit cannot attack')
  if (u.moves <= 0) throw new Error('no moves left')
  const w = s.world.width, h = s.world.height
  if (!neighbours8(w, h, u.tile).includes(tile)) throw new Error('must be beside the target')
  const target = s.units.find(x => x.tile === tile && x.owner !== 0)
  const st = settlementAt(s, tile)
  if (!target && !(st && st.owner !== 0)) throw new Error('nothing there to attack')
  const hostileOwner = target ? target.owner : st!.owner
  if (hostileOwner > 0 && s.charters[hostileOwner].relation !== 'war') {
    s.charters[hostileOwner].relation = 'war'
    ctx.log({ kind: 'rival', text: `You are at war with ${s.charters[hostileOwner].name}.`, why: 'An attack is a declaration.' })
  }
  u.moves = 0
  const won = fight(s, u, tile, ctx)
  if (won && st && st.owner !== 0 && !bestDefender(s, tile, 0)) {
    if (st.abstractPop > 0 && st.owner > 0) {
      // an undefended rival settlement still resists with its people
      const resist = C.military.units.militia.defence * C.military.fortMultipliers[st.buildings.works]
      const A = unitAttack(u, 'settlement')
      if (next(ctx.rngPlay) < A / (A + resist)) takeSettlement(s, st, 0, ctx)
      else ctx.log({ kind: 'war', text: `${st.name} held behind its people.`, tile })
    } else takeSettlement(s, st, 0, ctx)
  }
  s.charters[0].unlocked.military = true
}

/** Hostile unit movement and attacks, each turn. */
function moveHostiles(s: GameState, ctx: TurnContext) {
  const w = s.world.width, h = s.world.height
  const mine = s.settlements.filter(x => x.owner === 0)
  if (!mine.length) return
  const over = !!(s.declaration && (s.declaration.won || s.declaration.lost))
  for (const u of s.units) {
    if (u.owner === 0 || isHull(u.kind) || !isArmed(u.kind)) continue
    if (!isHostileTo(s, u.owner, 0)) continue
    if (u.owner === -1 && over) continue
    u.moves = maxMoves(u)
    // the Company marches on the landing when it can, otherwise the nearest settlement
    const landing = mine.find(x => x.tile === s.charters[0].landing)
    const target = (u.owner === -1 && landing && dist(w, u.tile, landing.tile) <= 12) ? landing : mine.reduce((a, b) => dist(w, u.tile, b.tile) < dist(w, u.tile, a.tile) ? b : a)
    // attack anything of the player's beside it first
    const near = neighbours8(w, h, u.tile).filter(n => s.units.some(x => x.tile === n && x.owner === 0 && !isHull(x.kind)) || (settlementAt(s, n)?.owner === 0))
    let attacked = false
    for (const n of near) {
      const st = settlementAt(s, n)
      if (st && st.owner === 0) {
        if (u.kind === 'siegeTrain' || u.kind === 'damagedSiegeTrain') {
          // a siege train beside works breaches them over time
          if (st.buildings.works > 0) {
            u.progress++
            if (u.progress >= C.military.breachThreshold) { st.buildings.works--; u.progress = 0; ctx.log({ kind: 'war', text: `The works at ${st.name} were breached. They stand a tier lower.`, why: `A siege train beside the works for ${C.military.breachThreshold} turns brings them down a tier.`, tile: st.tile }) }
            else ctx.log({ kind: 'war', text: `A siege train is battering the works at ${st.name}, ${C.military.breachThreshold - u.progress} turns from a breach.`, tile: st.tile })
            attacked = true
            break
          }
        }
        const won = fight(s, u, n, ctx)
        if (won && !bestDefender(s, n, u.owner)) takeSettlement(s, st, u.owner, ctx)
        attacked = true
        break
      }
      if (s.units.some(x => x.tile === n && x.owner === 0)) { fight(s, u, n, ctx); attacked = true; break }
    }
    if (attacked || !s.units.includes(u)) continue
    // march
    const path = findPath(s, u, u.tile, target.tile)
    if (path) {
      // stop short of entering an occupied player tile; the fight happens next turn from beside it
      u.path = path.filter(t => !(settlementAt(s, t)?.owner === 0) && !s.units.some(x => x.tile === t && x.owner === 0))
      advance(s, u)
    }
  }
}

export const militarySystem: System = {
  id: 'military',
  enabled: () => C.flags.military,
  resolve(s: GameState, ctx: TurnContext) {
    moveHostiles(s, ctx)
    const anyHostile = s.units.some(u => u.owner !== 0 && isArmed(u.kind) && isHostileTo(s, u.owner, 0))
    if (anyHostile || s.turn >= C.onboarding.unlockBackstop.military) s.charters[0].unlocked.military = true
    // quality of raw militia sworn in by signatory eight
    if (s.charters[0].signatories.includes(7)) for (const u of s.units) if (u.owner === 0 && u.kind === 'militia' && u.quality === 'raw') u.quality = 'hardened'
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    const w = s.world.width
    const mine = s.settlements.filter(x => x.owner === 0)
    const diff = difficultyOf(s.settings.difficulty)
    void diff
    for (const u of s.units) {
      if (u.owner === 0 || isHull(u.kind) || !isArmed(u.kind) || !isHostileTo(s, u.owner, 0)) continue
      const nearest = mine.reduce<Settlement | null>((a, b) => !a || dist(w, u.tile, b.tile) < dist(w, u.tile, a.tile) ? b : a, null)
      if (!nearest) continue
      const d = dist(w, u.tile, nearest.tile)
      if (d <= 4) {
        const garrison = s.units.filter(x => x.tile === nearest.tile && x.owner === 0 && isArmed(x.kind)).length
        out.push({ key: `threat:${nearest.id}`, group: 'threat', type: 1, title: `${nearest.name} is threatened`, body: `${ownerName(s, u.owner).replace(/'s$/, '')} ${unitLabel(u.kind)} is ${d} tiles off. ${garrison ? `${garrison} in the garrison.` : 'No garrison.'}`, explain: 'Equip a colonist with arms to make militia. Works multiply the garrison. Units in cover can ambush regulars.', settlement: nearest.id, tile: u.tile, magnitude: 3, since: s.turn, choices: [], opens: 'settlement' })
      }
    }
    return out
  },
}

/** Spawn a unit for a non-player owner at a tile, used by the fleet and the rivals. */
export function spawnHostile(s: GameState, owner: number, kind: Unit['kind'], tile: number, quality: Quality = 'raw'): Unit {
  const u = makeUnit(s, owner, kind, tile, null)
  u.quality = quality
  s.units.push(u)
  return u
}

export function landTileNear(s: GameState, tile: number, ctx: TurnContext): number {
  const w = s.world.width, h = s.world.height
  const t = s.world.tiles[tile]
  if (isLand(t) && t.terrain !== 'mountain') return tile
  const cands = neighbours8(w, h, tile).filter(n => isLand(s.world.tiles[n]) && s.world.tiles[n].terrain !== 'mountain')
  if (cands.length) return cands[Math.floor(next(ctx.rngPlay) * cands.length)]
  for (let r = 2; r < 6; r++) for (const n of neighbours8(w, h, tile)) for (const m of neighbours8(w, h, n)) if (isLand(s.world.tiles[m])) return m
  return tile
}
