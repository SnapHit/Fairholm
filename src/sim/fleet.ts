// The declaration and the recall fleet. Military brief sections 9 to 12. The fleet is always
// visible and scales with cumulative grievance and the charter terms. Declaring opens a six-turn
// window to muster, then waves come ashore on the coast near the player's settlements: each picks,
// from the play RNG, a coastal land tile within two tiles of one of them, its landers splash down
// offshore and motor in over three turns, visibly, with the coast it might still take narrowing
// each turn. Units standing on the landing tile are captured. The fleet is finite: the game is won
// when it is spent, lost when the Landing falls. A settlement is blockaded while a hostile armed
// ship lies on a water tile beside it; wartime grievance can buy a rival's intervention.

import type { GameState, TurnContext, QueueItem, FleetUnit, Wave, CompanyKind, Settlement } from './state'
import type { System } from './turn'
import { C } from './constants'
import { nationalResolve } from './grievance'
import { chance, next, pick, shuffle } from './rng'
import { dist, neighbours8, isLand, isCoastal, sailingDistance } from './worldgen'
import { spawnHostile, isBlockaded } from './military'
import { isArmed, isCompany, makeUnit, isHull } from './units'
import { unitLabel } from './queue'

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
  s.intent = 'Hold the Landing. The fleet is finite.'
  ctx.log({ kind: 'war', text: `The charter is torn up. ${s.company.fleetPool.length} Company units will come in waves. You have ${C.military.declarationWindow} turns to muster.`, why: 'The fleet was sized by everything the Company has been told you did. It cannot grow now.' })
}

/** The coast a wave may come ashore on: every coastal land tile that is not mountain within the
 *  landing radius of one of the player's settlements. Military brief section 9. */
export function landingCoast(s: GameState): number[] {
  const w = s.world.width, h = s.world.height
  const tiles = s.world.tiles
  const out = new Set<number>()
  const r = C.military.landingRadius
  for (const st of s.settlements) {
    if (st.owner !== 0) continue
    const x = st.tile % w, z = Math.floor(st.tile / w)
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, zz = z + dz
      if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue
      const i = zz * w + xx
      if (isLand(tiles[i]) && tiles[i].terrain !== 'mountain' && isCoastal(w, h, tiles, i) && !s.settlements.some(x => x.tile === i)) out.add(i)
    }
  }
  return [...out].sort((a, b) => a - b)
}

/** A water tile beside a coast tile. The one with the most water around it, so a lander does not
 *  come down in a creek. */
function waterBeside(s: GameState, tile: number): number {
  const w = s.world.width, h = s.world.height
  let best = -1, bw = -1
  for (const n of neighbours8(w, h, tile)) {
    if (s.world.tiles[n].terrain !== 'water') continue
    const open = neighbours8(w, h, n).filter(m => s.world.tiles[m].terrain === 'water').length
    if (open > bw) { bw = open; best = n }
  }
  return best
}

/** Where a wave's landers splash down: water as far out from the coast it is making for as the
 *  approach takes to sail, or as far as the sea allows. */
function splashdownFor(s: GameState, target: number): number {
  const w = s.world.width, h = s.world.height
  const tiles = s.world.tiles
  const shore = waterBeside(s, target)
  if (shore < 0) return target
  const want = C.military.approachTurns * C.military.approachMoves
  // distance over water from the shore tile outward
  const d = new Int32Array(w * h).fill(-1)
  const queue = [shore]
  d[shore] = 0
  let best = shore, bd = 0
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]
    if (d[c] > bd && d[c] <= want) { best = c; bd = d[c] }
    if (d[c] >= want) continue
    for (const n of neighbours8(w, h, c)) if (tiles[n].terrain === 'water' && d[n] < 0) { d[n] = d[c] + 1; queue.push(n) }
  }
  return best
}

/** The landers' position, a share of the way from where they came down to the shore. */
function approachPosition(s: GameState, wave: Wave, origin: number): number {
  const shore = waterBeside(s, wave.target)
  if (shore < 0) return origin
  const w = s.world.width, h = s.world.height
  const tiles = s.world.tiles
  // a path over water from the origin to the shore tile
  const prev = new Int32Array(w * h).fill(-2)
  const queue = [origin]
  prev[origin] = -1
  while (queue.length && prev[shore] === -2) {
    const c = queue.shift()!
    for (const n of neighbours8(w, h, c)) if (tiles[n].terrain === 'water' && prev[n] === -2) { prev[n] = c; queue.push(n) }
  }
  if (prev[shore] === -2) return origin
  const path: number[] = []
  for (let c = shore; c !== -1; c = prev[c]) path.push(c)
  path.reverse()
  const done = C.military.approachTurns - wave.turnsToLand
  const k = Math.min(path.length - 1, Math.round((path.length - 1) * done / C.military.approachTurns))
  return path[k]
}

function launchWave(s: GameState, ctx: TurnContext) {
  const d = s.declaration!
  const pool = s.company.fleetPool!
  if (!pool.length) return
  const coast = landingCoast(s)
  if (!coast.length) return
  const units = pool.splice(0, Math.min(C.military.waveSize, pool.length))
  const target = pick(ctx.rngPlay, coast)
  const origin = splashdownFor(s, target)
  const wave: Wave = { id: d.nextWaveId++, units, target, at: origin, turnsToLand: C.military.approachTurns, landed: false, excluded: [] }
  d.waves.push(wave)
  // the blockade ship that escorts the wave lies off the settlement the wave is making for
  const near = s.settlements.filter(x => x.owner === 0).sort((a, b) => dist(s.world.width, a.tile, target) - dist(s.world.width, b.tile, target))[0]
  const berth = near ? waterBeside(s, near.tile) : -1
  if (berth >= 0) s.units.push(makeUnit(s, -1, 'companyShip', berth, null))
  ctx.log({ kind: 'war', text: `A wave of ${units.length} came down offshore. It will come ashore in ${C.military.approachTurns} turns, somewhere on ${coast.length} tiles of coast near your settlements.`, why: 'Where a wave lands is not decided until it lands. Each turn rules some coast out.', tile: origin })
}

function narrow(s: GameState, wave: Wave, ctx: TurnContext) {
  const cands = landingCoast(s).filter(a => !wave.excluded.includes(a) && a !== wave.target)
  // rule out a share of the remaining coast each turn, so the last turn leaves one or two
  const remove = Math.ceil(cands.length / Math.max(1, wave.turnsToLand + 1))
  const gone = shuffle(ctx.rngPlay, [...cands]).slice(0, remove)
  wave.excluded.push(...gone)
}

/** The coast a wave might still come ashore on, as far as the player can tell. */
export function waveCoast(s: GameState, wave: Wave): number[] {
  return landingCoast(s).filter(a => !wave.excluded.includes(a))
}

/** Whether any of the player's settlements is blockaded. */
export function blockaded(s: GameState): boolean {
  return s.settlements.some(st => st.owner === 0 && isBlockaded(s, st))
}

function land(s: GameState, wave: Wave, ctx: TurnContext) {
  wave.landed = true
  const tile = wave.target
  // units standing on the landing tile are captured, military brief section 11
  const taken = s.units.filter(u => u.tile === tile && u.owner === 0 && !isHull(u.kind))
  if (taken.length) {
    s.units = s.units.filter(u => !taken.includes(u))
    ctx.log({ kind: 'loss', text: `${taken.map(u => unitLabel(u.kind)).join(', ')} on the landing tile ${taken.length === 1 ? 'was' : 'were'} captured as the Company came ashore.`, why: 'Units on a landing tile when a wave arrives are captured.', tile })
  }
  for (const fu of wave.units) spawnHostile(s, -1, fu.kind, tile, fu.quality)
  wave.at = tile
  ctx.log({ kind: 'war', text: `The Company landed ${wave.units.length} units on the coast.`, tile })
}

export const fleetSystem: System = {
  id: 'fleet',
  enabled: () => C.flags.fleet,
  resolve(s: GameState, ctx: TurnContext) {
    const d = s.declaration
    if (!d || !d.declared || d.won || d.lost) return
    const since = s.turn - (d.turnDeclared ?? s.turn)
    const pool = s.company.fleetPool ?? []
    // waves at sea motor in, narrow and land
    for (const wave of d.waves) {
      if (wave.landed) continue
      wave.turnsToLand--
      if (wave.turnsToLand > 0) {
        // the target itself can have been settled over since the wave was launched; it still lands
        wave.at = approachPosition(s, wave, splashdownFor(s, wave.target))
        narrow(s, wave, ctx)
        continue
      }
      land(s, wave, ctx)
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
    // the blockade ships leave when no wave is at sea and the pool is empty
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
      out.push({ key: 'muster', group: 'muster', type: 2, title: `${C.military.declarationWindow - since} turns to muster`, body: `${(s.company.fleetPool ?? []).length} Company units will come in waves of about ${C.military.waveSize}. Arm colonists, raise works, garrison the Landing.`, explain: 'Works multiply the garrison. Batteries are strongest inside them. Militia in forest or hills can ambush regulars in the open.', magnitude: 3, since: s.turn, choices: [], opens: 'declaration' })
    }
    for (const wave of d.waves) {
      if (wave.landed) continue
      const coast = waveCoast(s, wave)
      out.push({ key: `wave:${wave.id}`, group: 'wave', type: 2, title: `A wave lands in ${wave.turnsToLand}`, body: `${wave.units.length} units at sea. ${coast.length} tiles of coast remain possible. The settlement it lies off is blockaded while its ship stays.`, magnitude: 3, since: s.turn, choices: [], opens: 'declaration', tile: wave.at })
    }
    for (const st of s.settlements) {
      if (st.owner !== 0 || !isBlockaded(s, st)) continue
      out.push({ key: `blockade:${st.id}`, group: 'blockade', type: 2, title: `${st.name} is blockaded`, body: 'A hostile armed ship lies off it. Passages and consignments there stop until it is driven off or leaves.', explain: 'A blockade is a ship beside the settlement. Batteries fire on adjacent hostile ships.', settlement: st.id, tile: st.tile, magnitude: 2, since: s.turn, choices: [], opens: 'settlement' })
    }
    return out
  },
}

export { sailingDistance, isBlockaded }
