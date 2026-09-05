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
    pieces[key] = { x: p.x as number, y: p.y as number, w: p.w as number, h: p.h as number, anchorX: p.anchorX as number, anchorY: p.anchorY as number }
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
}

/** A unit quad lying in the ground plane, with v running up the screen so the top of a drawing is
 *  the far side of it. */
function quadGeometry(): THREE.BufferGeometry {
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
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vFoot;
varying vec3 vTint;
varying vec4 vStyle;
void main() {
  vUv = vec2(aRect.x + uv.x * aRect.z, aRect.y + uv.y * aRect.w);
  vLocal = uv;
  vFoot = aFoot;
  vStyle = aStyle;
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
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

void main() {
  // both sheets are sampled, so the mip level is chosen outside any branch
  vec4 t0 = texture2D(uSheet0, vUv);
  vec4 t1 = texture2D(uSheet1, vUv);
  vec4 texel = mix(t0, t1, step(0.5, vStyle.w));
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
  vec3 c = texel.rgb * vTint * (lit / norm) * vStyle.x;
  gl_FragColor = vec4(finish(c, vFoot), texel.a);
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
  sorted.forEach((b, i) => {
    const pc = b.piece
    const size = sizes[b.sheet] ?? sizes[0]
    const originX = b.x - (pc.anchorX / pc.w) * b.width
    const originZ = b.z - (pc.anchorY / pc.h) * b.height
    p.set(originX, b.y + b.lift, originZ)
    sc.set(b.width, 1, b.height)
    m.compose(p, q, sc)
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
  })
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4))
  geo.setAttribute('aFoot', new THREE.InstancedBufferAttribute(foot, 3))
  geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(style, 4))
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  return mesh
}
