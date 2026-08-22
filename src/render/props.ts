// Props, seen from above. Art direction brief section 5. A tree from directly overhead is a rough
// disc of canopy, so no trunk is needed. Two or three canopy forms per forest type, instanced,
// opaque, twelve to twenty triangles each. Variation comes from per-instance scale, rotation and
// colour jitter. Culled entirely below working zoom, hysteretically, by scene.ts.

import * as THREE from 'three'
import type { GameState, ForestId } from '../sim/state'
import { forestCanopy } from './palette'

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

const DENSITY: Record<ForestId, number> = { lightWoodland: 4, deepTimber: 7, highlandForest: 5, coastalScrub: 4 }
const CANOPY: Record<ForestId, [number, number]> = { lightWoodland: [0.16, 0.24], deepTimber: [0.2, 0.3], highlandForest: [0.14, 0.22], coastalScrub: [0.1, 0.16] }

export interface PropBuild {
  group: THREE.Group
  count: number
}

function canopyGeometry(sides: number): THREE.BufferGeometry {
  // a low dome: a cone with a flattened top reads as a canopy under a raking light
  const g = new THREE.ConeGeometry(1, 0.9, sides, 1)
  g.translate(0, 0.35, 0)
  return g
}

export function buildProps(s: GameState, heightAt: (x: number, z: number) => number): PropBuild {
  const w = s.world.width, tiles = s.world.tiles
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const matRock = new THREE.MeshLambertMaterial({ color: 0xffffff })

  // count instances first
  let trees = 0, rocks = 0, reeds = 0, workings = 0
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    if (t.forest) trees += DENSITY[t.forest]
    if (t.terrain === 'mountain') rocks += 4
    else if (t.terrain === 'highland') rocks += 2
    if (t.terrain === 'marsh') reeds += 5
    if (t.workings) workings++
  }
  const treeMesh = new THREE.InstancedMesh(canopyGeometry(7), mat, Math.max(1, trees))
  const treeMeshes = [treeMesh, treeMesh]
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), matRock, Math.max(1, rocks + reeds))
  const reedMesh = rockMesh
  const ringGeo = new THREE.TorusGeometry(0.28, 0.05, 5, 10)
  ringGeo.rotateX(-Math.PI / 2)
  const workMesh = new THREE.InstancedMesh(ringGeo, matRock, Math.max(1, workings))
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3()
  const col = new THREE.Color()
  const counts = [0, 0]
  let rc = 0, wc = 0
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const x0 = i % w, z0 = Math.floor(i / w)
    if (t.forest) {
      const n = DENSITY[t.forest]
      const base = forestCanopy(t.forest)
      const [lo, hi] = CANOPY[t.forest]
      // thin at forest edges so the boundary is soft
      let edges = 0
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x0 + dx, nz = z0 + dz
        if (nx < 0 || nz < 0 || nx >= w || nz >= s.world.height) continue
        if (!tiles[nz * w + nx].forest) edges++
      }
      const keep = n - Math.min(n - 2, edges)
      for (let k = 0; k < keep; k++) {
        const mesh = treeMesh
        const idx = counts[0]++
        if (idx >= mesh.count) continue
        const x = x0 + 0.12 + hash(i * 7 + k, 1) * 0.76
        const z = z0 + 0.12 + hash(i * 7 + k, 2) * 0.76
        const r = lo + hash(i * 7 + k, 3) * (hi - lo)
        p.set(x, heightAt(x, z), z)
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i * 7 + k, 4) * Math.PI * 2)
        sc.set(r, r * 0.7, r)
        m.compose(p, q, sc)
        mesh.setMatrixAt(idx, m)
        const j = (hash(i * 7 + k, 5) - 0.5) * 0.16
        col.setRGB(Math.max(0, base[0] + j), Math.max(0, base[1] + j * 1.2), Math.max(0, base[2] + j * 0.6))
        mesh.setColorAt(idx, col)
      }
    }
    if (t.terrain === 'mountain' || t.terrain === 'highland') {
      const n = t.terrain === 'mountain' ? 4 : 2
      for (let k = 0; k < n; k++) {
        if (rc >= rockMesh.count) break
        const x = x0 + 0.15 + hash(i * 5 + k, 6) * 0.7, z = z0 + 0.15 + hash(i * 5 + k, 7) * 0.7
        const r = 0.05 + hash(i * 5 + k, 8) * (t.terrain === 'mountain' ? 0.11 : 0.06)
        p.set(x, heightAt(x, z) + r * 0.3, z)
        q.setFromEuler(new THREE.Euler(hash(i, 9) * 2, hash(i, 10) * 3, hash(k, 11)))
        sc.set(r, r * 0.7, r)
        m.compose(p, q, sc)
        rockMesh.setMatrixAt(rc, m)
        const g = 0.5 + hash(i * 5 + k, 12) * 0.18
        col.setRGB(g + 0.05, g, g - 0.04)
        rockMesh.setColorAt(rc, col)
        rc++
      }
    }
    if (t.terrain === 'marsh') {
      // reed clumps share the rock mesh: the same form, flattened and green
      for (let k = 0; k < 5; k++) {
        if (rc >= reedMesh.count) break
        const x = x0 + 0.1 + hash(i * 3 + k, 13) * 0.8, z = z0 + 0.1 + hash(i * 3 + k, 14) * 0.8
        const r = 0.04 + hash(i * 3 + k, 15) * 0.05
        p.set(x, heightAt(x, z), z)
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, k) * 3)
        sc.set(r, r * 0.5, r)
        m.compose(p, q, sc)
        reedMesh.setMatrixAt(rc, m)
        col.setRGB(0.42, 0.56, 0.3)
        reedMesh.setColorAt(rc, col)
        rc++
      }
    }
    if (t.workings && wc < workMesh.count) {
      const x = x0 + 0.5, z = z0 + 0.5
      p.set(x, heightAt(x, z) + 0.01, z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 16) * 3)
      sc.set(1, 1, 1)
      m.compose(p, q, sc)
      workMesh.setMatrixAt(wc, m)
      col.setRGB(0.42, 0.36, 0.3)
      workMesh.setColorAt(wc, col)
      wc++
    }
  }
  treeMesh.count = counts[0]
  rockMesh.count = rc
  workMesh.count = wc
  void treeMeshes
  for (const mesh of [treeMesh, rockMesh, workMesh]) {
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)
  }
  return { group, count: counts[0] + rc + wc }
}
