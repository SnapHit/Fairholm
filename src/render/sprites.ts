// The early era, drawn rather than built.
//
// Art direction brief section 6 says a settlement is a kit of roofs, and for worked stone and for
// brick that is still true: those are built from the forms in settlements.ts. The first era is not.
// It is seven timber buildings drawn as pictures, packed into one sheet, and a settlement is
// composed from them the way a village is composed from buildings: a couple of them when two people
// live there, all seven by the time twelve do, standing on a lattice that is deterministic from the
// settlement's own id so that the same place is the same place every time it is drawn.
//
// The camera looks straight down and never turns, so a screen-aligned billboard is simply a quad
// lying in the ground plane. There is no orientation to work out per frame and no rotation to
// follow: one instanced mesh, one quad, a rectangle of the sheet per instance.
//
// What has to be got right is the order. These overlap, so they are drawn back to front down the
// screen, which with this camera means in order of world z. Instances of an instanced mesh draw in
// index order, so the sort happens once when the settlements are built and never again.
//
// The sheet is drawn already lit, from the upper left. Rather than light it a second time, the map's
// light is applied to it as a colour and a depth: full sun leaves it as drawn, a cast shadow or a
// cloud takes it down and turns it cold, and the season tints it. The scene's sun was turned round
// to agree with the sheet rather than the sheet repainted to agree with the sun; see DECISIONS.md.
//
// Every number and colour comes from src/render/look.ts.

import * as THREE from 'three'
import { LIGHT_GLSL, type LightUniforms } from './shading'
import { SPRITE, LIGHT, CLOUD } from './look'
import { ATLAS_PIECES, ATLAS_SIZE, type AtlasPiece } from './settlement-atlas'

// ---- the sheet ------------------------------------------------------------------------------------

let cached: THREE.IUniform | null = null

/** The sheet, as a shared uniform holding a clear stand-in until it arrives. Nothing waits on it:
 *  the layout is known from the table in settlement-atlas.ts, so the geometry is right from the
 *  first frame and the picture appears when it lands. */
export function settlementAtlas(onArrive?: () => void): THREE.IUniform {
  if (cached) return cached
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  blank.needsUpdate = true
  cached = { value: blank }
  new THREE.TextureLoader().load(
    'textures/settlement-early.png',
    (tex) => {
      // no colour space conversion: every other shader on the map writes its colours straight out
      // in display space, and a sheet decoded to linear here comes out of the far end nearly black
      tex.colorSpace = THREE.NoColorSpace
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.magFilter = THREE.LinearFilter
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.generateMipmaps = true
      tex.anisotropy = 4
      tex.needsUpdate = true
      cached!.value = tex
      if (onArrive) onArrive()
    },
    undefined,
    () => { /* a sheet that will not load costs the early era its picture and nothing else */ },
  )
  return cached
}

// ---- the quad -------------------------------------------------------------------------------------

/** A unit quad lying in the ground plane, with v running up the screen so the top of a drawing is
 *  the far side of it. */
function quadGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
}

const SPRITE_VS = /* glsl */ `
attribute vec4 aRect;
attribute vec3 aFoot;
varying vec2 vUv;
varying vec3 vFoot;
varying vec3 vTint;
void main() {
  vUv = vec2(aRect.x + uv.x * aRect.z, aRect.y + uv.y * aRect.w);
  vFoot = aFoot;
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const SPRITE_FS = /* glsl */ `
precision highp float;
${LIGHT_GLSL}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vFoot;
varying vec3 vTint;

void main() {
  vec4 texel = texture2D(uAtlas, vUv);
  if (texel.a < 0.03) discard;
  // the light at the building's foot, not per fragment: a picture of a building is not a surface,
  // and one shadow across the whole of it is what a building in shade actually looks like. The
  // sample is taken toward the sun by the building's own height over the tangent of the sun, or
  // every building stands in the shadow it is itself casting and the whole place goes dark
  vec3 probe = vFoot + uSunHoriz * (${SPRITE.occluderHeight.toFixed(3)} * uSunLift);
  float sh = 1.0 - (1.0 - sunReach(probe)) * uShadowStrength;
  sh *= 1.0 - cloudShadow(vFoot) * ${CLOUD.strength.toFixed(3)};
  float diff = pow(max(0.0, uSunDir.y * (1.0 - ${LIGHT.wrap.toFixed(3)}) + ${LIGHT.wrap.toFixed(3)}), ${LIGHT.diffuseGamma.toFixed(2)});
  vec3 key = uKeyColour * uKeyStrength * diff;
  vec3 lit = key * sh + mix(uShadowColour, uAmbientColour, sh) * uAmbientStrength;
  // normalised on what full sun comes to, so the drawing keeps its own values in the open and only
  // loses them where the map says the light has gone
  vec3 full = key + uAmbientColour * uAmbientStrength;
  float norm = max(0.001, dot(full, vec3(0.2126, 0.7152, 0.0722)));
  vec3 c = texel.rgb * vTint * (lit / norm) * ${SPRITE.exposure.toFixed(3)};
  gl_FragColor = vec4(finish(c, vFoot), texel.a);
}
`

export interface SpritePlacement {
  /** Which drawing. */
  piece: AtlasPiece
  /** Where the building meets the ground, in tiles. */
  x: number
  z: number
  y: number
  /** Timber weathers: a small wander in hue and value. */
  tint: THREE.Color
}

/** How many buildings a place of this many people has standing. */
export function pieceCount(pop: number): number {
  const span = Math.max(1, SPRITE.allByPop - SPRITE.fromPop)
  const grown = (pop - SPRITE.fromPop) / span
  const base = Math.round(2 + grown * (ATLAS_PIECES.length - 2))
  const extra = Math.min(SPRITE.maxExtra, Math.max(0, Math.floor((pop - SPRITE.allByPop) / SPRITE.extraPer)))
  return Math.max(2, Math.min(ATLAS_PIECES.length + extra, base + extra))
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

/** The buildings of one settlement, laid out from its id so the place never reshuffles. Larger
 *  places stand further out, which is how a settlement grows past the tile it is counted on. */
export function layOut(id: number, pop: number, cx: number, cz: number, heightAt: (x: number, z: number) => number): SpritePlacement[] {
  const n = pieceCount(pop)
  const grown = Math.max(0, Math.min(1, (n - 2) / Math.max(1, ATLAS_PIECES.length - 2)))
  const spread = SPRITE.spreadFrom + grown * (SPRITE.spreadTo - SPRITE.spreadFrom)
  // a deterministic shuffle, so which buildings a place has is its own and does not follow its size
  const order = ATLAS_PIECES.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(hash(id * 7919 + i, 41) * (i + 1))
    const t = order[i]; order[i] = order[j]; order[j] = t
  }
  const out: SpritePlacement[] = []
  const colour = new THREE.Color()
  for (let k = 0; k < n; k++) {
    const piece = ATLAS_PIECES[order[k % order.length]]
    // rings: one building in the middle, the rest around it, the ring growing as the place does
    const ring = k === 0 ? 0 : Math.ceil(k / 4)
    const inRing = ring === 0 ? 1 : Math.min(4 + (ring - 1) * 3, n)
    const index = ring === 0 ? 0 : (k - 1) % inRing
    const angle = (index / inRing) * Math.PI * 2 + hash(id, ring * 3 + 1) * Math.PI * 2
    const radius = ring === 0 ? 0 : spread * (ring / Math.max(1, Math.ceil((n - 1) / 4)))
    const jx = (hash(id * 31 + k, 2) - 0.5) * spread * SPRITE.jitter
    const jz = (hash(id * 31 + k, 3) - 0.5) * spread * SPRITE.jitter
    const x = cx + Math.cos(angle) * radius + jx
    const z = cz + Math.sin(angle) * radius * 0.85 + jz
    // a tint of one is the drawing as it was drawn, so the wander is around that rather than from it
    const warm = (hash(id * 13 + k, 4) - 0.5) * SPRITE.hueJitter
    const value = 1 + (hash(id * 13 + k, 5) - 0.5) * SPRITE.valueJitter
    colour.setRGB(value * (1 + warm), value, value * (1 - warm))
    out.push({ piece, x, z, y: heightAt(x, z), tint: colour.clone() })
  }
  // back to front down the screen, which with this camera is world z
  out.sort((a, b) => a.z - b.z)
  return out
}

export interface SpriteBuild {
  mesh: THREE.InstancedMesh | null
  material: THREE.ShaderMaterial | null
}

/** One instanced mesh for every early era building on the map. */
export function buildSpriteLayer(places: SpritePlacement[], light: LightUniforms, atlas: THREE.IUniform): SpriteBuild {
  if (!places.length) return { mesh: null, material: null }
  const geo = quadGeometry()
  const rect = new Float32Array(places.length * 4)
  const foot = new Float32Array(places.length * 3)
  const material = new THREE.ShaderMaterial({
    vertexShader: SPRITE_VS,
    fragmentShader: SPRITE_FS,
    uniforms: { ...light, uAtlas: atlas },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geo, material, places.length)
  mesh.frustumCulled = false
  // over the ground and everything standing on it, and under the rings and the units, which are
  // pushed after it. A billboard cannot be depth sorted against a form: it has no depth
  mesh.renderOrder = -1
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3()
  places.forEach((place, i) => {
    const pc = place.piece
    const w = (pc.w / SPRITE.referenceWidth) * SPRITE.tileWidth
    const h = (pc.h / SPRITE.referenceWidth) * SPRITE.tileWidth
    const originX = place.x - (pc.anchorX / pc.w) * w
    const originZ = place.z - (pc.anchorY / pc.h) * h
    p.set(originX, place.y + SPRITE.lift, originZ)
    sc.set(w, 1, h)
    m.compose(p, q, sc)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, place.tint)
    // the sheet's origin is its top left and a texture's is its bottom left
    rect[i * 4] = pc.x / ATLAS_SIZE[0]
    rect[i * 4 + 1] = 1 - (pc.y + pc.h) / ATLAS_SIZE[1]
    rect[i * 4 + 2] = pc.w / ATLAS_SIZE[0]
    rect[i * 4 + 3] = pc.h / ATLAS_SIZE[1]
    foot[i * 3] = place.x
    foot[i * 3 + 1] = place.y
    foot[i * 3 + 2] = place.z
  })
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4))
  geo.setAttribute('aFoot', new THREE.InstancedBufferAttribute(foot, 3))
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  return { mesh, material }
}
