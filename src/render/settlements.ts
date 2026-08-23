// Settlements, from the middle era on, are a kit of roofs. Art direction brief section 6: from above
// a settlement is roofs, so the kit is roof forms, and worked stone and brick are two material
// treatments of it. Modern in design, pre-industrial in material: clean rectangles on a surveyed grid.
//
// The early era is no longer built from this kit. It is drawn, from the sheet in sprites.ts, and the
// kit stays here for the two eras that follow. What is still built for every era is everything that
// is not a building: the rampart, the bastions, the banner and the wharf, which are the things that
// say what a place does.
//
// The correction this file carries over the first build is that a roof is now a roof. A flat box seen
// from directly overhead is one rectangle of one value and reads as a floor tile. A pitched roof is
// two planes at different angles, so under a low sun one side is bright and the other is dark, and
// the eye reads it as a building instantly. Ridges run in both directions across a settlement so the
// place has some grain to it.
//
// Everything box-shaped shares one instanced mesh and everything roof-shaped shares another, so a
// settlement of any size is two draw calls.

import * as THREE from 'three'
import type { GameState, Settlement } from '../sim/state'
import { hexRgb, BUILD, SPRITE, seasonLook } from './look'
import { surfaceMaterial, type LightUniforms } from './shading'
import type { Occluder } from './shadow'
import { buildSpriteLayer, layOut, type SpritePlacement } from './sprites'

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

/** A gabled roof on a low wall, in a unit box: footprint one by one, ridge along z at full height. */
function gableGeometry(pitchFrom: number): THREE.BufferGeometry {
  const v: number[] = []
  // wound anticlockwise seen from outside, so the faces survive back-face culling. Getting this
  // backwards makes every roof in the game invisible and nothing else looks wrong, which is a good
  // reason to look at the picture rather than at the instance count
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { v.push(...a, ...c, ...b, ...a, ...d, ...c) }
  const tri = (a: number[], b: number[], c: number[]) => { v.push(...a, ...c, ...b) }
  const wf = pitchFrom
  const L = -0.5, R = 0.5, F = -0.5, B = 0.5
  // the two slopes, which is the whole point
  quad([L, wf, F], [0, 1, F], [0, 1, B], [L, wf, B])
  quad([R, wf, B], [0, 1, B], [0, 1, F], [R, wf, F])
  // gable ends
  tri([L, wf, F], [R, wf, F], [0, 1, F])
  tri([R, wf, B], [L, wf, B], [0, 1, B])
  // walls
  quad([L, 0, F], [R, 0, F], [R, wf, F], [L, wf, F])
  quad([R, 0, B], [L, 0, B], [L, wf, B], [R, wf, B])
  quad([L, 0, B], [L, 0, F], [L, wf, F], [L, wf, B])
  quad([R, 0, F], [R, 0, B], [R, wf, B], [R, wf, F])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return g
}

const ERA_COUNT = BUILD.eras.length

export function eraOf(st: Settlement): 0 | 1 | 2 {
  let t2 = 0, t3 = 0
  for (const v of Object.values(st.buildings)) { if (v >= 2) t2++; if (v >= 3) t3++ }
  if (t3 >= 2) return 2
  if (t2 >= 2) return 1
  return 0
}

interface Piece { x: number; z: number; sx: number; sy: number; sz: number; rot: number; c: [number, number, number]; base: number }

export interface SettlementBuild {
  group: THREE.Group
  /** Everything a settlement is when you can see it: the buildings, the rampart, the wharf. */
  close: THREE.Group
  /** What a settlement is when you cannot: one mark in owner colour, art brief section 10. */
  far: THREE.Group
  occluders: Occluder[]
}

export function buildSettlements(s: GameState, heightAt: (x: number, z: number) => number, light: LightUniforms, atlas: THREE.IUniform, season: number): SettlementBuild {
  const w = s.world.width
  const group = new THREE.Group()
  const close = new THREE.Group()
  const far = new THREE.Group()
  group.add(close, far)
  // both tiers are built, and the zoom picks between them by visibility. Rebuilding on a zoom change
  // would put a build in the middle of a gesture, which is the one thing the renderer never does
  const marks: Piece[] = []
  const look = seasonLook(season)
  const roofs: Piece[] = []
  const boxes: Piece[] = []
  const places: SpritePlacement[] = []
  const occluders: Occluder[] = []

  const push = (list: Piece[], p: Piece) => { list.push(p) }

  for (const st of s.settlements) {
    const cx = (st.tile % w) + 0.5, cz = Math.floor(st.tile / w) + 0.5
    const pop = st.owner === 0 ? st.colonists.length : st.abstractPop
    const era = st.owner === 0 ? eraOf(st) : (pop > 14 ? 2 : pop > 7 ? 1 : 0)
    const kit = BUILD.eras[Math.min(ERA_COUNT - 1, era)]
    const roofA = hexRgb(kit.roofA), roofB = hexRgb(kit.roofB)
    const built = Object.values(st.buildings).filter(v => v > 0).length
    // the early era is drawn. Below the zoom where props are culled nothing here is drawn at all and
    // the banner below is the whole settlement, per art brief section 10
    const drawn = era === 0
    if (drawn) {
      for (const place of layOut(st.id, pop + built * 0.5, cx, cz, heightAt)) {
        places.push(place)
        occluders.push({ x: place.x, z: place.z, height: SPRITE.occluderHeight, radius: SPRITE.occluderRadius })
      }
    }
    const n = drawn ? 0 : Math.max(3, Math.min(BUILD.maxBuildings, Math.round(2 + pop * 0.5 + built * 0.5)))
    // a surveyed lattice, spacing set so a full kit fits inside the tile. Fewer and larger, because
    // a settlement is one tile wide and sixteen small roofs in it are a texture, not a place
    const cols = n <= 4 ? 2 : 3
    const spacing = BUILD.spread / cols
    const order: [number, number][] = []
    for (let r = 0; r < cols; r++) for (let c = 0; c < cols; c++) order.push([r, c])
    order.sort((a, b) => (Math.abs(a[0] - (cols - 1) / 2) + Math.abs(a[1] - (cols - 1) / 2)) - (Math.abs(b[0] - (cols - 1) / 2) + Math.abs(b[1] - (cols - 1) / 2)))
    let placed = 0
    for (const [r, c] of order) {
      if (placed >= n) break
      const seed = st.id * 131 + placed
      const jx = (hash(seed, 1) - 0.5) * spacing * 0.22
      const jz = (hash(seed, 2) - 0.5) * spacing * 0.22
      const x = cx - BUILD.spread / 2 + spacing * (c + 0.5) + jx
      const z = cz - BUILD.spread / 2 + spacing * (r + 0.5) + jz
      const big = placed === 0 && era > 0
      const long = spacing * BUILD.fill * (big ? 1.08 : 0.8 + hash(seed, 3) * 0.24)
      const wide = spacing * BUILD.fill * (big ? 0.78 : 0.56 + hash(seed, 4) * 0.2)
      const height = BUILD.wallHeight + BUILD.ridgeRise * (big ? 1.5 : 0.7 + hash(seed, 5) * 0.7) + (era === 2 ? 0.02 : 0)
      // ridges run both ways across the place, so it has grain
      const rot = hash(seed, 6) > 0.45 ? Math.PI / 2 : 0
      const tone = hash(seed, 7)
      const cc: [number, number, number] = tone > 0.5 ? roofA : roofB
      const j = (hash(seed, 8) - 0.5) * 0.07
      push(roofs, { x, z, sx: rot === 0 ? wide : long, sy: height, sz: rot === 0 ? long : wide, rot, c: [cc[0] + j, cc[1] + j, cc[2] + j], base: 0 })
      occluders.push({ x, z, height, radius: Math.max(wide, long) * 0.55 })
      placed++
    }
    // chimneys mean industry
    const industry = (st.buildings.smelter > 0 ? 1 : 0) + (st.buildings.toolworks > 0 ? 1 : 0) + (st.buildings.armoury > 0 ? 1 : 0)
      + (st.buildings.still > 0 ? 1 : 0) + (st.buildings.finishing > 0 ? 1 : 0) + (st.buildings.dyeWorks > 0 ? 1 : 0)
    if (!drawn) {
      const smoke = hexRgb(BUILD.chimney)
      for (let k = 0; k < industry; k++) {
        const x = cx - 0.3 + hash(st.id * 17 + k, 9) * 0.6, z = cz - 0.3 + hash(st.id * 17 + k, 10) * 0.6
        push(boxes, { x, z, sx: 0.045, sy: 0.16 + hash(st.id + k, 11) * 0.07, sz: 0.045, rot: 0, c: smoke, base: 0 })
        occluders.push({ x, z, height: 0.2, radius: 0.05 })
      }
    }
    // works: a low rampart of segments rather than a ring, so it reads as built
    const works = st.buildings.works
    if (works >= 1) {
      const wall = hexRgb(BUILD.works)
      const segs = 20
      const rad = 0.44
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * Math.PI * 2
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad
        const height = 0.04 + works * 0.022
        push(boxes, { x, z, sx: 0.145, sy: height, sz: 0.04, rot: a + Math.PI / 2, c: wall, base: 0 })
        occluders.push({ x, z, height, radius: 0.05 })
      }
      if (works >= 3) for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4
        const x = cx + Math.cos(a) * (rad + 0.05), z = cz + Math.sin(a) * (rad + 0.05)
        push(boxes, { x, z, sx: 0.17, sy: 0.09, sz: 0.17, rot: a, c: wall, base: 0 })
        occluders.push({ x, z, height: 0.09, radius: 0.1 })
      }
    }
    // the owner's banner, the one place an owner colour appears on the ground. At overview zoom it
    // is the settlement: a mark in owner colour, which is what art brief section 10 asks for
    const oc = hexRgb(s.charters[st.owner]?.colour ?? '#ffffff')
    push(boxes, { x: cx, z: cz - 0.62, sx: 0.07, sy: 0.2, sz: 0.07, rot: 0, c: oc, base: 0 })
    push(marks, { x: cx, z: cz, sx: 0.34, sy: 0.13, sz: 0.34, rot: 0, c: oc, base: 0 })
    // a wharf reaching onto the water
    if (st.buildings.wharf > 0) {
      const deck = hexRgb(BUILD.wharf)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = Math.floor(cx) + dx, nz = Math.floor(cz) + dz
        const t = s.world.tiles[nz * w + nx]
        if (t && t.terrain === 'water') {
          push(boxes, { x: cx + dx * 0.68, z: cz + dz * 0.68, sx: dx !== 0 ? 0.5 : 0.16, sy: 0.05, sz: dx !== 0 ? 0.16 : 0.5, rot: 0, c: deck, base: 0.02 })
          break
        }
      }
    }
  }

  // predecessor settlements: round-set roofs in ochre inside a low ring
  const pRoof = hexRgb(BUILD.predecessorRoof), pRing = hexRgb(BUILD.predecessorRing)
  for (const p of s.predecessors) {
    const cx = (p.tile % w) + 0.5, cz = Math.floor(p.tile / w) + 0.5
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + hash(p.id, k)
      const r = 0.15 + hash(p.id * 5, k) * 0.11
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
      push(roofs, { x, z, sx: 0.13, sy: 0.085, sz: 0.13, rot: a, c: pRoof, base: 0 })
      occluders.push({ x, z, height: 0.085, radius: 0.08 })
    }
    const segs = 16
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2
      push(boxes, { x: cx + Math.cos(a) * 0.4, z: cz + Math.sin(a) * 0.4, sx: 0.13, sy: 0.04, sz: 0.04, rot: a + Math.PI / 2, c: pRing, base: 0 })
    }
  }

  void look
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color()
  const mat = surfaceMaterial(light, 1)
  const up = new THREE.Vector3(0, 1, 0)
  const fill = (list: Piece[], geo: THREE.BufferGeometry, centred: boolean, into: THREE.Group = close) => {
    if (!list.length) return
    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((r, i) => {
      const ground = Math.max(0.0, heightAt(r.x, r.z)) + r.base
      pv.set(r.x, ground + (centred ? r.sy / 2 : 0), r.z)
      q.setFromAxisAngle(up, r.rot)
      sc.set(r.sx, r.sy, r.sz)
      m.compose(pv, q, sc)
      mesh.setMatrixAt(i, m)
      col.setRGB(r.c[0], r.c[1], r.c[2])
      mesh.setColorAt(i, col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    into.add(mesh)
  }
  fill(roofs, gableGeometry(BUILD.pitch), false)
  fill(boxes, new THREE.BoxGeometry(1, 1, 1), true)
  fill(marks, new THREE.BoxGeometry(1, 1, 1), true, far)
  const sprites = buildSpriteLayer(places, light, atlas)
  if (sprites.mesh) close.add(sprites.mesh)

  return { group, close, far, occluders }
}
