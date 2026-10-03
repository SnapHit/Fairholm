// The selected unit, unmistakable: feel brief section 3. A ring in its owner's colour lies on the
// ground under it, on a dark halo, and a clean outline runs round its picture, bright inside and
// dark outside, so it reads on every terrain, on the water and in the fog. Both are drawn through
// the fog and over the ground; the ring goes under the pictures, the outline over them, round the
// selected picture only and never across it.
//
// Static once shown. Nothing here animates, so a unit sitting selected costs no frames: the frame
// loop goes idle with it on the screen. The outline's bands are a fixed number of pixels, kept so by
// a zoom handed in on each frame that is drawn anyway.

import * as THREE from 'three'
import { SELECTION, hexRgb } from './look'
import type { AtlasPiece } from './billboards'

/** A picture as the outline needs it: where its box lies on the ground, which drawing and how. */
export interface OutlinedPicture {
  /** The picture's box on the ground, absolute, in tiles: left, top, right, bottom. */
  box: [number, number, number, number]
  piece: AtlasPiece
  sheetSize: [number, number]
  flip: boolean
  /** The share of the drawing, from its top, that the box covers: one on land, the part above the
   *  waterline for a hull. */
  share: number
  /** Where it stands, and how far it drifts on the water, for a hull riding it. */
  foot: [number, number]
  bob: number
}

const OUTLINE_VS = /* glsl */ `
uniform vec4 uBox;
uniform float uPad;
uniform vec2 uFoot;
uniform float uBob;
uniform float uTime;
varying vec2 vLocal;
void main() {
  vec2 lo = uBox.xy - uPad, hi = uBox.zw + uPad;
  vec2 wxz = mix(lo, hi, position.xz);
  vLocal = (wxz - uBox.xy) / max(uBox.zw - uBox.xy, vec2(1e-4));
  // a hull rides the water as its picture does: the same drift, from the same phase
  float ph = uFoot.x * 3.1 + uFoot.y * 1.7;
  wxz += vec2(cos(uTime * 0.9 + ph), sin(uTime * 1.3 + ph)) * uBob;
  gl_Position = projectionMatrix * viewMatrix * vec4(wxz.x, 0.5, wxz.y, 1.0);
}
`

const OUTLINE_FS = /* glsl */ `
precision highp float;
uniform sampler2D uSheet;
uniform vec4 uRect;
uniform float uFlip;
uniform float uShare;
uniform vec2 uStep;
uniform float uInnerPx;
uniform float uOuterPx;
uniform vec3 uInner;
uniform vec3 uOuter;
uniform float uOuterAlpha;
varying vec2 vLocal;
float alphaAt(vec2 l) {
  if (l.x < 0.0 || l.y < 0.0 || l.x > 1.0 || l.y > 1.0) return 0.0;
  float u = mix(l.x, 1.0 - l.x, uFlip);
  // down the box is down the drawing, and the box covers the top uShare of it
  vec2 uv = vec2(uRect.x + u * uRect.z, uRect.y + (1.0 - l.y * uShare) * uRect.w);
  return texture2D(uSheet, uv).a;
}
void main() {
  // the picture itself is drawn by its own layer; this is only the band round it
  if (alphaAt(vLocal) > 0.5) discard;
  float inner = 0.0, outer = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.3926991;
    vec2 d = vec2(cos(a), sin(a)) * uStep;
    inner = max(inner, alphaAt(vLocal + d * uInnerPx));
    outer = max(outer, alphaAt(vLocal + d * uOuterPx));
  }
  if (inner > 0.5) gl_FragColor = vec4(uInner, 1.0);
  else if (outer > 0.5) gl_FragColor = vec4(uOuter, uOuterAlpha);
  else discard;
}
`

function flatRing(inner: number, outer: number, colour: THREE.Color, alpha: number): THREE.Mesh {
  const g = new THREE.RingGeometry(inner, outer, 48)
  g.rotateX(-Math.PI / 2)
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: alpha, depthTest: false, depthWrite: false }))
  return m
}

export class SelectionMark {
  /** The ring and its halo, under the pictures and over the ground and the fog. */
  readonly ring = new THREE.Group()
  /** The outline, over the pictures. */
  readonly outline: THREE.Mesh
  private material: THREE.ShaderMaterial
  private radius = -1
  private colour = ''

  constructor(sheet: THREE.IUniform, time: THREE.IUniform) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0], 3))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    const halo = hexRgb(SELECTION.halo)
    this.material = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VS,
      fragmentShader: OUTLINE_FS,
      uniforms: {
        uSheet: sheet, uTime: time,
        uBox: { value: new THREE.Vector4() }, uPad: { value: 0 }, uFoot: { value: new THREE.Vector2() }, uBob: { value: 0 },
        uRect: { value: new THREE.Vector4() }, uFlip: { value: 0 }, uShare: { value: 1 }, uStep: { value: new THREE.Vector2() },
        uInnerPx: { value: SELECTION.outlinePx }, uOuterPx: { value: SELECTION.outlineHaloPx },
        uInner: { value: new THREE.Color(1, 1, 1) }, uOuter: { value: new THREE.Color(halo[0], halo[1], halo[2]) }, uOuterAlpha: { value: SELECTION.outlineHaloAlpha },
      },
      transparent: true, depthTest: false, depthWrite: false,
    })
    this.outline = new THREE.Mesh(geo, this.material)
    this.outline.frustumCulled = false
    // over every picture, after the billboard layer
    this.outline.renderOrder = 9
    // under the pictures, over everything before them
    this.ring.renderOrder = -1.5
    this.ring.visible = false
    this.outline.visible = false
  }

  /** Put it under a unit and round its picture, or take it away. `zoom` is pixels a tile. */
  show(at: [number, number] | null, colour: string, pic: OutlinedPicture | null, zoom: number, ringWidth: number) {
    if (!at) { this.hide(); return }
    // the ring, sized to the picture
    const r = Math.max(SELECTION.ringMin, Math.min(SELECTION.ringMax, ringWidth * SELECTION.ringShare))
    if (r !== this.radius || colour !== this.colour) {
      for (const c of [...this.ring.children]) { this.ring.remove(c); const m = c as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose() }
      // a material's colour is read as sRGB from a string, as every other colour on the map is
      const h = flatRing(r - SELECTION.haloWidth, r + SELECTION.ringWidth + SELECTION.haloWidth, new THREE.Color(SELECTION.halo), SELECTION.haloAlpha)
      const b = flatRing(r, r + SELECTION.ringWidth, new THREE.Color(colour), 1)
      const own = hexRgb(colour)
      h.renderOrder = -1.6
      b.renderOrder = -1.5
      this.ring.add(h, b)
      this.radius = r
      this.colour = colour
      const own3 = this.material.uniforms.uInner.value as THREE.Color
      own3.setRGB(own[0], own[1], own[2])
    }
    this.ring.position.set(at[0], 0.4, at[1])
    // never smaller on the screen than a thumb's notice, where a unit is a mark at a far zoom
    this.ring.scale.setScalar(Math.max(1, SELECTION.ringMinPx / Math.max(1e-3, r * zoom)))
    this.ring.visible = true
    if (!pic) { this.outline.visible = false; return }
    const u = this.material.uniforms
    const [x0, z0, x1, z1] = pic.box
    ;(u.uBox.value as THREE.Vector4).set(x0, z0, x1, z1)
    u.uPad.value = (SELECTION.outlineHaloPx + 1) / Math.max(1, zoom)
    ;(u.uFoot.value as THREE.Vector2).set(pic.foot[0], pic.foot[1])
    u.uBob.value = pic.bob
    const pc = pic.piece, size = pic.sheetSize
    ;(u.uRect.value as THREE.Vector4).set(pc.x / size[0], 1 - (pc.y + pc.h) / size[1], pc.w / size[0], pc.h / size[1])
    u.uFlip.value = pic.flip ? 1 : 0
    u.uShare.value = pic.share
    // how far one pixel on the screen is across the box, as a share of it
    ;(u.uStep.value as THREE.Vector2).set(1 / Math.max(1e-4, (x1 - x0) * zoom), 1 / Math.max(1e-4, (z1 - z0) * zoom))
    this.outline.visible = true
  }

  hide() {
    this.ring.visible = false
    this.outline.visible = false
  }
}
