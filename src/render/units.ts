// Units. Art direction brief section 7: small, static, instanced, with a clear plan-view shape. A
// hauler reads as a rectangle, an outrider is elongated, a militia block is square, a battery is a
// squat wedge. Owner colour is carried on the unit.
//
// The people are now drawn. A colonist and an improver are the figure on the units sheet, a
// billboard anchored at the feet and standing on the tile, drawn in one layer with the early era
// buildings so that a person in front of a barn is in front of it and a person behind a longhouse is
// behind it. Militia, outriders, batteries, hulls and the Company's units keep their forms until
// their own drawings arrive; nothing is stretched or recoloured to stand in for them.
//
// Owner colour is not a tint on the figure. The drawing is cream and tan and a charter's crimson
// laid over it would ruin it, and at this size a coloured coat would not read anyway. It is a ring
// on the ground under the feet, in charter colour, lit like everything else.
//
// The ground shadow is not geometry. Every unit hands the shadow bake an occluder, so its shadow
// lies away from the sun with everything else's and costs no draw call. The figure's is as tall as
// the figure, so it lies as far as a small tree's does.
//
// Which drawing a kind of unit is comes from the sheet's manifest first, by the kind's own name, and
// from UNIT_SPRITE.pieces second, for kinds that borrow another's. A new figure on the sheet under
// its kind's name is a manifest change and nothing else.

import * as THREE from 'three'
import type { GameState, Unit, UnitKind } from '../sim/state'
import { hex, type RGB } from './palette'
import { UNITS, UNIT_SPRITE } from './look'
import { surfaceMaterial, flatMaterial, type LightUniforms } from './shading'
import type { Occluder } from './shadow'
import type { AtlasManifest, AtlasPiece, Billboard } from './billboards'

type Form = 'disc' | 'square' | 'long' | 'wedge' | 'rect' | 'hull' | 'company'

const clamp = (v: number, reach: number) => (v < -reach ? -reach : v > reach ? reach : v)

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

/** The drawing for a kind of unit, if the sheet has one: by the kind's own name first, then by the
 *  alias table in the theme layer. Null means the kind keeps its built form. */
export function pieceFor(kind: UnitKind, sheet: AtlasManifest): AtlasPiece | null {
  const own = sheet.pieces[kind]
  if (own) return own
  const alias = UNIT_SPRITE.pieces[kind]
  return alias ? sheet.pieces[alias] ?? null : null
}

/** Where a ring of this size has to sit to lie over the ground rather than in it.
 *
 *  The highest of nine samples across it, plus the spread of those samples again. The surface is a
 *  jittered mesh and heightAt snaps to the nearest vertex rather than interpolating, so on broken
 *  ground the real surface between two samples can be higher than either; the spread is the best
 *  estimate of that error there is, and on flat ground it is nothing. The camera looks straight
 *  down, so none of this moves the ring on screen: it only decides what the ring is drawn in front
 *  of. */
function ringHeight(x: number, z: number, heightAt: (x: number, z: number) => number): number {
  const r = UNIT_SPRITE.ring.outer
  let top = heightAt(x, z), low = top
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const h = heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)
    if (h > top) top = h
    if (h < low) low = h
  }
  return top + (top - low)
}

/** A flat ring lying on the ground, the owner's mark under a drawn figure. */
function ringGeometry(): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(UNIT_SPRITE.ring.inner, UNIT_SPRITE.ring.outer, UNIT_SPRITE.ring.segments, 1)
  g.rotateX(-Math.PI / 2)
  return g
}

export interface UnitBuild {
  group: THREE.Group
  /** What a drawn unit has on the ground when you can see it: its owner ring. */
  close: THREE.Group
  /** What a drawn unit is when you cannot: the disc it was before it was drawn. */
  far: THREE.Group
  /** The figures, for the scene to draw in one layer with every other picture on the map. */
  billboards: Billboard[]
  positions: Map<number, [number, number]>
  occluders: Occluder[]
}

/** `sheet` is the units sheet's manifest, and `sheetIndex` where it stands in the list handed to
 *  buildBillboards. */
export function buildUnits(s: GameState, heightAt: (x: number, z: number) => number, light: LightUniforms, sheet: AtlasManifest, sheetIndex: number): UnitBuild {
  const w = s.world.width
  const group = new THREE.Group()
  const close = new THREE.Group()
  const far = new THREE.Group()
  group.add(close, far)
  const positions = new Map<number, [number, number]>()
  const byForm = new Map<Form, { unit: Unit; x: number; z: number }[]>()
  const drawn: { unit: Unit; x: number; z: number; piece: AtlasPiece }[] = []
  const perTile = new Map<number, number>()
  for (const u of s.units) {
    const k = perTile.get(u.tile) ?? 0
    perTile.set(u.tile, k + 1)
    const cx = (u.tile % w) + 0.5, cz = Math.floor(u.tile / w) + 0.5
    // stacked units fan out a little so they read as several, and units on a settlement's own tile
    // shift clear of its buildings. Both are then held inside the tile: this position is what a tap
    // is measured against, so a unit that wanders over the edge is a unit you cannot tap where it
    // lives and can tap where it does not
    const atSettlement = s.settlements.some(st => st.tile === u.tile)
    const nudge = atSettlement ? UNITS.settlementNudge : [0, 0]
    const x = cx + clamp((k % 3 - 1) * UNITS.stackSpacing + nudge[0], UNITS.stackReach)
    const z = cz + clamp((Math.floor(k / 3) - 0.5) * UNITS.stackSpacing + nudge[1], UNITS.stackReach)
    positions.set(u.id, [x, z])
    const piece = pieceFor(u.kind, sheet)
    if (piece) { drawn.push({ unit: u, x, z, piece }); continue }
    const f = formOf(u.kind)
    if (!byForm.has(f)) byForm.set(f, [])
    byForm.get(f)!.push({ unit: u, x, z })
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color()
  const mat = surfaceMaterial(light, 1)
  // the billboards cannot be depth sorted against a form, so they are drawn before everything
  // transparent. A built form standing in a settlement has to come after them
  mat.transparent = true
  mat.depthWrite = true
  group.renderOrder = 2
  const occluders: Occluder[] = []

  const ownerColour = (u: Unit): RGB => {
    const company = u.kind === 'regulars' || u.kind === 'horse' || u.kind === 'siegeTrain' || u.kind === 'damagedSiegeTrain' || u.kind === 'companyShip'
    if (company) return [0.16, 0.14, 0.16]
    if (u.kind === 'raider' && !u.flagged) return [0.3, 0.3, 0.3]
    return u.owner === 0 ? hex(s.charters[0].colour) : hex(s.charters[u.owner]?.colour ?? '#444444')
  }

  // ---- the built forms, for every kind the sheet has no drawing of ------------------------------
  for (const [f, list] of byForm) {
    const mesh = new THREE.InstancedMesh(geometryFor(f), mat, list.length)
    list.forEach((e, i) => {
      const y = f === 'hull' ? UNITS.lift * 0.8 : heightAt(e.x, e.z) + UNITS.lift
      p.set(e.x, y, e.z)
      q.identity()
      sc.set(1, 1, 1)
      m.compose(p, q, sc)
      mesh.setMatrixAt(i, m)
      const oc = ownerColour(e.unit)
      col.setRGB(oc[0], oc[1], oc[2])
      mesh.setColorAt(i, col)
      occluders.push({ x: e.x, z: e.z, height: 0.1, radius: 0.13 })
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)
  }

  // ---- the drawn figures: a billboard each, a ring under it, and a mark for when it is too far ---
  const billboards: Billboard[] = []
  if (drawn.length) {
    // the ring goes under the feet, so it is drawn before the figures and does not write depth. A
    // ring over the boots reads as a hoop the person is standing in rather than as a mark on the
    // ground. It does keep its depth test, unlike the figures: it lies on the ground, so a tree
    // standing between it and the camera should cover it, and without the test it painted over the
    // foliage in front of it and read as a decal
    const ringMat = surfaceMaterial(light, 1, false, 0xffffff, UNIT_SPRITE.ring.opacity)
    ringMat.depthWrite = false
    const rings = new THREE.InstancedMesh(ringGeometry(), ringMat, drawn.length)
    rings.renderOrder = -2
    const marks = new THREE.InstancedMesh(geometryFor('disc'), mat, drawn.length)
    const tint = new THREE.Color(1, 1, 1)
    drawn.forEach((e, i) => {
      const y = heightAt(e.x, e.z)
      // against the reference rather than to a fixed height, so a piece drawn shorter than the
      // figure stands shorter on the ground
      const height = (e.piece.h / UNIT_SPRITE.referenceHeight) * UNIT_SPRITE.tileHeight
      const width = height * (e.piece.w / e.piece.h)
      billboards.push({
        sheet: sheetIndex, piece: e.piece, x: e.x, z: e.z, y, width, height, lift: UNIT_SPRITE.lift, tint,
        exposure: UNIT_SPRITE.exposure, sunSide: UNIT_SPRITE.sunSide, probeHeight: UNIT_SPRITE.occluderHeight,
      })
      occluders.push({ x: e.x, z: e.z, height: UNIT_SPRITE.occluderHeight, radius: UNIT_SPRITE.occluderRadius })
      const oc = ownerColour(e.unit)
      col.setRGB(oc[0] * UNIT_SPRITE.ring.strength, oc[1] * UNIT_SPRITE.ring.strength, oc[2] * UNIT_SPRITE.ring.strength)
      q.identity()
      // the ring is a flat disc lying on ground that is not flat, and heightAt snaps to the nearest
      // vertex of a jittered mesh rather than interpolating, so the height at the feet alone puts
      // half the ring inside the hill it is lying on and the depth test drops it. Take the highest
      // ground the ring covers instead
      p.set(e.x, ringHeight(e.x, e.z, heightAt) + UNIT_SPRITE.ring.lift, e.z)
      sc.set(1, 1, 1)
      m.compose(p, q, sc)
      rings.setMatrixAt(i, m)
      rings.setColorAt(i, col)
      p.set(e.x, y + UNITS.lift, e.z)
      sc.set(UNIT_SPRITE.markerScale, 1, UNIT_SPRITE.markerScale)
      m.compose(p, q, sc)
      marks.setMatrixAt(i, m)
      col.setRGB(oc[0], oc[1], oc[2])
      marks.setColorAt(i, col)
    })
    for (const mesh of [rings, marks]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.frustumCulled = false
    }
    close.add(rings)
    far.add(marks)
  }
  return { group, close, far, billboards, positions, occluders }
}

/** The arrival: a lander down and steaming offshore, a boat making for the coast. */
export function buildArrival(s: GameState, site: number | null, progress: number, light: LightUniforms): THREE.Group {
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
  const lander = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8), surfaceMaterial(light, 1, false, 0x2a2a2e))
  lander.position.set(sx, 0.05, sz)
  group.add(lander)
  for (let i = 0; i < 3; i++) {
    const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.2 + i * 0.18, 0.24 + i * 0.2, 0.02, 10), flatMaterial(0xf2ece0))
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
  const boat = new THREE.Mesh(boatGeo, surfaceMaterial(light, 1, false, 0xe9e2cc))
  boat.position.set(bx, 0.04, bz)
  boat.rotation.y = -Math.atan2(tz - sz, tx - sx)
  group.add(boat)
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), flatMaterial(0xd9e6e3))
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
  // over everything, including the billboards, because a selection has to be visible wherever it
  // lands
  const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthTest: false }))
  ring.renderOrder = 10
  ring.visible = false
  return ring
}
