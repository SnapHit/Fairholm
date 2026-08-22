// The declaration and the recall fleet. Military brief sections 10 to 12. The fleet is always
// visible and scales with cumulative grievance and the charter terms. Declaring opens a six-turn
// window to muster, then waves land at anchorages chosen by the play RNG with a narrowing three-turn
// approach. The fleet is finite: the game is won when it is spent, lost when the landing falls.
// Blockade while a wave is at sea stops passages and consignments; wartime grievance can buy a
// rival's intervention.

import type { GameState, TurnContext, QueueItem, FleetUnit, Wave, CompanyKind } from './state'
import type { System } from './turn'
import { C } from './constants'
import { nationalResolve } from './grievance'
import { chance, next, pick, shuffle } from './rng'
import { dist, landComponents } from './worldgen'
import { spawnHostile, landTileNear } from './military'
import { isArmed, isCompany, makeUnit } from './units'

function composeFleet(s: GameState, ctx: TurnContext): FleetUnit[] {
  const n = Math.max(3, Math.round(s.company.fleetStrength))
  const out: FleetUnit[] = []
  const comp = C.military.fleetComposition
  for (let i = 0; i < n; i++) {
    const r = next(ctx.rngPlay)
    const kind: CompanyKind = r < comp.regulars ? 'regulars' : r < comp.regulars + comp.horse ? 'horse' : 'siegeTrain'
    out.push({ kind, quality: chance(ctx.rngPlay, 0.3) ? 'hardened' : 'raw' })
  }
  return out
}

export function declareIndependence(s: GameState, ctx: TurnContext) {
  if (s.declaration?.declared) throw new Error('already declared')
  if (nationalResolve(s) < C.grievance.declarationGate) throw new Error(`resolve must reach ${Math.round(C.grievance.declarationGate * 100)} per cent`)
  s.declaration = { declared: true, turnDeclared: s.turn, waves: [], interventionProgress: 0, nextWaveId: 1, won: false, lost: false, intervened: null }
  s.company.fleetPool = composeFleet(s, ctx)
  s.company.demand = null
  s.charters[0].declared = true
  s.charters[0].unlocked.fleet = true
  s.intent = 'Hold the landing. The fleet is finite.'
  ctx.log({ kind: 'war', text: `The charter is torn up. ${s.company.fleetPool.length} Company units will come in waves. You have ${C.military.declarationWindow} turns to muster.`, why: 'The fleet was sized by everything the Company has been told you did. It cannot grow now.' })
}

/** Anchorages on the player's landmass, nearest the player's settlements first. */
function candidateAnchorages(s: GameState): number[] {
  const w = s.world.width
  const comp = landComponents(w, s.world.height, s.world.tiles).comp
  const mine = s.settlements.filter(x => x.owner === 0)
  const home = comp[s.charters[0].landing]
  const all = s.world.anchorages.filter(a => {
    // an anchorage is water; it serves a landmass if a neighbouring land tile is in the component
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = (a % w) + dx, z = Math.floor(a / w) + dz
      if (x < 0 || z < 0 || x >= w || z >= s.world.height) continue
      if (comp[z * w + x] === home) return true
    }
    return false
  })
  const near = all.filter(a => mine.some(m => dist(w, a, m.tile) <= 10))
  return near.length ? near : all
}

function launchWave(s: GameState, ctx: TurnContext) {
  const d = s.declaration!
  const pool = s.company.fleetPool!
  if (!pool.length) return
  const units = pool.splice(0, Math.min(C.military.waveSize, pool.length))
  const cands = candidateAnchorages(s)
  if (!cands.length) { s.company.fleetPool!.unshift(...units); return }
  const anchorage = pick(ctx.rngPlay, cands)
  const wave: Wave = { id: d.nextWaveId++, units, anchorage, turnsToLand: C.military.approachTurns, landed: false, excluded: [] }
  d.waves.push(wave)
  // the blockade ship that escorts the wave sits off the landing
  const ship = makeUnit(s, -1, 'companyShip', s.world.anchorages.reduce((a, b) => dist(s.world.width, b, s.charters[0].landing) < dist(s.world.width, a, s.charters[0].landing) ? b : a), null)
  s.units.push(ship)
  ctx.log({ kind: 'war', text: `A wave of ${units.length} is at sea. It will land in ${C.military.approachTurns} turns at one of ${cands.length} anchorages.`, why: 'Where a wave lands is not decided until it lands. Each turn rules some coast out.' })
}

function narrow(s: GameState, wave: Wave, ctx: TurnContext) {
  const cands = candidateAnchorages(s).filter(a => !wave.excluded.includes(a) && a !== wave.anchorage)
  // rule out a share of the remaining coast each turn, so the last turn leaves one or two
  const remove = Math.ceil(cands.length / Math.max(1, wave.turnsToLand + 1))
  const gone = shuffle(ctx.rngPlay, [...cands]).slice(0, remove)
  wave.excluded.push(...gone)
}

export function blockaded(s: GameState): boolean {
  return !!(s.declaration?.declared && !s.declaration.won && (s.declaration.waves.some(w => !w.landed) || s.units.some(u => u.owner === -1 && u.kind === 'companyShip')))
}

export const fleetSystem: System = {
  id: 'fleet',
  enabled: () => C.flags.fleet,
  resolve(s: GameState, ctx: TurnContext) {
    const d = s.declaration
    if (!d || !d.declared || d.won || d.lost) return
    const since = s.turn - (d.turnDeclared ?? s.turn)
    const pool = s.company.fleetPool ?? []
    // waves at sea narrow and land
    for (const wave of d.waves) {
      if (wave.landed) continue
      wave.turnsToLand--
      if (wave.turnsToLand > 0) { narrow(s, wave, ctx); continue }
      wave.landed = true
      const tile = landTileNear(s, wave.anchorage, ctx)
      for (const fu of wave.units) spawnHostile(s, -1, fu.kind, tile, fu.quality)
      ctx.log({ kind: 'war', text: `The Company landed ${wave.units.length} units at the coast.`, tile })
    }
    // launches: after the window, then about every interval while the pool lasts
    let atSea = d.waves.some(w => !w.landed)
    if (pool.length && since >= C.military.declarationWindow && !atSea) {
      const lastLaunch = d.waves.length ? (d.turnDeclared ?? 0) + C.military.declarationWindow + (d.waves.length - 1) * C.military.waveInterval : -1
      const due = !d.waves.length || s.turn - lastLaunch >= C.military.waveInterval
      if (due && (!d.waves.length || chance(ctx.rngPlay, 0.6))) launchWave(s, ctx)
      atSea = d.waves.some(w => !w.landed)
    }
    // intervention: wartime grievance buys a rival's ships, which thins the pool
    if (d.intervened === null) {
      d.interventionProgress += s.settlements.filter(x => x.owner === 0).reduce((a, st) => a + (st.buildings.meeting > 0 ? 3 : 0), 0)
      if (d.interventionProgress >= C.military.interventionGrievance) {
        const candidates = s.charters.filter(c => !c.player && !c.fell && c.relation !== 'war')
        if (candidates.length) {
          const r = pick(ctx.rngPlay, candidates)
          d.intervened = r.id
          const cut = Math.floor(pool.length * 0.4)
          pool.splice(pool.length - cut, cut)
          for (const u of s.units) if (u.owner === -1 && u.kind === 'companyShip') u.damage += 2
          ctx.log({ kind: 'war', text: `${r.name} have put their ships between you and the Company. ${cut} units will never sail.`, why: 'Wartime grievance reached the point where a rival saw a cause worth joining.' })
        }
      }
    }
    // the blockade ship leaves when no wave is at sea and the pool is empty
    if (!pool.length && !atSea) s.units = s.units.filter(u => !(u.owner === -1 && u.kind === 'companyShip'))
    // win: pool empty, every wave landed, nothing of the Company's left standing
    const standing = s.units.some(u => u.owner === -1 && isArmed(u.kind) && isCompany(u.kind))
    if (!pool.length && !atSea && !standing && d.waves.length) {
      d.won = true
      s.charters[0].independent = true
      s.intent = 'The charter is torn up. Fairholm answers to no one.'
      ctx.log({ kind: 'war', text: 'The last of the recall fleet is spent. The Company has no more to send.', why: 'The fleet was finite from the day it was sized.' })
    }
  },
  queueItems(s: GameState): QueueItem[] {
    const out: QueueItem[] = []
    const d = s.declaration
    if (!d || !d.declared || d.won || d.lost) return out
    const since = s.turn - (d.turnDeclared ?? s.turn)
    if (since < C.military.declarationWindow) {
      out.push({ key: 'muster', group: 'muster', type: 2, title: `${C.military.declarationWindow - since} turns to muster`, body: `${(s.company.fleetPool ?? []).length} Company units will come in waves of about ${C.military.waveSize}. Arm colonists, raise works, garrison the landing.`, explain: 'Works multiply the garrison. Batteries are strongest inside them. Militia in forest or hills can ambush regulars in the open.', magnitude: 3, since: s.turn, choices: [], opens: 'declaration' })
    }
    for (const wave of d.waves) {
      if (wave.landed) continue
      const cands = candidateAnchorages(s).filter(a => !wave.excluded.includes(a))
      out.push({ key: `wave:${wave.id}`, group: 'wave', type: 2, title: `A wave lands in ${wave.turnsToLand}`, body: `${wave.units.length} units at sea. ${cands.length} stretches of coast remain possible. Passages and consignments are stopped while it is at sea.`, magnitude: 3, since: s.turn, choices: [], opens: 'declaration', tile: cands[0] })
    }
    return out
  },
}
