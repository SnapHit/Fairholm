// Rivers and roads are drawn, not tiled. Art direction brief section 4. Both are generated as
// continuous ribbon meshes following a spline through the tiles they occupy. One draw call each.

import * as THREE from 'three'
import type { GameState } from '../sim/state'
import { riverColour, roadColour } from './palette'
import { surfaceMaterial, type LightUniforms } from './shading'

function hash(i: number, k: number): number {
  let h = (i * 2654435761 + k * 40503) | 0
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13
  return ((h >>> 0) % 1000) / 1000
}

/** Build a ribbon strip through a list of world points with a width, lifted to the terrain. */
function ribbon(points: THREE.Vector3[], width: number, pos: number[], idx: number[], heightAt: (x: number, z: number) => number, lift: number) {
  if (points.length < 2) return
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)
  const n = Math.max(8, points.length * 5)
  const pts = curve.getPoints(n)
  const base = pos.length / 3
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)]
    const dx = next.x - prev.x, dz = next.z - prev.z
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len, nz = dx / len
    // a little width variation so the edge is not mechanical
    const wv = width * (0.85 + 0.3 * hash(i, base))
    const y1 = heightAt(p.x + nx * wv, p.z + nz * wv) + lift
    const y2 = heightAt(p.x - nx * wv, p.z - nz * wv) + lift
    pos.push(p.x + nx * wv, y1, p.z + nz * wv)
    pos.push(p.x - nx * wv, y2, p.z - nz * wv)
    if (i > 0) {
      const a = base + (i - 1) * 2, b = a + 1, c = a + 2, d = a + 3
      idx.push(a, c, b, b, c, d)
    }
  }
}

function makeMesh(pos: number[], idx: number[], col: number[], light: LightUniforms): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, surfaceMaterial(light, 1, true))
  m.frustumCulled = false
  return m
}

function paint(col: number[], from: number, to: number, c: [number, number, number]) {
  for (let i = from; i < to; i++) col.push(c[0], c[1], c[2])
}

/** Rivers and roads in one mesh and one draw call. Roads change with play, so the whole mesh is
 * rebuilt on a dynamic rebuild; it is small. */
export function buildRibbons(s: GameState, heightAt: (x: number, z: number) => number, light: LightUniforms, season: number): THREE.Mesh {
  const pos: number[] = [], idx: number[] = [], col: number[] = []
  addRivers(s, heightAt, pos, idx)
  paint(col, 0, pos.length / 3, riverColour(season))
  const before = pos.length / 3
  addRoads(s, heightAt, pos, idx)
  paint(col, before, pos.length / 3, roadColour(season))
  return makeMesh(pos, idx, col, light)
}

function addRivers(s: GameState, heightAt: (x: number, z: number) => number, pos: number[], idx: number[]) {
  const w = s.world.width
  for (const r of s.world.rivers) {
    const pts: THREE.Vector3[] = r.tiles.map((t, i) => {
      const x = (t % w) + 0.5 + (hash(t, 1) - 0.5) * 0.5
      const z = Math.floor(t / w) + 0.5 + (hash(t, 2) - 0.5) * 0.5
      return new THREE.Vector3(x, 0, z)
    })
    // extend into the water so the mouth reads as a mouth
    const last = r.tiles[r.tiles.length - 1]
    const lx = last % w, lz = Math.floor(last / w)
    const prev = pts[pts.length - 2] ?? pts[0]
    const dir = new THREE.Vector3(lx + 0.5 - prev.x, 0, lz + 0.5 - prev.z).normalize()
    pts.push(new THREE.Vector3(lx + 0.5 + dir.x * 1.2, 0, lz + 0.5 + dir.z * 1.2))
    ribbon(pts, r.major ? 0.2 : 0.1, pos, idx, (x, z) => Math.max(0.0, heightAt(x, z)), 0.022)
  }
}

function addRoads(s: GameState, heightAt: (x: number, z: number) => number, pos: number[], idx: number[]) {
  const w = s.world.width, h = s.world.height
  const tiles = s.world.tiles
  const seen = new Set<string>()
  for (let i = 0; i < tiles.length; i++) {
    if (!tiles[i].road && !s.settlements.some(st => st.tile === i)) continue
    const x = i % w, z = Math.floor(i / w)
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
      const n = nz * w + nx
      const nIsRoad = tiles[n].road || s.settlements.some(st => st.tile === n)
      if (!nIsRoad || !tiles[i].road && !tiles[n].road) continue
      const key = Math.min(i, n) + ':' + Math.max(i, n)
      if (seen.has(key)) continue
      seen.add(key)
      const pts = [new THREE.Vector3(x + 0.5, 0, z + 0.5), new THREE.Vector3((x + nx) / 2 + 0.5 + (hash(i, 3) - 0.5) * 0.2, 0, (z + nz) / 2 + 0.5 + (hash(n, 4) - 0.5) * 0.2), new THREE.Vector3(nx + 0.5, 0, nz + 0.5)]
      ribbon(pts, 0.11, pos, idx, heightAt, 0.024)
    }
  }
}
