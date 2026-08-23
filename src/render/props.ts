// Props, seen from above. Art direction brief section 5, and the thing the first build got wrong:
// good light on an empty surface is still an empty surface. There are now tens of thousands of these
// rather than a few hundred, which instancing makes nearly free, and they arrive at three scales.
//
//  large   the ground itself, in terrain.ts
//  medium  trees, boulders, reeds, the settlement kit
//  small   undergrowth, tufts, pebbles, shoreline debris
//
// The small tier only appears at detail zoom, where it is the difference between a lit surface and a
// place; at working zoom it would be noise, and below working zoom everything here is culled.
//
// Forms are opaque and low poly, never alpha cards. A canopy is a two-ring dome so that a raking sun
// crosses several facets of it rather than one, which is what makes it read as a tree from directly
// overhead. Every canopy, rock and tuft carries its own scale, rotation and hue.
//
// Every number and colour comes from src/render/look.ts.

import * as THREE from 'three'
import type { GameState, ForestId, TerrainId, Tile } from '../sim/state'
import { forestCanopy } from './palette'
import { PROPS, SHADOW, seasonLook, hexRgb } from './look'
import { surfaceMaterial, type LightUniforms } from './shading'
import type { Occluder } from './shadow'

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

export interface PropBuild {
  /** Visible from working zoom up: trees, boulders, reeds. */
  coarse: THREE.Group
  /** Visible at detail zoom only: undergrowth, tufts, pebbles, shore debris. */
  fine: THREE.Group
  /** Everything worth casting a shadow, for the bake. */
  occluders: Occluder[]
  count: number
}

/** A canopy: a low dome of two rings, open underneath because nothing ever sees under it. */
function canopyGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.46)
  g.scale(1, 0.62, 1)
  g.translate(0, 0.02, 0)
  return g
}

/** A tuft: a squat four-sided spike, which from above is four small planes at different angles. */
function tuftGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1.5, 4, 1, true)
  g.translate(0, 0.6, 0)
  return g
}

function rockGeometry(): THREE.BufferGeometry {
  return new THREE.DodecahedronGeometry(1, 0)
}

/** A shard: flatter and sharper than a boulder, for scree and shoreline shingle. */
function shardGeometry(): THREE.BufferGeometry {
  const g = new THREE.TetrahedronGeometry(1, 0)
  g.scale(1, 0.55, 1)
  return g
}

interface Slot {
  mesh: THREE.InstancedMesh
  n: number
}

function slot(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number): Slot {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, capacity))
  mesh.frustumCulled = false
  return { mesh, n: 0 }
}

export function buildProps(s: GameState, heightAt: (x: number, z: number) => number, light: LightUniforms, season: number): PropBuild {
  const w = s.world.width, hgt = s.world.height, tiles = s.world.tiles
  // a settlement clears its own ground and thins what stands around it. Without this the roofs are
  // simply hidden under a wood, and a place people live reads as a place they do not
  const clearance = new Float32Array(tiles.length).fill(1)
  const clear = (tile: number) => {
    clearance[tile] = 0
    const x = tile % w, z = Math.floor(tile / w)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= hgt) continue
      clearance[nz * w + nx] = Math.min(clearance[nz * w + nx], PROPS.settlementThinning)
    }
    clearance[tile] = 0
  }
  for (const st of s.settlements) clear(st.tile)
  for (const pr of s.predecessors) clear(pr.tile)
  const look = seasonLook(season)
  const coarse = new THREE.Group(), fine = new THREE.Group()
  const matCoarse = surfaceMaterial(light, 1)
  const matFine = surfaceMaterial(light, 0.9)
  const occluders: Occluder[] = []

  // ---- count first, so every instanced mesh is exactly the size it needs ------------------------
  let trees = 0, rocks = 0, small = 0
  const shoreTile = new Uint8Array(tiles.length)
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    if (t.terrain === 'water') continue
    const x0 = i % w, z0 = Math.floor(i / w)
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = x0 + dx, nz = z0 + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= hgt) continue
      if (tiles[nz * w + nx].terrain === 'water') { shoreTile[i] = 1; break }
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    if (clearance[i] <= 0) continue
    if (t.forest) { trees += PROPS.trees[t.forest]; small += PROPS.undergrowth }
    else trees += PROPS.scrub[t.terrain] ?? 0
    rocks += PROPS.rocks[t.terrain] ?? 0
    if (t.terrain === 'marsh') rocks += PROPS.reeds
    small += (PROPS.tufts[t.terrain] ?? 0) + (PROPS.pebbles[t.terrain] ?? 0)
    if (shoreTile[i]) small += PROPS.shoreDebris
  }

  const treeSlot = slot(canopyGeometry(), matCoarse, trees)
  const rockSlot = slot(rockGeometry(), matCoarse, rocks)
  const tuftSlot = slot(tuftGeometry(), matFine, small)
  const shardSlot = slot(shardGeometry(), matFine, small)

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const col = new THREE.Color()

  /** A colour wandered off its base in hue and in value, so no two are the same. */
  const vary = (base: [number, number, number], seed: number) => {
    const hueShift = (hash(seed, 91) - 0.5) * PROPS.hueJitter
    const value = 1 + (hash(seed, 92) - 0.5) * PROPS.valueJitter
    col.setRGB(base[0], base[1], base[2])
    const hsl = { h: 0, s: 0, l: 0 }
    col.getHSL(hsl)
    col.setHSL((hsl.h + hueShift + 1) % 1, Math.max(0, Math.min(1, hsl.s * (1 + hueShift * 2))), Math.max(0, Math.min(1, hsl.l * value)))
    return col
  }

  const put = (sl: Slot, x: number, z: number, y: number, rx: number, ry: number, rz: number, spin: number, colour: THREE.Color) => {
    if (sl.n >= sl.mesh.count) return false
    p.set(x, y, z)
    q.setFromAxisAngle(up, spin)
    sc.set(rx, ry, rz)
    m.compose(p, q, sc)
    sl.mesh.setMatrixAt(sl.n, m)
    sl.mesh.setColorAt(sl.n, colour)
    sl.n++
    return true
  }

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const thin = clearance[i]
    if (t.terrain === 'water' || thin <= 0) continue
    const x0 = i % w, z0 = Math.floor(i / w)

    // ---- trees: dense inside a wood, thinning where it meets open ground -----------------------
    if (t.forest) {
      const f: ForestId = t.forest
      const n = PROPS.trees[f]
      const base = forestCanopy(f, season)
      const [lo, hi] = PROPS.canopy[f]
      let edges = 0
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = x0 + dx, nz = z0 + dz
        if (nx < 0 || nz < 0 || nx >= w || nz >= hgt) continue
        if (!tiles[nz * w + nx].forest) edges++
      }
      const keep = Math.round(n * (1 - 0.16 * edges) * thin)
      for (let k = 0; k < keep; k++) {
        const seed = i * 31 + k
        const x = x0 + 0.04 + hash(seed, 1) * 0.92
        const z = z0 + 0.04 + hash(seed, 2) * 0.92
        const emergent = k % PROPS.emergentEvery === 0
        const r = (lo + hash(seed, 3) * (hi - lo)) * (emergent ? PROPS.emergentScale : 1)
        const tall = 0.75 + hash(seed, 6) * 0.7
        if (put(treeSlot, x, z, heightAt(x, z) - r * 0.1, r, r * tall, r * (0.88 + hash(seed, 7) * 0.24), hash(seed, 4) * Math.PI * 2, vary(base, seed))) {
          occluders.push({ x, z, height: r * tall * 1.1, radius: r * 0.8 })
        }
      }
      // undergrowth under the canopy, at detail zoom
      for (let k = 0; k < Math.round(PROPS.undergrowth * thin); k++) {
        const seed = i * 17 + k + 5000
        const x = x0 + 0.05 + hash(seed, 8) * 0.9
        const z = z0 + 0.05 + hash(seed, 9) * 0.9
        const r = PROPS.tuftSize[0] + hash(seed, 10) * (PROPS.tuftSize[1] - PROPS.tuftSize[0]) * 1.4
        put(tuftSlot, x, z, heightAt(x, z), r, r * (1.1 + hash(seed, 11)), r, hash(seed, 12) * 3.2, vary(base, seed + 3))
      }
    }

    // ---- scrub on open ground ----------------------------------------------------------------------
    // the thing the last pass missed: density worked inside a wood and did nothing outside one, so
    // open country was a coloured field with good light on it. These are low, wide and dull, and
    // they are in the coarse tier, which means they are there at the default zoom
    const scrubN = Math.round((PROPS.scrub[t.terrain] ?? 0) * thin)
    if (scrubN > 0 && !t.forest) {
      const size = PROPS.scrubSize[t.terrain] ?? [0.04, 0.1]
      const ground = hexRgb(look.ground[t.terrain])
      const leaf = hexRgb(look.canopy.coastalScrub)
      // half way to a canopy, so scrub belongs to the ground it stands on rather than to the woods
      const bush: [number, number, number] = [
        ground[0] * 0.45 + leaf[0] * 0.55, ground[1] * 0.45 + leaf[1] * 0.55, ground[2] * 0.45 + leaf[2] * 0.55,
      ]
      for (let k = 0; k < scrubN; k++) {
        const seed = i * 23 + k + 6100
        const x = x0 + 0.05 + hash(seed, 33) * 0.9
        const z = z0 + 0.05 + hash(seed, 34) * 0.9
        const r = size[0] + hash(seed, 35) * (size[1] - size[0])
        const squat = 0.42 + hash(seed, 36) * 0.4
        if (put(treeSlot, x, z, heightAt(x, z) - r * 0.14, r, r * squat, r * (0.8 + hash(seed, 37) * 0.4), hash(seed, 38) * 3.2, vary(bush, seed))) {
          occluders.push({ x, z, height: r * squat * 1.1, radius: r * 0.75 })
        }
      }
    }

    // ---- boulders and scattered rock -------------------------------------------------------------
    const rockN = Math.round((PROPS.rocks[t.terrain] ?? 0) * thin)
    if (rockN > 0) {
      const size = PROPS.rockSize[t.terrain] ?? [0.03, 0.07]
      const ground = hexRgb(look.ground[t.terrain])
      for (let k = 0; k < rockN; k++) {
        const seed = i * 13 + k + 900
        const x = x0 + 0.05 + hash(seed, 13) * 0.9
        const z = z0 + 0.05 + hash(seed, 14) * 0.9
        const r = size[0] + hash(seed, 15) * (size[1] - size[0])
        const stone: [number, number, number] = [ground[0] * 0.86 + 0.14, ground[1] * 0.86 + 0.12, ground[2] * 0.86 + 0.12]
        if (put(rockSlot, x, z, heightAt(x, z) + r * 0.2, r, r * (0.5 + hash(seed, 16) * 0.5), r * (0.8 + hash(seed, 17) * 0.4), hash(seed, 18) * 3.2, vary(stone, seed))) {
          if (r > 0.06) occluders.push({ x, z, height: r * 0.9, radius: r })
        }
      }
    }

    // ---- reeds in a marsh --------------------------------------------------------------------------
    if (t.terrain === 'marsh') {
      const reed = hexRgb(look.canopy.coastalScrub)
      for (let k = 0; k < Math.round(PROPS.reeds * thin); k++) {
        const seed = i * 7 + k + 400
        const x = x0 + 0.05 + hash(seed, 19) * 0.9
        const z = z0 + 0.05 + hash(seed, 20) * 0.9
        const r = PROPS.reedSize[0] + hash(seed, 21) * (PROPS.reedSize[1] - PROPS.reedSize[0])
        put(rockSlot, x, z, heightAt(x, z), r, r * (2.2 + hash(seed, 22) * 1.6), r, hash(seed, 23) * 3.2, vary(reed, seed))
      }
    }

    // ---- tufts on open ground, and shingle along the waterline -------------------------------------
    const tuftN = Math.round((PROPS.tufts[t.terrain] ?? 0) * thin)
    if (tuftN > 0 && !t.forest) {
      const ground = hexRgb(look.ground[t.terrain])
      const blade: [number, number, number] = [ground[0] * 0.82, ground[1] * 0.94, ground[2] * 0.7]
      for (let k = 0; k < tuftN; k++) {
        const seed = i * 11 + k + 1700
        const x = x0 + 0.04 + hash(seed, 24) * 0.92
        const z = z0 + 0.04 + hash(seed, 25) * 0.92
        const r = PROPS.tuftSize[0] + hash(seed, 26) * (PROPS.tuftSize[1] - PROPS.tuftSize[0])
        put(tuftSlot, x, z, heightAt(x, z), r, r * (1.3 + hash(seed, 27) * 1.4), r, hash(seed, 28) * 3.2, vary(blade, seed))
      }
    }
    const pebbleN = Math.round((PROPS.pebbles[t.terrain] ?? 0) * thin)
    if (pebbleN > 0) {
      const ground = hexRgb(look.ground[t.terrain])
      const grit: [number, number, number] = [ground[0] * 0.7 + 0.22, ground[1] * 0.7 + 0.2, ground[2] * 0.7 + 0.18]
      for (let k = 0; k < pebbleN; k++) {
        const seed = i * 29 + k + 4300
        const x = x0 + 0.04 + hash(seed, 39) * 0.92
        const z = z0 + 0.04 + hash(seed, 40) * 0.92
        const r = PROPS.debrisSize[0] + hash(seed, 41) * (PROPS.debrisSize[1] - PROPS.debrisSize[0])
        put(shardSlot, x, z, heightAt(x, z) + r * 0.18, r, r * (0.5 + hash(seed, 42) * 0.5), r, hash(seed, 43) * 3.2, vary(grit, seed))
      }
    }
    if (shoreTile[i]) {
      const shingle = hexRgb(look.shore)
      for (let k = 0; k < Math.round(PROPS.shoreDebris * thin); k++) {
        const seed = i * 19 + k + 2600
        const x = x0 + 0.05 + hash(seed, 29) * 0.9
        const z = z0 + 0.05 + hash(seed, 30) * 0.9
        const r = PROPS.debrisSize[0] + hash(seed, 31) * (PROPS.debrisSize[1] - PROPS.debrisSize[0])
        put(shardSlot, x, z, heightAt(x, z) + r * 0.2, r, r * 0.6, r, hash(seed, 32) * 3.2, vary(shingle, seed))
      }
    }
  }

  for (const [sl, group] of [[treeSlot, coarse], [rockSlot, coarse], [tuftSlot, fine], [shardSlot, fine]] as [Slot, THREE.Group][]) {
    sl.mesh.count = sl.n
    sl.mesh.instanceMatrix.needsUpdate = true
    if (sl.mesh.instanceColor) sl.mesh.instanceColor.needsUpdate = true
    if (sl.n > 0) group.add(sl.mesh)
  }
  void SHADOW
  return { coarse, fine, occluders, count: treeSlot.n + rockSlot.n + tuftSlot.n + shardSlot.n }
}

/** What the props standing on a tile do to the colour of it: how much of the ground they cover, and
 *  what colour they are on average.
 *
 *  This exists so that culling a tier does not repaint the country. Pulling the camera back takes
 *  twenty thousand props off the map at a stroke, and without this the same ground goes from a wood
 *  with scrub and stone in it to a flat rectangle of one green, which is the map changing colour
 *  when the camera moves rather than when the season does. The terrain blends toward this by exactly
 *  as much as the props that are not being drawn would have covered.
 *
 *  Derived from the same constants the props are placed from, so the two cannot drift. */
export function groundCover(t: Tile, season: number): { mix: number; colour: [number, number, number] } {
  const look = seasonLook(season)
  const ground = hexRgb(look.ground[t.terrain])
  if (t.terrain === 'water') return { mix: 0, colour: ground }
  let area = 0, r = 0, g = 0, b = 0
  const add = (n: number, radius: number, c: [number, number, number]) => {
    if (n <= 0 || radius <= 0) return
    const a = n * Math.PI * radius * radius
    area += a; r += c[0] * a; g += c[1] * a; b += c[2] * a
  }
  const mid = (s: [number, number]) => (s[0] + s[1]) / 2
  if (t.forest) {
    add(PROPS.trees[t.forest], mid(PROPS.canopy[t.forest]), forestCanopy(t.forest, season))
  } else {
    const leaf = hexRgb(look.canopy.coastalScrub)
    add(PROPS.scrub[t.terrain] ?? 0, mid(PROPS.scrubSize[t.terrain] ?? [0.04, 0.1]),
      [ground[0] * 0.45 + leaf[0] * 0.55, ground[1] * 0.45 + leaf[1] * 0.55, ground[2] * 0.45 + leaf[2] * 0.55])
  }
  add(PROPS.rocks[t.terrain] ?? 0, mid(PROPS.rockSize[t.terrain] ?? [0.03, 0.07]),
    [ground[0] * 0.86 + 0.14, ground[1] * 0.86 + 0.12, ground[2] * 0.86 + 0.12])
  if (!t.forest) add(PROPS.tufts[t.terrain] ?? 0, mid(PROPS.tuftSize), [ground[0] * 0.82, ground[1] * 0.94, ground[2] * 0.7])
  add(PROPS.pebbles[t.terrain] ?? 0, mid(PROPS.debrisSize),
    [ground[0] * 0.7 + 0.22, ground[1] * 0.7 + 0.2, ground[2] * 0.7 + 0.18])
  if (area <= 0) return { mix: 0, colour: ground }
  return { mix: Math.min(PROPS.coverMax, area), colour: [r / area, g / area, b / area] }
}

const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export type { TerrainId }
