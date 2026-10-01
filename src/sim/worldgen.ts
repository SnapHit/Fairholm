// World generation. Deterministic from the seed, versioned by WORLDGEN_VERSION, validated and
// retried per session brief section 8. Uses rng.world only. Rivers, primes, gold reserves, the
// charters' splashdowns and predecessor placement all come from here.
//
// There are no anchorages and no offered landing sites. Each charter's lander comes down in open
// sea a few turns' sailing from a coast that can feed it, and where it goes ashore is its own
// business. The generator's job is to put the splashdowns somewhere fair: see `splashdowns` below.

import { C, WORLDGEN_VERSION } from './constants'
import { seedRng, next, int, chance, pick, shuffle, fork, makeNoise, fbm } from './rng'
import type { GameState, Settings, Tile, TerrainId, ForestId, PrimeId, RiverSegment, PredecessorSettlement, RngState, GoodId } from './state'
import { emptyStock } from './state'

export interface World {
  width: number
  height: number
  tiles: Tile[]
  rivers: RiverSegment[]
  /** Where each charter's lander comes down, by charter index, the player first. Open sea. */
  splashdowns: number[]
  /** The coast each lander is nearest to: a viable coastal land tile, by charter index. The
   *  player is free to go anywhere; this is what the generator measured fairness against, and
   *  what a rival's lander makes for. */
  coasts: number[]
  predecessors: PredecessorSettlement[]
  attempts: number
}

const DIRS8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const DIRS4: [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]]

export function neighbours8(w: number, h: number, i: number): number[] {
  const x = i % w, y = Math.floor(i / w)
  const out: number[] = []
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx)
  }
  return out
}
export function neighbours4(w: number, h: number, i: number): number[] {
  const x = i % w, y = Math.floor(i / w)
  const out: number[] = []
  for (const [dx, dy] of DIRS4) {
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx)
  }
  return out
}
export function dist(w: number, a: number, b: number): number {
  const ax = a % w, ay = Math.floor(a / w), bx = b % w, by = Math.floor(b / w)
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}
export function isLand(t: Tile): boolean { return t.terrain !== 'water' }

export function blankTile(terrain: TerrainId): Tile {
  return { terrain, forest: null, river: 0, road: false, improved: false, prime: null, goldReserve: 0, owner: null, worked: null, workings: false, explored: false }
}

/** Flood-fill land components. Returns component id per tile, -1 for water. */
export function landComponents(w: number, h: number, tiles: Tile[]): { comp: Int32Array; sizes: number[] } {
  const comp = new Int32Array(tiles.length).fill(-1)
  const sizes: number[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (!isLand(tiles[i]) || comp[i] >= 0) continue
    const id = sizes.length
    let size = 0
    const stack = [i]
    comp[i] = id
    while (stack.length) {
      const c = stack.pop()!
      size++
      for (const n of neighbours8(w, h, c)) {
        if (isLand(tiles[n]) && comp[n] < 0) { comp[n] = id; stack.push(n) }
      }
    }
    sizes.push(size)
  }
  return { comp, sizes }
}

/** Is this land tile coastal, meaning adjacent (4-way) to water? */
export function isCoastal(w: number, h: number, tiles: Tile[], i: number): boolean {
  if (!isLand(tiles[i])) return false
  for (const n of neighbours4(w, h, i)) if (tiles[n].terrain === 'water') return true
  return false
}

function generateOnce(seed: string, settings: Settings, attempt: number): World {
  const size = C.session.sizes[settings.size]
  const w = size.w, h = size.h, N = w * h
  const rng = fork(seedRng(seed + ':v' + WORLDGEN_VERSION), 'attempt' + attempt)
  const heightNoise = makeNoise(seed + ':h' + attempt)
  const moistNoise = makeNoise(seed + ':m' + attempt)
  const tempNoise = makeNoise(seed + ':t' + attempt)
  const forestNoise = makeNoise(seed + ':f' + attempt)
  const detailNoise = makeNoise(seed + ':d' + attempt)

  // ---- heightfield ------------------------------------------------------------------------
  const height = new Float64Array(N)
  const scale = C.worldgen.noiseScale * (settings.shape === 'archipelago' ? 1.9 : settings.shape === 'coast' ? 1.3 : 1)
  const cx = w / 2, cy = h / 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    let v = fbm(heightNoise, x * scale, y * scale, C.worldgen.noiseOctaves)
    v = v * 0.85 + detailNoise(x * 0.5, y * 0.5) * 0.15
    // edge falloff so the landmass has no dominant axis and the coast is reachable
    const ex = Math.min(x, w - 1 - x) / w, ey = Math.min(y, h - 1 - y) / h
    const edge = Math.min(ex, ey) / C.worldgen.edgeFalloff
    const fall = Math.min(1, edge)
    let shaped: number
    if (settings.shape === 'continent') {
      const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2)
      const r = Math.sqrt(dx * dx + dy * dy)
      shaped = v * fall * (1.15 - 0.55 * r * r)
    } else if (settings.shape === 'coast') {
      const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2)
      const r = Math.sqrt(dx * dx + dy * dy)
      shaped = v * fall * (1.05 - 0.3 * r)
    } else {
      shaped = v * Math.min(1, edge * 1.4)
    }
    height[i] = shaped
  }
  // land fraction by rank, so the setting is honoured exactly
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => height[b] - height[a])
  const landFrac = settings.landArea || C.session.landFraction[settings.shape]
  const landCount = Math.floor(N * landFrac)
  const tiles: Tile[] = new Array(N)
  for (let i = 0; i < N; i++) tiles[i] = blankTile('water')
  const landHeight = new Float64Array(N)
  const seaLevel = height[order[Math.min(N - 1, landCount)]]
  const maxH = height[order[0]]
  for (let k = 0; k < landCount; k++) {
    const i = order[k]
    tiles[i].terrain = 'grassland'
    landHeight[i] = (height[i] - seaLevel) / Math.max(1e-6, maxH - seaLevel)
  }

  // remove single-tile islands and lakes that are a single tile, for a readable coast
  for (let i = 0; i < N; i++) {
    if (isLand(tiles[i])) {
      let landN = 0
      for (const n of neighbours8(w, h, i)) if (isLand(tiles[n])) landN++
      if (landN === 0) tiles[i].terrain = 'water'
    }
  }

  // ---- terrain types ----------------------------------------------------------------------
  const rough = 0.35 + settings.roughness * 0.9
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const t = tiles[i]
    if (!isLand(t)) continue
    const hh = Math.pow(landHeight[i], 1 / rough)
    const m = fbm(moistNoise, x * 0.09, y * 0.09, 3) * 0.7 + settings.moisture * 0.3
    const temp = fbm(tempNoise, x * 0.07, y * 0.07, 3) * 0.6 + settings.temperature * 0.4
    let coastal = false
    for (const n of neighbours4(w, h, i)) if (tiles[n].terrain === 'water') coastal = true
    let terrain: TerrainId
    if (hh > C.worldgen.mountainThreshold) terrain = 'mountain'
    else if (hh > C.worldgen.highlandThreshold) terrain = 'highland'
    else if (m > 0.66 && hh < 0.22) terrain = 'marsh'
    else if (m < 0.3 && temp > 0.55) terrain = 'dry'
    else if (m > 0.52) terrain = 'grassland'
    else if (m > 0.4) terrain = 'plains'
    else terrain = 'downs'
    if (coastal && terrain === 'marsh' && m < 0.75) terrain = 'grassland'
    t.terrain = terrain
  }

  // ---- forest -----------------------------------------------------------------------------
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const t = tiles[i]
    if (!isLand(t) || t.terrain === 'mountain' || t.terrain === 'dry' || t.terrain === 'marsh') continue
    const f = fbm(forestNoise, x * 0.13, y * 0.13, 3) * 0.8 + settings.moisture * 0.2
    if (f < 1 - C.worldgen.forestChance) continue
    let coastal = false
    for (const n of neighbours8(w, h, i)) if (tiles[n].terrain === 'water') coastal = true
    let forest: ForestId
    if (t.terrain === 'highland') forest = 'highlandForest'
    else if (t.terrain === 'grassland') forest = 'deepTimber'
    else if (t.terrain === 'plains') forest = 'lightWoodland'
    else forest = coastal ? 'coastalScrub' : (f > 0.72 ? 'deepTimber' : 'coastalScrub')
    t.forest = forest
  }

  // ---- rivers -----------------------------------------------------------------------------
  const rivers: RiverSegment[] = []
  const riverCount = Math.max(2, Math.round(N / 1000 * C.worldgen.riversPerThousandTiles * (0.7 + settings.moisture * 0.6)))
  const sources = order.filter(i => isLand(tiles[i]) && (tiles[i].terrain === 'highland' || tiles[i].terrain === 'mountain'))
  shuffle(rng, sources)
  let made = 0
  const riverRng = fork(rng, 'rivers')
  for (const src of sources) {
    if (made >= riverCount) break
    const path: number[] = [src]
    let cur = src
    const seen = new Set<number>([src])
    let ok = false
    for (let step = 0; step < w + h; step++) {
      let best = -1, bestH = landHeight[cur]
      const ns = shuffle(riverRng, neighbours4(w, h, cur))
      for (const n of ns) {
        if (seen.has(n)) continue
        if (tiles[n].terrain === 'water') { best = n; bestH = -1; break }
        if (tiles[n].river > 0) { best = n; bestH = -1; break }
        const hn = landHeight[n] - (tiles[n].terrain === 'marsh' ? 0.08 : 0)
        if (hn < bestH) { bestH = hn; best = n }
      }
      if (best < 0) break
      if (tiles[best].terrain === 'water' || tiles[best].river > 0) { ok = true; break }
      path.push(best); seen.add(best); cur = best
    }
    if (!ok || path.length < 3) continue
    const major = path.length >= 6 && chance(riverRng, C.worldgen.majorRiverFraction)
    for (const i of path) {
      const level = major ? 2 : 1
      if (tiles[i].river < level) tiles[i].river = level as 1 | 2
    }
    rivers.push({ tiles: path, major })
    made++
  }

  // ---- primes, gold, workings -------------------------------------------------------------
  const primeRng = fork(rng, 'primes')
  const abundance = 0.5 + settings.abundance
  for (let i = 0; i < N; i++) {
    const t = tiles[i]
    if (t.terrain === 'water') {
      let nearLand = false
      for (const n of neighbours4(w, h, i)) if (isLand(tiles[n])) nearLand = true
      if (nearLand && chance(primeRng, C.worldgen.primeChance * abundance * 0.8)) t.prime = 'shoal'
      continue
    }
    if ((t.terrain === 'dry' || t.terrain === 'mountain') && chance(primeRng, C.worldgen.goldChance * abundance * 0.6)) {
      t.prime = 'seam'
      t.goldReserve = int(primeRng, C.terrain.goldReserve.min, C.terrain.goldReserve.max)
      continue
    }
    if (chance(primeRng, C.worldgen.workingsChance) && (t.terrain === 'highland' || t.terrain === 'downs' || t.terrain === 'dry')) {
      t.workings = true
      continue
    }
    if (!chance(primeRng, C.worldgen.primeChance * abundance)) continue
    const options: PrimeId[] = []
    if (t.forest) options.push('stand')
    switch (t.terrain) {
      case 'grassland': options.push('richSoil', 'pasture', 'bloomMeadow'); break
      case 'plains': options.push('richSoil', 'flaxField', 'madderBed'); break
      case 'downs': options.push('hempField', 'pasture', 'bloomMeadow', 'madderBed'); break
      case 'marsh': options.push('bloomMeadow'); break
      case 'highland': options.push('lode'); break
      case 'mountain': options.push('lode'); break
      default: break
    }
    if (options.length) t.prime = pick(primeRng, options)
  }

  // ---- splashdowns ----------------------------------------------------------------------------
  // A viable coast is a coastal land tile with food, timber and fresh water within reach, on a
  // landmass large enough to live on. Every water tile's sailing distance to the nearest one is
  // a flood fill over water from all of them at once. A splashdown is an open sea tile, nothing
  // but water around it, whose distance lies within the voyage band; the player's is measured
  // against the largest landmass's coast so the first game is on the main country, and each
  // charter's is as far from the others as the map allows. Predecessors are placed afterwards and
  // kept out of sight of every splashdown.
  const { comp, sizes } = landComponents(w, h, tiles)
  const viableCoast = (i: number) => isCoastal(w, h, tiles, i) && landingViable(w, h, tiles, i) && sizes[comp[i]] >= C.worldgen.homeLandmassMin
  const bigComp = sizes.indexOf(Math.max(...sizes))
  const splashRng = fork(rng, 'splashdowns')
  const sep = C.worldgen.charterSeparation[settings.size]
  const band = voyageBand()
  const splashdowns: number[] = []
  const coasts: number[] = []
  // the player's: the main landmass's coast only
  const playerDist = sailingDistance(w, h, tiles, i => viableCoast(i) && comp[i] === bigComp)
  const anyDist = sailingDistance(w, h, tiles, viableCoast)
  const pickSplash = (d: Int32Array, taken: number[]): number => {
    const cands: number[] = []
    for (let i = 0; i < N; i++) {
      if (!isOpenSea(w, h, tiles, i) || d[i] < band[0] || d[i] > band[1]) continue
      if (!nothingInSight(w, h, tiles, i)) continue
      if (taken.some(t => dist(w, t, i) < sep)) continue
      cands.push(i)
    }
    if (!cands.length) return -1
    return pick(splashRng, cands)
  }
  const nearestCoast = (from: number, d: Int32Array, test: (i: number) => boolean): number => {
    // walk the distance field downhill to the coast it was measured from
    let cur = from
    for (let guard = 0; guard < w + h; guard++) {
      let best = -1, bd = d[cur]
      for (const n of neighbours8(w, h, cur)) {
        if (test(n)) return n
        if (tiles[n].terrain === 'water' && d[n] >= 0 && d[n] < bd) { bd = d[n]; best = n }
      }
      if (best < 0) break
      cur = best
    }
    for (const n of neighbours8(w, h, cur)) if (test(n)) return n
    return -1
  }
  const player = pickSplash(playerDist, [])
  if (player >= 0) {
    splashdowns.push(player)
    coasts.push(nearestCoast(player, playerDist, i => viableCoast(i) && comp[i] === bigComp))
  }
  for (let r = 0; r < C.rivals.count && splashdowns.length; r++) {
    let at = pickSplash(anyDist, splashdowns)
    // a tight map relaxes the separation rather than losing a charter
    if (at < 0) {
      const cands: number[] = []
      for (let i = 0; i < N; i++) if (isOpenSea(w, h, tiles, i) && nothingInSight(w, h, tiles, i) && anyDist[i] >= band[0] && anyDist[i] <= band[1] && splashdowns.every(t => dist(w, t, i) >= Math.floor(sep * 0.6))) cands.push(i)
      if (cands.length) at = pick(splashRng, cands)
    }
    if (at < 0) break
    splashdowns.push(at)
    coasts.push(nearestCoast(at, anyDist, viableCoast))
  }

  // ---- predecessors -----------------------------------------------------------------------
  const predRng = fork(rng, 'predecessors')
  const predecessors: PredecessorSettlement[] = []
  const predWanted = Math.max(3, Math.round(N / 1000 * C.worldgen.predecessorsPerThousandTiles * (0.5 + settings.predecessorDensity)))
  const predCandidates = shuffle(predRng, order.filter(i => isLand(tiles[i]) && tiles[i].terrain !== 'mountain' && tiles[i].terrain !== 'dry' && sizes[comp[i]] >= 20))
  const skills: PredecessorSettlement['teaches'][] = ['flax', 'hemp', 'madder', 'bloom']
  const manufactured: GoodId[] = ['linen', 'cordage', 'dye', 'attar', 'cores', 'tooling', 'arms', 'metal', 'horses']
  let k = 0
  for (const i of predCandidates) {
    if (predecessors.length >= predWanted) break
    // out of sight of every splashdown, and clear of the coast each lander makes for
    if (splashdowns.some(l => dist(w, l, i) <= C.lander.sight + 1)) continue
    if (coasts.some(l => dist(w, l, i) < 6)) continue
    if (predecessors.some(p => dist(w, p.tile, i) < 6)) continue
    const territory = neighbours8(w, h, i).filter(n => isLand(tiles[n]))
    territory.push(i)
    const wants = shuffle(predRng, manufactured.slice())
    predecessors.push({
      id: predecessors.length,
      name: PREDECESSOR_NAMES[predecessors.length % PREDECESSOR_NAMES.length],
      tile: i,
      territory,
      teaches: skills[k++ % skills.length],
      taught: false,
      strong: wants[0],
      minor: [wants[1], wants[2]],
      lastBought: null,
      wealth: 0,
      alarm: 0,
      agent: false,
      scouted: false,
      closed: false,
      haggled: false,
      gifts: 0,
    })
  }

  return { width: w, height: h, tiles, rivers, splashdowns, coasts, predecessors, attempts: attempt + 1 }
}

/** The band of sailing distances a splashdown may lie at, in tiles: the voyage in turns times the
 *  lander's speed, give or take the slack. */
export function voyageBand(): [number, number] {
  const turns = C.lander.voyageTurns, slack = C.lander.voyageSlack, moves = C.lander.moves
  return [(turns - slack) * moves, (turns + slack) * moves]
}

/** No land within the lander's sight of a tile, and a tile past it: the opening shows a little
 *  open sea and haze, and nothing else is known. Onboarding brief section 2. */
export function nothingInSight(w: number, h: number, tiles: Tile[], i: number): boolean {
  const r = C.lander.sight + 1
  const x = i % w, z = Math.floor(i / w)
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx, zz = z + dz
    if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue
    if (tiles[zz * w + xx].terrain !== 'water') return false
  }
  return true
}

/** Open sea: water with nothing but water around it, inside the map. */
export function isOpenSea(w: number, h: number, tiles: Tile[], i: number): boolean {
  if (tiles[i].terrain !== 'water') return false
  const ns = neighbours8(w, h, i)
  return ns.length === 8 && ns.every(n => tiles[n].terrain === 'water')
}

/** Every water tile's sailing distance, in tiles, from the nearest land tile passing `test`: a
 *  flood fill over water, eight ways, which is how a hull moves. Minus one where no such coast is
 *  reachable. */
export function sailingDistance(w: number, h: number, tiles: Tile[], test: (i: number) => boolean): Int32Array {
  const d = new Int32Array(w * h).fill(-1)
  const queue: number[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (!test(i)) continue
    for (const n of neighbours8(w, h, i)) if (tiles[n].terrain === 'water' && d[n] < 0) { d[n] = 1; queue.push(n) }
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]
    for (const n of neighbours8(w, h, c)) if (tiles[n].terrain === 'water' && d[n] < 0) { d[n] = d[c] + 1; queue.push(n) }
  }
  return d
}

/** The landing invariant: food, timber and fresh water within reach. */
export function landingViable(w: number, h: number, tiles: Tile[], i: number): boolean {
  if (!isLand(tiles[i]) || tiles[i].terrain === 'mountain' || tiles[i].terrain === 'dry') return false
  let food = 0, timber = 0, water = 0
  const x = i % w, y = Math.floor(i / w)
  const r = C.worldgen.landingReach
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    const t = tiles[ny * w + nx]
    if (t.terrain === 'water' || t.river > 0) water++
    if (t.forest) timber++
    const fy = C.terrain.yields[t.terrain].food ?? 0
    if (!t.forest && fy >= 3) food++
    if (t.terrain === 'water') food++
  }
  return food >= 3 && timber >= 1 && water >= 1
}

/** Which refining chain crops are on the same landmass as a tile. */
function chainsReachable(w: number, h: number, tiles: Tile[], comp: Int32Array, i: number): number {
  const c = comp[i]
  const found = new Set<string>()
  for (let k = 0; k < tiles.length; k++) {
    if (comp[k] !== c) continue
    const t = tiles[k]
    const y = C.terrain.yields[t.terrain]
    if (y.flax) found.add('flax')
    if (y.hemp) found.add('hemp')
    if (y.madder) found.add('madder')
    if (y.bloom) found.add('bloom')
    if (y.ore && y.ore >= 3) found.add('ore')
  }
  return found.size
}

function validate(world: World, settings: Settings): string | null {
  const { width: w, height: h, tiles } = world
  if (world.splashdowns.length < 1) return 'no splashdown'
  if (world.splashdowns.length < 1 + C.rivals.count) return 'too few splashdowns'
  const { comp, sizes } = landComponents(w, h, tiles)
  const band = voyageBand()
  const sep = C.worldgen.charterSeparation[settings.size]
  const viable = (i: number) => isCoastal(w, h, tiles, i) && landingViable(w, h, tiles, i) && sizes[comp[i]] >= C.worldgen.homeLandmassMin
  const d = sailingDistance(w, h, tiles, viable)
  for (let k = 0; k < world.splashdowns.length; k++) {
    const at = world.splashdowns[k], coast = world.coasts[k]
    if (!isOpenSea(w, h, tiles, at)) return 'splashdown not in open sea'
    if (!nothingInSight(w, h, tiles, at)) return 'land in sight at splashdown'
    // the voyage: the band holds for every charter, which is what fair means here
    if (d[at] < band[0] || d[at] > band[1]) return 'voyage out of band'
    if (coast < 0 || !viable(coast)) return 'no coast to make for'
    if (chainsReachable(w, h, tiles, comp, coast) < C.worldgen.minReachableChains) return 'too few chains'
    // nobody else in sight at splashdown
    for (let j = 0; j < world.splashdowns.length; j++) if (j !== k && dist(w, world.splashdowns[j], at) <= C.lander.sight + 1) return 'a rival in sight at splashdown'
    if (world.predecessors.some(p => dist(w, p.tile, at) <= C.lander.sight + 1)) return 'a predecessor in sight at splashdown'
    for (let j = 0; j < k; j++) if (dist(w, world.splashdowns[j], at) < Math.floor(sep * 0.6)) return 'splashdowns too close'
  }
  const home = world.coasts[0]
  const reachablePreds = world.predecessors.filter(p => comp[p.tile] === comp[home]).length
  if (reachablePreds < Math.min(C.worldgen.minPredecessorsReachable, world.predecessors.length)) return 'predecessors unreachable'
  // no unique resource on an unreachable landmass: bloom must exist on the home landmass
  let bloom = false
  for (let i = 0; i < tiles.length; i++) if (comp[i] === comp[home] && (C.terrain.yields[tiles[i].terrain].bloom ?? 0) >= 2) { bloom = true; break }
  if (!bloom) return 'no bloom reachable'
  if (sizes[comp[home]] < 60) return 'home landmass too small'
  return null
}

export function generateWorld(seed: string, settings: Settings): World {
  let last: World | null = null
  let reason = ''
  for (let attempt = 0; attempt < C.worldgen.maxAttempts; attempt++) {
    const world = generateOnce(seed, settings, attempt)
    const problem = validate(world, settings)
    last = world
    if (!problem) return world
    reason = problem
  }
  // Massive is generated but unvalidated per build specification section 12; for the tested sizes
  // the last attempt is returned and the problem is recorded on the state by the caller.
  ;(last as World & { problem?: string }).problem = reason
  return last!
}

/** One line of plain characterisation of the ground around a tile: what a founding would find. */
export function describeSite(w: number, h: number, tiles: Tile[], i: number): string {
  let food = 0, timber = 0, ore = 0, river = 0, water = 0, crops = 0, bloom = 0
  const x = i % w, y = Math.floor(i / w)
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    const t = tiles[ny * w + nx]
    const yl = C.terrain.yields[t.terrain]
    if (t.terrain === 'water') water++
    if (t.river) river++
    if (t.forest) timber += C.terrain.forestTimber[t.forest]
    else food += yl.food ?? 0
    ore += yl.ore ?? 0
    crops += (yl.flax ?? 0) + (yl.hemp ?? 0) + (yl.madder ?? 0)
    bloom += yl.bloom ?? 0
  }
  const parts: string[] = []
  parts.push(timber >= 12 ? 'good timber' : timber >= 5 ? 'some timber' : 'little timber')
  if (ore >= 8) parts.push('ore in the hills')
  else if (ore <= 2) parts.push('poor ore')
  if (river >= 2) parts.push('a river')
  if (food >= 30) parts.push('open ground')
  else if (food < 16) parts.push('thin ground')
  if (bloom >= 6) parts.push('bloom meadows')
  if (crops >= 10) parts.push('crop country')
  if (water >= 12) parts.push('sheltered water')
  return parts.slice(0, 3).join(', ')
}

export const PREDECESSOR_NAMES = [
  'Ashby', 'Cold Harbour', 'Ferrier', 'Long Reach', 'Mallow', 'Nine Wells', 'Oxley', 'Redfern', 'Saltings', 'Tarn',
  'Wickham', 'Yarrow', 'Brackwater', 'Cray', 'Dunmere', 'Elder Flat', 'Fenwick', 'Gilling', 'Hartsop', 'Ings',
]

export const SETTLEMENT_NAMES = [
  'Fairholm', 'Brightwater', 'Carrick', 'Dunhaven', 'Easterly', 'Fenmoor', 'Greyling', 'Hollins', 'Inverlea', 'Kestrel',
  'Lanthorn', 'Marrow', 'Netherby', 'Orchard Hill', 'Pellam', 'Quarry Reach', 'Ravensmere', 'Sorrel', 'Thornfield', 'Upton',
  'Vale End', 'Westerly', 'Yewbank', 'Amble', 'Birchmoor', 'Cotterel', 'Dearing', 'Ember', 'Farrow', 'Glasswater',
]

/** Apply a world to a fresh state's world section. */
export function worldToState(world: World): GameState['world'] {
  return {
    width: world.width,
    height: world.height,
    tiles: world.tiles,
    rivers: world.rivers,
    splashdowns: world.splashdowns,
  }
}

export { emptyStock, seedRng, next, int, chance, pick, shuffle }
export type { RngState }
