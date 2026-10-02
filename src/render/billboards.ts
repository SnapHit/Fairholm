// Pictures standing on the map: one instanced layer for everything that is drawn rather than built.
//
// The early era settlements are drawn (sprites.ts) and now so are the people (units.ts). They share
// this layer rather than each having one, for a reason that is not only tidiness: they overlap each
// other. A person walks in front of a barn and behind a longhouse, and a picture has no depth to sort
// against, so the only sort that works is the painter's, back to front down the screen, and that
// sort has to run across every picture on the map at once. One instanced mesh, every billboard in
// it, ordered by world z, drawn in index order.
//
// The camera looks straight down and never turns, so a screen aligned billboard is a quad lying in
// the ground plane. No orientation per frame, no rotation to follow.
//
// Two sheets can be drawn from in the same call: a per instance attribute says which, and both are
// sampled so that the mip level is taken outside any branch. A third sheet is a third sampler and a
// wider attribute, and nothing else.
//
// What the light does to a picture is per instance too. A sheet drawn with its own light in it (the
// buildings) wants the map's light applied as a colour and a depth only, so it keeps its own values
// in the open. A sheet drawn flat (the people) can also take a side: brighter toward the sun,
// darker away from it, as a rough standing form would. Both sample the shadow map toward the sun by
// their own height, so they do not stand in the shadow they are themselves casting.
//
// Every number and colour comes from src/render/look.ts.

import * as THREE from 'three'
import { LIGHT_GLSL, type LightUniforms } from './shading'
import { LIGHT, CLOUD } from './look'

// ---- sheets and their manifests -----------------------------------------------------------------

/** Where one drawing sits in its sheet, in pixels from the top left, and where it meets the ground. */
export interface AtlasPiece {
  x: number
  y: number
  w: number
  h: number
  anchorX: number
  anchorY: number
  /** Which way a profile is drawn looking; absent for a drawing seen from the front. */
  facing?: 'left' | 'right' | 'front'
  /** The row a hull sits in the water on, from the top of the piece, where the piece is a hull. */
  waterline?: number
  /** How many pixels a standing person is in this piece, so that a piece stored at a lower
   *  resolution still stands at its own height on the ground. Absent on a sheet cut before this. */
  personPx?: number
}

/** A sheet as the artist ships it: the image, its size, and the pieces on it by name. Adding a
 *  piece is a change to this and to nothing else. */
export interface AtlasManifest {
  texture: string
  size: [number, number]
  pieces: Record<string, AtlasPiece>
}

/** A manifest as the artist ships it, checked rather than trusted: the sheets are a drop point, and
 *  a malformed one should say so at load rather than draw nothing and say nothing. */
export function manifestFrom(json: unknown, name: string): AtlasManifest {
  const o = json as { texture?: unknown; size?: unknown; pieces?: unknown } | null
  if (!o || typeof o.texture !== 'string' || !Array.isArray(o.size) || o.size.length !== 2 || !o.pieces || typeof o.pieces !== 'object') {
    throw new Error(`${name} is not a sprite sheet manifest`)
  }
  const pieces: Record<string, AtlasPiece> = {}
  for (const [key, raw] of Object.entries(o.pieces as Record<string, unknown>)) {
    const p = raw as Record<string, unknown>
    for (const f of ['x', 'y', 'w', 'h', 'anchorX', 'anchorY']) {
      if (typeof p[f] !== 'number') throw new Error(`${name}: piece ${key} has no ${f}`)
    }
    const piece: AtlasPiece = { x: p.x as number, y: p.y as number, w: p.w as number, h: p.h as number, anchorX: p.anchorX as number, anchorY: p.anchorY as number }
    if (p.facing === 'left' || p.facing === 'right' || p.facing === 'front') piece.facing = p.facing
    if (typeof p.waterline === 'number') piece.waterline = p.waterline
    if (typeof p.personPx === 'number' && p.personPx > 0) piece.personPx = p.personPx
    pieces[key] = piece
  }
  return { texture: o.texture, size: [o.size[0] as number, o.size[1] as number], pieces }
}

const sheets = new Map<string, THREE.IUniform>()

/** A sheet, as a shared uniform holding a clear stand-in until it arrives. Nothing waits on it: the
 *  layout is known from the manifest, so the geometry is right from the first frame and the picture
 *  appears when it lands. Loaded once per page for the life of the page, and after the first frame,
 *  like the audio and the save, per main.ts: a sheet fetched and decoded during the boot is
 *  competition for the frame that has to arrive in about a second. */
export function spriteSheet(manifest: AtlasManifest, onArrive?: () => void): THREE.IUniform {
  const url = `textures/${manifest.texture}`
  const had = sheets.get(url)
  if (had) return had
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  blank.needsUpdate = true
  const uniform: THREE.IUniform = { value: blank }
  sheets.set(url, uniform)
  const start = () => new THREE.TextureLoader().load(
    url,
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
      uniform.value = tex
      if (onArrive) onArrive()
    },
    undefined,
    () => { /* a sheet that will not load costs its pictures and nothing else */ },
  )
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(start))
  else start()
  return uniform
}

// ---- a picture standing somewhere ---------------------------------------------------------------

export interface Billboard {
  /** Which sheet, as an index into the list handed to buildBillboards, and which drawing on it. */
  sheet: number
  piece: AtlasPiece
  /** Where it meets the ground, in tiles, and the ground's height there. */
  x: number
  z: number
  y: number
  /** How large it stands on the ground, in tiles. */
  width: number
  height: number
  /** A hair off the ground, so it is not fighting the terrain for the same depth. */
  lift: number
  /** A tint of one is the drawing as it was drawn. */
  tint: THREE.Color
  /** What full sun does to it, as a multiplier on the drawing. */
  exposure: number
  /** How much brighter its sunward side is than its far side. Zero for a sheet already lit. */
  sunSide: number
  /** How tall it is for the purpose of finding its own light, in tiles. */
  probeHeight: number
  /** Drawn the other way round: a profile drawn facing left that is going right. The flip is in the
   *  picture only; the light still comes from the side of the map it comes from. */
  flip: boolean
  /** How far toward grey the drawing goes, nought to one. A damaged piece loses its colour. */
  desaturate: number
  /** Turned on the ground about its anchor by this many radians: a damaged piece is knocked askew. */
  tilt: number
  /** Where the water is, as a share of the quad from its bottom, nought for none: below this the
   *  drawing fades out, so a hull sits in the water rather than on it. */
  cut: number
  /** How far the picture drifts on the water as the clock runs, in tiles. Nought for a thing on land. */
  bob: number
  /** How much of it is there, nought to one. One unless something is appearing or going: the
   *  settlement the lander founds comes up out of nothing while the lander itself fades on the shore. */
  fade?: number
  /** Drawn through the fog rather than in it: the recall fleet's landers, whose approach is always
   *  visible, military brief section 9. Everything else is in the fog with the ground under it. */
  clear?: boolean
  /** What on the map this picture belongs to, so the scene can find its instances again after the
   *  sort and fade them without rebuilding. */
  tag?: BillboardTag
}

export interface BillboardTag { kind: 'settlement' | 'unit'; id: number }

/** A unit quad lying in the ground plane, with v running up the screen so the top of a drawing is
 *  the far side of it. */
export function quadGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
}

const BILLBOARD_VS = /* glsl */ `
attribute vec4 aRect;
attribute vec3 aFoot;
attribute vec4 aStyle;
attribute vec4 aExtra;
attribute vec2 aFade;
uniform float uTime;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vFoot;
varying vec3 vTint;
varying vec4 vStyle;
varying vec4 vExtra;
varying vec2 vFade;
void main() {
  vFade = aFade;
  // a flipped picture reads its sheet from right to left; the quad itself is not turned, so the
  // side the light falls on stays the side the light comes from
  float u = mix(uv.x, 1.0 - uv.x, aExtra.x);
  vUv = vec2(aRect.x + u * aRect.z, aRect.y + uv.y * aRect.w);
  vLocal = uv;
  vFoot = aFoot;
  vStyle = aStyle;
  vExtra = aExtra;
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  // a thing on the water rides it: a slow drift about where it sits, its own phase from where it is
  float ph = aFoot.x * 3.1 + aFoot.z * 1.7;
  world.xz += vec2(cos(uTime * 0.9 + ph), sin(uTime * 1.3 + ph)) * aExtra.w;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const BILLBOARD_FS = /* glsl */ `
precision highp float;
${LIGHT_GLSL}
uniform sampler2D uSheet0;
uniform sampler2D uSheet1;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vFoot;
varying vec3 vTint;
varying vec4 vStyle;
varying vec4 vExtra;
varying vec2 vFade;

void main() {
  // both sheets are sampled, so the mip level is chosen outside any branch
  vec4 t0 = texture2D(uSheet0, vUv);
  vec4 t1 = texture2D(uSheet1, vUv);
  vec4 texel = mix(t0, t1, step(0.5, vStyle.w));
  // below the waterline the hull is in the water, and goes: a short fade rather than a cut, so the
  // bow and the stern go under the way a hull does
  texel.a *= smoothstep(vExtra.z - 0.07, vExtra.z, vLocal.y);
  // a picture appearing or going is simply less there
  texel.a *= vFade.x;
  if (texel.a < 0.03) discard;
  // the light at the foot, not per fragment: a picture is not a surface, and one shadow across the
  // whole of it is what a thing in shade looks like. The sample is taken toward the sun by the
  // picture's own height over the tangent of the sun, or it stands in the shadow it is itself casting
  vec3 probe = vFoot + uSunHoriz * (vStyle.z * uSunLift);
  float sh = 1.0 - (1.0 - sunReach(probe)) * uShadowStrength;
  sh *= 1.0 - cloudShadow(vFoot) * ${CLOUD.strength.toFixed(3)};
  float diff = pow(max(0.0, uSunDir.y * (1.0 - ${LIGHT.wrap.toFixed(3)}) + ${LIGHT.wrap.toFixed(3)}), ${LIGHT.diffuseGamma.toFixed(2)});
  vec3 key = uKeyColour * uKeyStrength * diff;
  // a standing form is brighter on the side the sun is on. uSunHoriz points toward the sun, and the
  // camera puts world x to the right of the screen, so a fragment on the same side of the drawing's
  // middle as the sun's x is the lit one and the other is the shaded one.
  //
  // The side moves the key and leaves the fill, which is what shade() does with a normal. Scaling
  // the finished colour instead would be a grey multiply: the shaded half of the figure would keep
  // exactly the hue of its lit half while every other surface on the map turns cool going into
  // shadow, and side by side with a timber wall that is what gives a drawing away
  float side = (vLocal.x - 0.5) * 2.0 * uSunHoriz.x * vStyle.y;
  vec3 lit = key * sh * (1.0 + side) + mix(uShadowColour, uAmbientColour, sh) * uAmbientStrength;
  // normalised on what full sun comes to, so the drawing keeps its own values in the open and only
  // loses them where the map says the light has gone
  vec3 full = key + uAmbientColour * uAmbientStrength;
  float norm = max(0.001, dot(full, vec3(0.2126, 0.7152, 0.0722)));
  // a damaged piece drains toward grey before the light is applied, so it still takes the light
  vec3 drawn = mix(texel.rgb, vec3(dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722))), vExtra.y);
  vec3 c = drawn * vTint * (lit / norm) * vStyle.x;
  // a picture in fog is in the fog with the ground it stands on, read at its foot, unless it is one
  // of the few things drawn through the fog
  vec3 col = finish(c, vFoot);
  gl_FragColor = vec4(mix(fogged(col, vFoot), col, vFade.y), texel.a);
}
`

/** Everything drawn rather than built, in one mesh, back to front. Two sheets at most, by index. */
export function buildBillboards(list: Billboard[], light: LightUniforms, sheets: THREE.IUniform[], sizes: [number, number][]): THREE.InstancedMesh | null {
  if (!list.length) return null
  // the sort that makes overlap work: down the screen is world z, and instances draw in index order
  const sorted = list.slice().sort((a, b) => a.z - b.z)
  const geo = quadGeometry()
  const rect = new Float32Array(sorted.length * 4)
  const foot = new Float32Array(sorted.length * 3)
  const style = new Float32Array(sorted.length * 4)
  const extra = new Float32Array(sorted.length * 4)
  const fade = new Float32Array(sorted.length * 2)
  const blank = sheets[0]
  const material = new THREE.ShaderMaterial({
    vertexShader: BILLBOARD_VS,
    fragmentShader: BILLBOARD_FS,
    uniforms: { ...light, uSheet0: sheets[0] ?? blank, uSheet1: sheets[1] ?? sheets[0] ?? blank },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geo, material, sorted.length)
  mesh.frustumCulled = false
  // over the ground and everything standing on it, and under the selection rings, which are pushed
  // after it. A billboard cannot be depth sorted against a form: it has no depth
  mesh.renderOrder = -1
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3()
  const turn = new THREE.Matrix4(), back = new THREE.Matrix4()
  const up = new THREE.Vector3(0, 1, 0)
  sorted.forEach((b, i) => {
    const pc = b.piece
    const size = sizes[b.sheet] ?? sizes[0]
    // a flipped picture's anchor is as far from its right edge as it was from its left
    const anchorX = b.flip ? pc.w - pc.anchorX : pc.anchorX
    const ax = (anchorX / pc.w) * b.width
    const az = (pc.anchorY / pc.h) * b.height
    if (b.tilt) {
      // turned on the ground about the anchor: the quad's corner is moved so the anchor is at the
      // origin, the turn is made there, and the whole thing is set down at the foot
      p.set(b.x, b.y + b.lift, b.z)
      q.setFromAxisAngle(up, b.tilt)
      sc.set(1, 1, 1)
      m.compose(p, q, sc)
      back.makeTranslation(-ax, 0, -az)
      turn.makeScale(b.width, 1, b.height)
      m.multiply(back).multiply(turn)
    } else {
      p.set(b.x - ax, b.y + b.lift, b.z - az)
      q.identity()
      sc.set(b.width, 1, b.height)
      m.compose(p, q, sc)
    }
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, b.tint)
    // the sheet's origin is its top left and a texture's is its bottom left
    rect[i * 4] = pc.x / size[0]
    rect[i * 4 + 1] = 1 - (pc.y + pc.h) / size[1]
    rect[i * 4 + 2] = pc.w / size[0]
    rect[i * 4 + 3] = pc.h / size[1]
    foot[i * 3] = b.x
    foot[i * 3 + 1] = b.y
    foot[i * 3 + 2] = b.z
    style[i * 4] = b.exposure
    style[i * 4 + 1] = b.sunSide
    style[i * 4 + 2] = b.probeHeight
    style[i * 4 + 3] = b.sheet
    extra[i * 4] = b.flip ? 1 : 0
    extra[i * 4 + 1] = b.desaturate
    extra[i * 4 + 2] = b.cut
    extra[i * 4 + 3] = b.bob
    fade[i * 2] = b.fade ?? 1
    fade[i * 2 + 1] = b.clear ? 1 : 0
  })
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4))
  geo.setAttribute('aFoot', new THREE.InstancedBufferAttribute(foot, 3))
  geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(style, 4))
  geo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 4))
  geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 2))
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  // what each instance belongs to, in the sorted order, so a fade can find it again
  mesh.userData.tags = sorted.map(b => b.tag ?? null)
  return mesh
}

/** Stand one picture's foot somewhere else, without rebuilding the layer: its quad moves by the
 *  difference, and its foot, where it reads its light and the fog, moves with it. For a picture
 *  travelling a path. */
export function placeBillboard(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number) {
  const foot = mesh.geometry.getAttribute('aFoot') as THREE.InstancedBufferAttribute | undefined
  if (!foot) return
  const f = foot.array as Float32Array
  const dx = x - f[i * 3], dy = y - f[i * 3 + 1], dz = z - f[i * 3 + 2]
  if (!dx && !dy && !dz) return
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(i, m)
  m.elements[12] += dx; m.elements[13] += dy; m.elements[14] += dz
  mesh.setMatrixAt(i, m)
  f[i * 3] = x; f[i * 3 + 1] = y; f[i * 3 + 2] = z
  mesh.instanceMatrix.needsUpdate = true
  foot.needsUpdate = true
}

/** Set how much of some pictures is there, without rebuilding the layer: for every instance whose
 *  tag the picker answers for, its fade becomes the answer. Nought to one. */
export function setBillboardFade(mesh: THREE.InstancedMesh, pick: (tag: BillboardTag | null) => number | null) {
  const attr = mesh.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute | undefined
  const tags = mesh.userData.tags as (BillboardTag | null)[] | undefined
  if (!attr || !tags) return
  const arr = attr.array as Float32Array
  let changed = false
  for (let i = 0; i < tags.length; i++) {
    const f = pick(tags[i])
    if (f !== null && arr[i * 2] !== f) { arr[i * 2] = f; changed = true }
  }
  if (changed) attr.needsUpdate = true
}
