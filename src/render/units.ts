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
//
// A profile is drawn facing left. A unit going right, by the next tile on its path or the place its
// order is taking it, is drawn mirrored; the light stays on the side of the map it comes from. Scale
// is in world terms: a person is a fixed height, and every other piece stands against that by its
// own height in people, which the manifest carries. A damaged battery is the battery darkened,
// drained and knocked askew, not another drawing.

import * as THREE from 'three'
import type { GameState, Unit, UnitKind } from '../sim/state'
import { hex, type RGB } from './palette'
import { UNITS, UNIT_SPRITE, LIGHT, ARRIVAL, hexRgb } from './look'
import { surfaceMaterial, type LightUniforms } from './shading'
import type { Occluder } from './shadow'
import { buildBillboards, quadGeometry, type AtlasManifest, type AtlasPiece, type Billboard } from './billboards'
import { waveCandidates, openWaterNear } from './selectors'
import { C } from '../sim/constants'

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

export function isHull(kind: UnitKind): boolean {
  return kind === 'lighter' || kind === 'trader' || kind === 'raider' || kind === 'cutter' || kind === 'companyShip'
}

export function isDamaged(kind: UnitKind): boolean {
  return kind === 'damagedBattery' || kind === 'damagedSiegeTrain'
}

/** Where a unit is going next, as a tile: the first tile of its path, or the place its order is
 *  taking it. Null when it is standing. Read from the state and nothing else. */
export function nextTileOf(s: GameState, u: Unit): number | null {
  if (u.path.length) return u.path[0]
  const o = u.order
  if (!o) return null
  switch (o.kind) {
    case 'goto': return o.tile
    case 'patrol': return o.tiles[o.next] ?? null
    case 'haul': { const stop = o.stops[o.next]; return stop ? s.settlements[stop.settlement]?.tile ?? null : null }
    case 'improve': return o.tasks[0]?.tile ?? null
    default: return null
  }
}

/** True when a unit is going to the right of where it stands, which is when a profile drawn
 *  facing left is mirrored. A standing unit faces the way it was drawn. */
export function goesRight(s: GameState, u: Unit): boolean {
  const next = nextTileOf(s, u)
  if (next === null || next === u.tile) return false
  const w = s.world.width
  return next % w > u.tile % w
}

/** How large a piece stands on the ground, in tiles: against the person, by the piece's own height
 *  in people, times whatever share a borrowing kind is drawn at. */
export function drawnSize(piece: AtlasPiece, scale = 1): { width: number; height: number } {
  const personPx = piece.personPx ?? UNIT_SPRITE.referenceHeight
  const height = (piece.h / personPx) * UNIT_SPRITE.tileHeight * scale
  return { width: height * (piece.w / piece.h), height }
}

/** A hull on the water: anchored at its waterline rather than its keel, the hull below the line
 *  faded out, riding the water a little as the clock runs, and reading its light at the waterline.
 *  The water is at nought, whatever the bed under it is. */
export function waterBillboard(piece: AtlasPiece, scale: number, x: number, z: number, flip: boolean, sheetIndex: number, tint: THREE.Color): Billboard {
  const { width, height } = drawnSize(piece, scale)
  const line = piece.waterline ?? piece.anchorY
  const anchored: AtlasPiece = { ...piece, anchorY: line }
  return {
    sheet: sheetIndex, piece: anchored, x, z, y: UNITS.lift, width, height, lift: 0, tint,
    exposure: UNIT_SPRITE.exposure, sunSide: UNIT_SPRITE.sunSide, probeHeight: UNIT_SPRITE.shadow.hullHeight,
    flip, desaturate: 0, tilt: 0,
    cut: 1 - line / piece.h,
    bob: ARRIVAL.bob,
  }
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

/** A flat chevron lying on the ground, pointing up the screen: one for a hardened unit beside its
 *  ring, two for a sworn one. Two arms, each a thin quad. */
function chevronGeometry(): THREE.BufferGeometry {
  const c = UNIT_SPRITE.chevron
  const a = c.arm, t = c.thickness
  // the arms meet at the origin and run down and out to either side; wound to face up
  const v = [
    // left arm
    0, 0, -t, -a, 0, a - t, -a, 0, a, 0, 0, 0,
    // right arm
    0, 0, 0, a, 0, a, a, 0, a - t, 0, 0, -t,
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  g.computeVertexNormals()
  return g
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
    // and it reads the light where it lies. Every other surface samples the shadow map a little
    // toward the sun so that a thing standing up does not stand in its own shadow, and the offset
    // is taken from world height because the shader has no other measure of how tall a thing is.
    // A mark lying on the ground is not tall, and on high ground that offset had it reading the
    // light of somewhere over a tile away: it stayed one value while the ground under it changed
    // threefold. Replacing the shared uniform's reference on this material alone leaves every other
    // material pointing at the real one
    ringMat.uniforms.uSunLift = { value: 0 }
    // an unflagged raider carries no mark of whose it is: that is the whole of what unflagged means,
    // rival charters brief section 8. Everything else drawn has its owner's ring
    const marked = drawn.filter(e => !(e.unit.kind === 'raider' && !e.unit.flagged))
    const rings = new THREE.InstancedMesh(ringGeometry(), ringMat, Math.max(1, marked.length))
    rings.count = marked.length
    rings.renderOrder = -2
    // quality beside the ring: one chevron hardened, two sworn, in the ring's colour
    const chevrons = marked.flatMap(e => e.unit.quality === 'raw' ? [] : e.unit.quality === 'hardened' ? [{ e, k: 0 }] : [{ e, k: 0 }, { e, k: 1 }])
    const badges = new THREE.InstancedMesh(chevronGeometry(), ringMat, Math.max(1, chevrons.length))
    badges.count = chevrons.length
    badges.renderOrder = -2
    // a wake behind every hull that is going somewhere
    const moving = drawn.filter(e => isHull(e.unit.kind) && nextTileOf(s, e.unit) !== null && nextTileOf(s, e.unit) !== e.unit.tile)
    const marks = new THREE.InstancedMesh(geometryFor('disc'), mat, drawn.length)
    const plain = new THREE.Color(1, 1, 1)
    const d = UNIT_SPRITE.damaged
    const hurt = new THREE.Color(d.darken, d.darken, d.darken)
    drawn.forEach((e, i) => {
      const y = heightAt(e.x, e.z)
      const scale = UNIT_SPRITE.scale[e.unit.kind] ?? 1
      const { width, height } = drawnSize(e.piece, scale)
      const damaged = isDamaged(e.unit.kind)
      const hull = isHull(e.unit.kind)
      const flip = e.piece.facing === 'left' && goesRight(s, e.unit)
      const sh = UNIT_SPRITE.shadow
      if (hull) billboards.push(waterBillboard(e.piece, scale, e.x, e.z, flip, sheetIndex, plain))
      else {
        // the light is read a little toward the sun, clear of the piece's own shadow, and no further:
        // a ship three people tall read its light from three tiles away, which was the next ship's
        // shadow. A hull lies in the water and reads its light at the waterline
        billboards.push({
          sheet: sheetIndex, piece: e.piece, x: e.x, z: e.z, y, width, height, lift: UNIT_SPRITE.lift,
          tint: damaged ? hurt : plain,
          exposure: UNIT_SPRITE.exposure, sunSide: UNIT_SPRITE.sunSide, probeHeight: Math.min(height, LIGHT.propShadowHeightMax),
          flip,
          desaturate: damaged ? d.desaturate : 0,
          tilt: damaged ? (d.tiltDeg * Math.PI) / 180 : 0,
          cut: 0, bob: 0,
        })
      }
      occluders.push({ x: e.x, z: e.z, height: hull ? sh.hullHeight : height * sh.heightShare, radius: Math.max(sh.minRadius, width * sh.widthShare) })
      const oc = ownerColour(e.unit)
      q.identity()
      // a hull's mark is on the water, which is at nought whatever the bed under it is
      p.set(e.x, hull ? UNITS.lift * 0.8 : y + UNITS.lift, e.z)
      sc.set(UNIT_SPRITE.markerScale, 1, UNIT_SPRITE.markerScale)
      m.compose(p, q, sc)
      marks.setMatrixAt(i, m)
      col.setRGB(oc[0], oc[1], oc[2])
      marks.setColorAt(i, col)
    })
    marked.forEach((e, i) => {
      const oc = ownerColour(e.unit)
      col.setRGB(oc[0] * UNIT_SPRITE.ring.strength, oc[1] * UNIT_SPRITE.ring.strength, oc[2] * UNIT_SPRITE.ring.strength)
      q.identity()
      // the ring is a flat disc lying on ground that is not flat, and heightAt snaps to the nearest
      // vertex of a jittered mesh rather than interpolating, so the height at the feet alone puts
      // half the ring inside the hill it is lying on and the depth test drops it. Take the highest
      // ground the ring covers instead. On the water the ring lies on the water
      const ringY = isHull(e.unit.kind) ? UNIT_SPRITE.ring.lift : ringHeight(e.x, e.z, heightAt) + UNIT_SPRITE.ring.lift
      p.set(e.x, ringY, e.z)
      sc.set(1, 1, 1)
      m.compose(p, q, sc)
      rings.setMatrixAt(i, m)
      rings.setColorAt(i, col)
    })
    chevrons.forEach(({ e, k }, i) => {
      const oc = ownerColour(e.unit)
      col.setRGB(oc[0] * UNIT_SPRITE.ring.strength, oc[1] * UNIT_SPRITE.ring.strength, oc[2] * UNIT_SPRITE.ring.strength)
      const c = UNIT_SPRITE.chevron
      const ringY = isHull(e.unit.kind) ? UNIT_SPRITE.ring.lift : ringHeight(e.x, e.z, heightAt) + UNIT_SPRITE.ring.lift
      // to the right of the ring, the second above the first
      p.set(e.x + UNIT_SPRITE.ring.outer + c.gap, ringY, e.z + c.drop - k * c.stack)
      q.identity()
      sc.set(1, 1, 1)
      m.compose(p, q, sc)
      badges.setMatrixAt(i, m)
      badges.setColorAt(i, col)
    })
    if (moving.length) {
      close.add(buildWakes(moving.map(e => {
        const next = nextTileOf(s, e.unit)!
        return { x: e.x, z: e.z, heading: Math.atan2(Math.floor(next / w) + 0.5 - e.z, (next % w) + 0.5 - e.x) }
      })))
    }
    for (const mesh of [rings, badges, marks]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.frustumCulled = false
    }
    close.add(rings, badges)
    far.add(marks)
  }
  return { group, close, far, billboards, positions, occluders }
}

/** What is on the water that is not a unit. Before the landing: the lander down and steaming
 *  offshore, and the boat making for the coast with a wake, the boat's progress animated once a site
 *  is chosen. After it: the Company's landers while a wave is at sea, steaming on the turn they came
 *  down. Setting brief section 7, onboarding brief section 2, military brief section 10. The pictures
 *  are a billboard layer of their own: they stand on open water, where nothing else drawn stands,
 *  so they need no sorting against the people and the buildings. Null when there is nothing. */
export function buildArrival(
  s: GameState, site: number | null, progress: number, light: LightUniforms,
  sheet: AtlasManifest, sheetIndex: number, sheets: THREE.IUniform[], sizes: [number, number][],
  /** The arrival is drawn before the landing; the gallery asks for it whatever the turn. */
  always = false,
): THREE.Group | null {
  const group = new THREE.Group()
  const w = s.world.width
  const bills: Billboard[] = []
  const steam: [number, number][] = []
  const plain = new THREE.Color(1, 1, 1)
  const lander = sheet.pieces['lander'] ?? null
  const boatPiece = pieceFor('lighter', sheet)

  /** The lander, drawn if the sheet has it and built if not, and where its stacks are. */
  const putLander = (x: number, z: number, steaming: boolean) => {
    if (lander) {
      bills.push(waterBillboard(lander, 1, x, z, false, sheetIndex, plain))
      const { width, height } = drawnSize(lander)
      // the stacks are at the top right of the drawing, and the steam comes off them
      if (steaming) steam.push([x + width * ARRIVAL.plume.stacks[0], z - height * ARRIVAL.plume.stacks[1]])
    } else {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8), surfaceMaterial(light, 1, false, 0x2a2a2e))
      hull.position.set(x, 0.05, z)
      group.add(hull)
      if (steaming) steam.push([x + 0.2, z - 0.1])
    }
  }

  if (s.turn === 0 || always) {
    const home = s.world.landingSites[0] ?? s.charters[0].landing
    const hx = (home % w) + 0.5, hz = Math.floor(home / w) + 0.5
    const [sx, sz] = openWaterNear(s, hx, hz, ARRIVAL.offshoreReach) ?? [hx, hz]
    putLander(sx, sz, true)
    // the boat, with a wake, moving toward the chosen site when one is chosen
    const target = site ?? home
    const tx = (target % w) + 0.5, tz = Math.floor(target / w) + 0.5
    const t = Math.min(1, Math.max(0, progress))
    const k = ARRIVAL.boatStart + (1 - ARRIVAL.boatStart) * t
    const bx = sx + (tx - sx) * k, bz = sz + (tz - sz) * k
    const heading = Math.atan2(tz - sz, tx - sx)
    if (boatPiece) bills.push(waterBillboard(boatPiece, ARRIVAL.boatScale, bx, bz, boatPiece.facing === 'left' && tx > sx, sheetIndex, plain))
    else {
      const boatGeo = new THREE.CylinderGeometry(0.05, 0.12, 0.05, 4)
      boatGeo.rotateY(Math.PI / 4); boatGeo.scale(1.8, 1, 1)
      const boat = new THREE.Mesh(boatGeo, surfaceMaterial(light, 1, false, 0xe9e2cc))
      boat.position.set(bx, 0.04, bz)
      boat.rotation.y = -heading
      group.add(boat)
    }
    group.add(buildWakes([{ x: bx, z: bz, heading }]))
  }

  // the Company's landers: one a wave, down offshore of the middle of the coast it might still land
  // on, which tells you no more than its heading does. Military brief section 10: where it lands is
  // genuinely unknown, so the lander does not stand at the anchorage
  const d = s.declaration
  if (d?.declared) {
    let n = 0
    for (const wave of d.waves) {
      if (wave.landed) continue
      const cands = waveCandidates(s, wave)
      if (!cands.length) continue
      let cx = 0, cz = 0
      for (const a of cands) { cx += (a % w) + 0.5; cz += Math.floor(a / w) + 0.5 }
      cx /= cands.length; cz /= cands.length
      const at = openWaterNear(s, cx + (n % 2 ? 1 : -1) * ARRIVAL.waveSpacing * Math.ceil(n / 2), cz, ARRIVAL.waveOffshore)
      if (!at) continue
      const since = C.military.approachTurns - wave.turnsToLand
      putLander(at[0], at[1], since < ARRIVAL.waveSteamTurns)
      n++
    }
  }

  if (bills.length) {
    const mesh = buildBillboards(bills, light, sheets, sizes)
    if (mesh) { mesh.renderOrder = 0; group.add(mesh) }
  }
  if (steam.length) group.add(buildPlume(steam, light))
  return group.children.length ? group : null
}

const WAKE_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const WAKE_FS = /* glsl */ `
precision highp float;
uniform vec3 uColour;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  // widest and faintest at the tail, narrow and brightest just behind the stern: u runs from the
  // tail at nought to the stern at one, and the streak thins across its width toward either edge
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float width = mix(1.0, 0.35, vUv.x);
  float a = smoothstep(0.0, width, across) * pow(vUv.x, 0.9) * (1.0 - smoothstep(0.85, 1.0, vUv.x)) * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColour, a);
}
`

/** The wake material: a pale streak that thins toward its edges and fades toward its tail. */
function wakeMaterial(): THREE.ShaderMaterial {
  const wk = ARRIVAL.wake
  return new THREE.ShaderMaterial({
    vertexShader: WAKE_VS,
    fragmentShader: WAKE_FS,
    uniforms: { uColour: { value: new THREE.Color(...hexRgb(wk.colour)) }, uOpacity: { value: wk.opacity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** Wakes behind hulls under way: one instanced mesh, each lying back along its hull's heading. */
function buildWakes(at: { x: number; z: number; heading: number }[]): THREE.InstancedMesh {
  const wk = ARRIVAL.wake
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(wk.length, wk.width), wakeMaterial(), at.length)
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1)
  const e = new THREE.Euler()
  at.forEach((w, i) => {
    const back = wk.length * 0.5
    p.set(w.x - Math.cos(w.heading) * back, UNITS.lift * 0.5, w.z - Math.sin(w.heading) * back)
    // the plane lies flat, then turns to lie along the heading, its u running tail to stern
    e.set(-Math.PI / 2, 0, -w.heading, 'ZYX')
    q.setFromEuler(e)
    m.compose(p, q, sc)
    mesh.setMatrixAt(i, m)
  })
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

const PLUME_VS = /* glsl */ `
attribute float aPhase;
uniform float uTime;
varying vec2 vLocal;
varying float vLife;
void main() {
  // each puff lives a few seconds: born at the stack, it rises up the screen and drifts off the
  // wind, growing and thinning as it goes, and is born again
  float t = fract(uTime / ${ARRIVAL.plume.life.toFixed(2)} + aPhase);
  vLife = t;
  vLocal = uv;
  float size = mix(${ARRIVAL.plume.sizeFrom.toFixed(3)}, ${ARRIVAL.plume.sizeTo.toFixed(3)}, t);
  vec3 off = vec3(${ARRIVAL.plume.drift.toFixed(3)} * t + sin(aPhase * 6.28 + t * 4.0) * 0.05, 0.0, -${ARRIVAL.plume.rise.toFixed(3)} * t);
  vec3 local = vec3((uv.x - 0.5) * size, 0.0, (0.5 - uv.y) * size);
  vec4 world = modelMatrix * instanceMatrix * vec4(off + local, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const PLUME_FS = /* glsl */ `
precision highp float;
uniform vec3 uColour;
varying vec2 vLocal;
varying float vLife;
void main() {
  float d = length(vLocal - 0.5) * 2.0;
  float soft = smoothstep(1.0, 0.25, d);
  float a = soft * (1.0 - vLife) * smoothstep(0.0, 0.12, vLife) * ${ARRIVAL.plume.opacity.toFixed(2)};
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColour, a);
}
`

/** Steam off a lander's stacks: a few soft quads lying on the water plane, each on its own phase of
 *  one cycle, so the plume drifts and thins and renews as the clock runs. One draw call however many
 *  landers are steaming, and small overdraw: a handful of quads a third of a tile across. */
function buildPlume(at: [number, number][], light: LightUniforms): THREE.InstancedMesh {
  const per = ARRIVAL.plume.count
  const n = at.length * per
  const geo = quadGeometry()
  const phase = new Float32Array(n)
  const material = new THREE.ShaderMaterial({
    vertexShader: PLUME_VS,
    fragmentShader: PLUME_FS,
    uniforms: { uTime: light.uTime, uColour: { value: new THREE.Color(...hexRgb(ARRIVAL.plume.colour)) } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geo, material, n)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  const m = new THREE.Matrix4()
  at.forEach(([x, z], i) => {
    for (let k = 0; k < per; k++) {
      m.makeTranslation(x, UNITS.lift * 2, z)
      mesh.setMatrixAt(i * per + k, m)
      phase[i * per + k] = (k + 0.37 * i) / per
    }
  })
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
  mesh.instanceMatrix.needsUpdate = true
  return mesh
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
