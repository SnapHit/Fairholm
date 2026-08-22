// Naval. Military brief section 9 and rival charters brief section 5. Four hulls: lighter, trader,
// raider, cutter. Speed decides who can bring whom to action; ships degrade rather than sink; a
// beaten ship's cargo is captured in part. Rivals send unflagged raiders that nobody can pin on
// them until they are caught, which raises suspicion instead of relations.

import type { GameState, TurnContext, Settlement, HullKind, Unit, QueueItem, GoodId } from './state'
import type { System } from './turn'
import { C } from './constants'
import { makeUnit, isHull, maxMoves, findPath, advance } from './units'
import { chance, next, pick } from './rng'
import { neighbours8, dist } from './worldgen'
import { isHostileTo } from './military'
import { unitLabel } from './queue'

export function buildHull(s: GameState, st: Settlement, kind: HullKind, ctx: TurnContext) {
  const d = C.naval.hulls[kind]
  if (st.buildings.wharf < d.wharfTier) throw new Error(`needs a wharf of tier ${d.wharfTier}`)
  for (const [g, n] of Object.entries(d.cost) as [GoodId, number][]) if (n > 0 && st.stock[g] < n) throw new Error(`short of ${g}`)
  for (const [g, n] of Object.entries(d.cost) as [GoodId, number][]) if (n > 0) st.stock[g] -= n
  // the hull sits on the water beside the wharf
  const w = s.world.width, h = s.world.height
  const water = neighbours8(w, h, st.tile).find(n => s.world.tiles[n].terrain === 'water')
  const u = makeUnit(s, 0, kind, water ?? st.tile, null)
  s.units.push(u)
  s.charters[0].unlocked.naval = true
  ctx.log({ kind: 'build', text: `${st.name} launched a ${kind}. Speed ${d.speed}, ${d.guns} guns, holds ${d.capacity}.`, settlement: st.id })
}

export function hullGuns(u: Unit): number { return isHull(u.kind) ? Math.max(0, C.naval.hulls[u.kind as HullKind].guns - u.damage) : 0 }
export function hullSpeed(u: Unit): number { return isHull(u.kind) ? Math.max(1, C.naval.hulls[u.kind as HullKind].speed - u.damage) : 0 }

/** A naval engagement between two hulls. The faster chooses whether to fight; the slower cannot refuse. */
function engage(s: GameState, a: Unit, b: Unit, ctx: TurnContext) {
  const ga = hullGuns(a), gb = hullGuns(b)
  if (ga === 0 && gb === 0) return
  let wins = 0
  for (let i = 0; i < C.military.exchanges; i++) if (next(ctx.rngPlay) < (ga + 0.5) / (ga + gb + 1)) wins++
  const aWon = wins > C.military.exchanges / 2
  const loser = aWon ? b : a, victor = aWon ? a : b
  loser.damage += C.naval.damagePerLostRound
  // cargo changes hands in part
  let taken = ''
  for (const [g, n] of Object.entries(loser.cargo) as [GoodId, number][]) {
    const t = Math.floor(n * C.naval.raidCargoFraction)
    if (t <= 0) continue
    loser.cargo[g] = n - t
    victor.cargo[g] = (victor.cargo[g] ?? 0) + t
    taken += `${t} ${g}, `
  }
  // a raider caught in the act is flagged, and suspicion falls on its charter
  if (!loser.flagged && loser.owner > 0) { loser.flagged = true; s.charters[loser.owner].suspicion += C.rivals.suspicionPerRaid }
  if (!victor.flagged && victor.owner > 0 && !aWon) { /* the raider got away unseen */ }
  const sunk = loser.damage >= C.naval.hulls[loser.kind as HullKind].speed + 1
  if (sunk) s.units = s.units.filter(x => x !== loser)
  if (a.owner === 0 || b.owner === 0) {
    ctx.log({ kind: 'war', text: `${a.owner === 0 ? 'Your' : ownerOf(s, a)} ${a.kind} met ${b.owner === 0 ? 'your' : ownerOf(s, b)} ${b.kind}: ${wins} exchanges of ${C.military.exchanges}. The ${loser.kind} ${sunk ? 'was lost' : 'was damaged'}${taken ? ` and gave up ${taken.replace(/, $/, '')}` : ''}.`, why: 'Guns decide the exchanges. Damage takes speed and capacity, and a ship with no speed left founders.', tile: a.tile })
  }
}

function ownerOf(s: GameState, u: Unit): string { return u.owner === -1 ? "the Company's" : u.flagged ? `${s.charters[u.owner]?.name}'s` : 'an unflagged' }

function sendRaider(s: GameState, ctx: TurnContext) {
  const rivals = s.charters.filter(c => !c.player && !c.fell && (c.relation === 'tense' || c.relation === 'war'))
  if (!rivals.length) return
  const r = pick(ctx.rngPlay, rivals)
  const anchorages = s.world.anchorages.filter(a => dist(s.world.width, a, s.charters[0].landing) > 6)
  if (!anchorages.length) return
  const from = pick(ctx.rngPlay, anchorages)
  const u = makeUnit(s, r.id, 'raider', from, null)
  u.flagged = r.relation === 'war'
  s.units.push(u)
}

export function raidTarget(s: GameState, u: Unit): number | null {
  // the nearest player hull with cargo, else the player's landing
  let best: number | null = null, bd = 1e9
  for (const x of s.units) {
    if (x.owner !== 0 || !isHull(x.kind)) continue
    const d = dist(s.world.width, u.tile, x.tile)
    if (d < bd) { bd = d; best = x.tile }
  }
  return best ?? s.charters[0].landing
}

export const navalSystem: System = {
  id: 'naval',
  enabled: () => C.flags.naval,
  resolve(s: GameState, ctx: TurnContext) {
    const w = s.world.width, h = s.world.height
    // repairs at a wharf
    for (const u of s.units) {
      if (u.owner !== 0 || !isHull(u.kind) || u.damage <= 0) continue
      const port = neighbours8(w, h, u.tile).some(n => { const st = s.settlements.find(x => x.tile === n); return st && st.owner === 0 && st.buildings.wharf > 0 })
      if (port) u.damage = Math.max(0, u.damage - C.naval.repairPerTurn)
    }
    // rival raiders appear, move, and engage
    if (chance(ctx.rngPlay, C.naval.rivalRaidChancePerTurn)) sendRaider(s, ctx)
    for (const u of [...s.units]) {
      if (u.owner <= 0 || !isHull(u.kind) || !s.units.includes(u)) continue
      u.moves = maxMoves(u)
      const target = raidTarget(s, u)
      if (target === null) continue
      // engage a player hull beside it
      const prey = s.units.find(x => x.owner === 0 && isHull(x.kind) && neighbours8(w, h, u.tile).includes(x.tile))
      if (prey) {
        if (hullSpeed(u) >= hullSpeed(prey) || chance(ctx.rngPlay, 0.5)) engage(s, u, prey, ctx)
        continue
      }
      // after a raid or enough damage, go home
      if (u.damage >= 2 || Object.keys(u.cargo).length) { s.units = s.units.filter(x => x !== u); continue }
      const path = findPath(s, u, u.tile, target)
      if (path) { u.path = path.slice(0, 6); advance(s, u) }
    }
    // the player's hulls can be brought to action by the Company's blockade ships
    for (const u of s.units) {
      if (u.owner !== -1 || u.kind !== 'companyShip') continue
      const prey = s.units.find(x => x.owner === 0 && isHull(x.kind) && neighbours8(w, h, u.tile).includes(x.tile))
      if (prey) engage(s, u, prey, ctx)
    }
    if (s.turn >= C.onboarding.unlockBackstop.military) s.charters[0].unlocked.naval = true
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    const w = s.world.width
    for (const u of s.units) {
      if (u.owner === 0 || !isHull(u.kind)) continue
      if (!(u.owner === -1 || u.kind === 'raider')) continue
      const d = dist(w, u.tile, s.charters[0].landing)
      if (d <= 5 && isHostileTo(s, u.owner, 0) || (u.kind === 'raider' && d <= 5)) {
        out.push({ key: `sail:${u.id}`, group: 'sail', type: 2, title: `${u.flagged ? (u.owner === -1 ? "A Company ship" : `A ${s.charters[u.owner]?.name} raider`) : 'An unflagged raider'} is off the coast`, body: `${d} tiles from the landing. Ships with cargo are its prey; a cutter or an armed trader can bring it to action.`, explain: 'Speed decides who can catch whom. A faster ship chooses whether to fight.', tile: u.tile, magnitude: 2, since: s.turn, choices: [], opens: 'unit' })
      }
    }
    return out
  },
}

export { unitLabel }
