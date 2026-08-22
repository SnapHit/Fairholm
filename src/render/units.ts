// Units. Art direction brief section 7: small, static, instanced, with a clear plan-view shape and a
// soft ground shadow. A hauler reads as a rectangle, an outrider is elongated, a militia block is
// square, a battery is a squat wedge. Owner colour is carried on the unit.

import * as THREE from 'three'
import type { GameState, Unit, UnitKind } from '../sim/state'
import { hex, type RGB } from './palette'

type Form = 'disc' | 'square' | 'long' | 'wedge' | 'rect' | 'hull' | 'company'

function formOf(kind: UnitKind): Form {
  switch (kind) {
    case 'colonist': case 'improver': return 'disc'
    case 'militia': return 'square'
    case 'outrider': return 'long'
    case 'battery': case 'damagedBattery': case 'siegeTrain': case 'damagedSiegeTrain': return 'wedge'
    case 'hauler': return 'rect'
    case 'lighter': case 'trader': case 'raider': case 'cutter': case 'companyShip': return 'hull'
    default: return 'company'
  }
}

function geometryFor(f: Form): THREE.BufferGeometry {
  switch (f) {
    case 'disc': return new THREE.CylinderGeometry(0.13, 0.14, 0.07, 10)
    case 'square': return new THREE.BoxGeometry(0.22, 0.07, 0.22)
    case 'long': return new THREE.BoxGeometry(0.32, 0.07, 0.14)
    case 'wedge': { const g = new THREE.ConeGeometry(0.16, 0.07, 3); g.rotateY(Math.PI / 6); return g }
    case 'rect': return new THREE.BoxGeometry(0.28, 0.06, 0.18)
    case 'hull': { const g = new THREE.CylinderGeometry(0.06, 0.16, 0.06, 4); g.rotateY(Math.PI / 4); g.scale(1.9, 1, 1); return g }
    case 'company': return new THREE.BoxGeometry(0.24, 0.08, 0.24)
  }
}

export interface UnitBuild {
  group: THREE.Group
  positions: Map<number, [number, number]>
}

export function buildUnits(s: GameState, heightAt: (x: number, z: number) => number): UnitBuild {
  const w = s.world.width
  const group = new THREE.Group()
  const positions = new Map<number, [number, number]>()
  const byForm = new Map<Form, { unit: Unit; x: number; z: number }[]>()
  const perTile = new Map<number, number>()
  for (const u of s.units) {
    const k = perTile.get(u.tile) ?? 0
    perTile.set(u.tile, k + 1)
    const cx = (u.tile % w) + 0.5, cz = Math.floor(u.tile / w) + 0.5
    // stacked units fan out a little so they read as several
    const ox = (k % 3 - 1) * 0.16, oz = (Math.floor(k / 3) - 0.5) * 0.16
    const atSettlement = s.settlements.some(st => st.tile === u.tile)
    const x = cx + ox + (atSettlement ? 0.22 : 0), z = cz + oz + (atSettlement ? 0.3 : 0)
    const f = formOf(u.kind)
    if (!byForm.has(f)) byForm.set(f, [])
    byForm.get(f)!.push({ unit: u, x, z })
    positions.set(u.id, [x, z])
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1a1610 })
  const total = s.units.length
  const shadow = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.004, 12), shadowMat, Math.max(1, total))
  let si = 0
  for (const [f, list] of byForm) {
    const mesh = new THREE.InstancedMesh(geometryFor(f), mat, list.length)
    list.forEach((e, i) => {
      const y = f === 'hull' ? 0.04 : heightAt(e.x, e.z) + 0.04
      p.set(e.x, y, e.z)
      q.identity()
      sc.set(1, 1, 1)
      m.compose(p, q, sc)
      mesh.setMatrixAt(i, m)
      const oc: RGB = e.unit.owner === 0 ? hex(s.charters[0].colour) : hex(s.charters[e.unit.owner]?.colour ?? '#444444')
      const company = e.unit.kind === 'regulars' || e.unit.kind === 'horse' || e.unit.kind === 'siegeTrain' || e.unit.kind === 'damagedSiegeTrain' || e.unit.kind === 'companyShip'
      if (company) col.setRGB(0.16, 0.14, 0.16)
      else if (e.unit.kind === 'raider' && !e.unit.flagged) col.setRGB(0.3, 0.3, 0.3)
      else col.setRGB(oc[0], oc[1], oc[2])
      mesh.setColorAt(i, col)
      // shadow, offset toward the sun's far side
      p.set(e.x + 0.05, y - 0.035, e.z + 0.05)
      sc.set(f === 'long' || f === 'hull' ? 1.25 : 1, 1, f === 'long' || f === 'hull' ? 0.75 : 1)
      m.compose(p, q, sc)
      shadow.setMatrixAt(si++, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)
  }
  shadow.count = si
  shadow.instanceMatrix.needsUpdate = true
  shadow.frustumCulled = false
  group.add(shadow)
  return { group, positions }
}

/** The arrival: a lander down and steaming offshore, a boat making for the coast. */
export function buildArrival(s: GameState, site: number | null, progress: number): THREE.Group {
  const group = new THREE.Group()
  const w = s.world.width
  const home = s.world.landingSites[0] ?? s.charters[0].landing
  // the splashdown point is out to sea from the first site
  const hx = (home % w) + 0.5, hz = Math.floor(home / w) + 0.5
  let sx = hx, sz = hz
  let best = 0
  for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
    const nx = Math.floor(hx) + dx, nz = Math.floor(hz) + dz
    if (nx < 0 || nz < 0 || nx >= w || nz >= s.world.height) continue
    const t = s.world.tiles[nz * w + nx]
    if (t.terrain !== 'water') continue
    let water = 0
    for (let ez = -1; ez <= 1; ez++) for (let ex = -1; ex <= 1; ex++) { const t2 = s.world.tiles[(nz + ez) * w + (nx + ex)]; if (t2 && t2.terrain === 'water') water++ }
    const score = water * 2 - Math.hypot(dx, dz) * 0.5
    if (score > best) { best = score; sx = nx + 0.5; sz = nz + 0.5 }
  }
  const lander = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x2a2a2e }))
  lander.position.set(sx, 0.05, sz)
  group.add(lander)
  for (let i = 0; i < 3; i++) {
    const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.2 + i * 0.18, 0.24 + i * 0.2, 0.02, 10), new THREE.MeshBasicMaterial({ color: 0xf2ece0 }))
    plume.position.set(sx + 0.25 + i * 0.3, 0.09 + i * 0.01, sz - 0.15 - i * 0.22)
    group.add(plume)
  }
  // the boat, with a wake, moving toward the chosen site when one is chosen
  const target = site ?? home
  const tx = (target % w) + 0.5, tz = Math.floor(target / w) + 0.5
  const t = Math.min(1, Math.max(0, progress))
  const bx = sx + (tx - sx) * (0.18 + 0.82 * t), bz = sz + (tz - sz) * (0.18 + 0.82 * t)
  const boatGeo = new THREE.CylinderGeometry(0.05, 0.12, 0.05, 4)
  boatGeo.rotateY(Math.PI / 4); boatGeo.scale(1.8, 1, 1)
  const boat = new THREE.Mesh(boatGeo, new THREE.MeshLambertMaterial({ color: 0xe9e2cc }))
  boat.position.set(bx, 0.04, bz)
  boat.rotation.y = -Math.atan2(tz - sz, tx - sx)
  group.add(boat)
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), new THREE.MeshBasicMaterial({ color: 0xd9e6e3 }))
  wake.rotation.x = -Math.PI / 2
  const back = 0.55
  wake.position.set(bx - Math.cos(-boat.rotation.y) * back, 0.015, bz - Math.sin(-boat.rotation.y) * back)
  wake.rotation.z = boat.rotation.y
  group.add(wake)
  return group
}

export function makeRing(colour: number, r: number): THREE.Mesh {
  const g = new THREE.TorusGeometry(r, 0.035, 6, 32)
  g.rotateX(-Math.PI / 2)
  const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour }))
  ring.visible = false
  return ring
}
