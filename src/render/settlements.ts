// Settlements are a kit of roofs. Art direction brief section 6. From above a settlement is roofs, so
// the kit is roof forms, and the three eras are three material treatments of the same kit. Modern in
// design, pre-industrial in material: clean rectangles on a surveyed grid. The composition is derived
// from the settlement's actual state, so chimneys mean industry and a ring of earthworks means walls.
// Owner colour is carried on the banner, never on terrain.

import * as THREE from 'three'
import type { GameState, Settlement } from '../sim/state'
import { BLOOM, hex } from './palette'

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

const ERA: [number, number, number][][] = [
  [[0.62, 0.46, 0.28], [0.76, 0.62, 0.36], [0.55, 0.4, 0.25]],      // early: timber and thatch
  [[0.5, 0.5, 0.52], [0.42, 0.44, 0.48], [0.6, 0.58, 0.55]],        // middle: worked stone and slate
  [[0.45, 0.25, 0.2], [0.36, 0.36, 0.38], [0.5, 0.3, 0.24]],        // late: metal and brick
]

export function eraOf(st: Settlement): 0 | 1 | 2 {
  let t2 = 0, t3 = 0
  for (const v of Object.values(st.buildings)) { if (v >= 2) t2++; if (v >= 3) t3++ }
  if (t3 >= 2) return 2
  if (t2 >= 2) return 1
  return 0
}

export function buildSettlements(s: GameState, heightAt: (x: number, z: number) => number, lod: 'full' | 'simple'): THREE.Group {
  const w = s.world.width
  const group = new THREE.Group()
  const roofs: { x: number; z: number; sx: number; sz: number; h: number; rot: number; c: [number, number, number] }[] = []
  const chimneys: { x: number; z: number }[] = []
  const rings: { x: number; z: number; r: number; t: number; c: [number, number, number] }[] = []
  const banners: { x: number; z: number; c: [number, number, number]; r: number }[] = []
  const wharves: { x: number; z: number; rot: number }[] = []
  const bastions: { x: number; z: number; rot: number }[] = []

  for (const st of s.settlements) {
    const cx = (st.tile % w) + 0.5, cz = Math.floor(st.tile / w) + 0.5
    const pop = st.owner === 0 ? st.colonists.length : st.abstractPop
    const era = st.owner === 0 ? eraOf(st) : (pop > 14 ? 2 : pop > 7 ? 1 : 0)
    const built = Object.values(st.buildings).filter(v => v > 0).length
    const n = Math.max(3, Math.min(16, Math.round(2 + pop * 0.6 + built * 0.5)))
    const palette = ERA[era]
    // a surveyed lattice, spacing set so a full kit fits inside the tile
    const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4
    const spacing = 0.78 / cols
    let placed = 0
    const order: [number, number][] = []
    for (let r = 0; r < cols; r++) for (let c = 0; c < cols; c++) order.push([r, c])
    order.sort((a, b) => (Math.abs(a[0] - (cols - 1) / 2) + Math.abs(a[1] - (cols - 1) / 2)) - (Math.abs(b[0] - (cols - 1) / 2) + Math.abs(b[1] - (cols - 1) / 2)))
    for (const [r, c] of order) {
      if (placed >= n) break
      const jx = (hash(st.id * 31 + placed, 1) - 0.5) * spacing * 0.25
      const jz = (hash(st.id * 31 + placed, 2) - 0.5) * spacing * 0.25
      const x = cx - 0.39 + spacing * (c + 0.5) + jx
      const z = cz - 0.39 + spacing * (r + 0.5) + jz
      const big = placed === 0 && era > 0
      const sx = spacing * (big ? 0.82 : 0.55 + hash(st.id * 31 + placed, 3) * 0.25)
      const sz = spacing * (big ? 0.6 : 0.45 + hash(st.id * 31 + placed, 4) * 0.25)
      const ht = 0.04 + (era === 2 ? 0.03 : 0) + hash(st.id * 31 + placed, 5) * 0.03
      const cc = palette[placed % palette.length]
      const j = (hash(st.id * 31 + placed, 6) - 0.5) * 0.08
      roofs.push({ x, z, sx, sz, h: ht, rot: (hash(st.id, 7) - 0.5) * 0.15, c: [cc[0] + j, cc[1] + j, cc[2] + j] })
      placed++
    }
    // chimneys mean industry
    const industry = (st.buildings.smelter > 0 ? 1 : 0) + (st.buildings.toolworks > 0 ? 1 : 0) + (st.buildings.armoury > 0 ? 1 : 0) + (st.buildings.still > 0 ? 1 : 0) + (st.buildings.finishing > 0 ? 1 : 0) + (st.buildings.dyeWorks > 0 ? 1 : 0)
    if (lod === 'full') for (let k = 0; k < industry; k++) chimneys.push({ x: cx - 0.3 + hash(st.id * 17 + k, 8) * 0.6, z: cz - 0.3 + hash(st.id * 17 + k, 9) * 0.6 })
    // walls
    const works = st.buildings.works
    if (works >= 1) rings.push({ x: cx, z: cz, r: 0.44, t: 0.02 + works * 0.012, c: [0.45, 0.38, 0.28] })
    if (works >= 3) for (let k = 0; k < 4; k++) bastions.push({ x: cx, z: cz, rot: k * Math.PI / 2 + Math.PI / 4 })
    // banner in owner colour
    const oc = hex(s.charters[st.owner]?.colour ?? '#ffffff')
    banners.push({ x: cx - 0.38, z: cz - 0.38, c: oc, r: 0.07 })
    // wharf on the adjacent water
    if (st.buildings.wharf > 0) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = Math.floor(cx) + dx, nz = Math.floor(cz) + dz
        const t = s.world.tiles[nz * w + nx]
        if (t && t.terrain === 'water') { wharves.push({ x: cx + dx * 0.62, z: cz + dz * 0.62, rot: dx !== 0 ? 0 : Math.PI / 2 }); break }
      }
    }
  }
  // predecessor settlements: round roofs in ochre, a low ring of their own
  for (const p of s.predecessors) {
    const cx = (p.tile % w) + 0.5, cz = Math.floor(p.tile / w) + 0.5
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + hash(p.id, k)
      const r = 0.16 + hash(p.id * 5, k) * 0.1
      roofs.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, sx: 0.11, sz: 0.11, h: 0.05, rot: a, c: [0.72, 0.6, 0.38] })
    }
    rings.push({ x: cx, z: cz, r: 0.4, t: 0.018, c: [0.55, 0.47, 0.32] })
    if (!p.taught) banners.push({ x: cx, z: cz, c: BLOOM, r: 0.05 })
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  // every box-shaped thing shares one instanced mesh: roofs, chimneys, bastions, banners, wharves
  for (const c of chimneys) roofs.push({ x: c.x, z: c.z, sx: 0.035, sz: 0.035, h: 0.12, rot: 0, c: [0.25, 0.24, 0.24] })
  for (const b of bastions) roofs.push({ x: b.x + Math.cos(b.rot) * 0.46, z: b.z + Math.sin(b.rot) * 0.46, sx: 0.16, sz: 0.16, h: 0.035, rot: b.rot, c: [0.45, 0.38, 0.28] })
  for (const b of banners) roofs.push({ x: b.x, z: b.z, sx: b.r * 2, sz: b.r * 2, h: 0.09, rot: 0, c: b.c })
  for (const wf of wharves) roofs.push({ x: wf.x, z: wf.z, sx: 0.34, sz: 0.12, h: 0.02, rot: wf.rot, c: [0.55, 0.42, 0.26] })
  const roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, roofs.length))
  roofs.forEach((r, i) => {
    pv.set(r.x, Math.max(0.005, heightAt(r.x, r.z)) + r.h / 2, r.z)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot)
    sc.set(r.sx, r.h, r.sz)
    m.compose(pv, q, sc)
    roofMesh.setMatrixAt(i, m)
    col.setRGB(r.c[0], r.c[1], r.c[2])
    roofMesh.setColorAt(i, col)
  })
  roofMesh.count = roofs.length
  group.add(roofMesh)

  const ringMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.06, 5, 28).rotateX(-Math.PI / 2), mat, Math.max(1, rings.length))
  rings.forEach((r, i) => {
    pv.set(r.x, heightAt(r.x, r.z) + 0.01, r.z)
    q.identity(); sc.set(r.r, r.t * 16, r.r)
    m.compose(pv, q, sc)
    ringMesh.setMatrixAt(i, m)
    col.setRGB(r.c[0], r.c[1], r.c[2])
    ringMesh.setColorAt(i, col)
  })
  ringMesh.count = rings.length
  group.add(ringMesh)

  for (const mesh of group.children as THREE.InstancedMesh[]) {
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
  }
  return group
}
