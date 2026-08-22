// The core technique, art direction brief section 3: a rigid grid, softly rendered. The gameplay
// grid is square and exact; the rendered surface is not. Each tile subdivides into a small grid of
// quads, every vertex is jittered deterministically from the seed, and vertex colours blend across
// tile boundaries. One merged mesh, one draw call, no textures for the look. Shadows and ambient
// occlusion are baked here in rebuild, never per frame.

import * as THREE from 'three'
import { C } from '../sim/constants'
import type { GameState, Tile } from '../sim/state'
import { tileColour, terrainHeight, WATER, DEEP_WATER, SHORE, SNOW, type RGB } from './palette'

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

const TERRAIN_VS = /* glsl */ `
attribute vec3 vcol;
attribute float vao;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAo;
void main() {
  vColor = vcol;
  vNormal = normal;
  vWorld = position;
  vAo = vao;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const TERRAIN_FS = /* glsl */ `
precision highp float;
uniform vec3 sunDir;
uniform float cloudTime;
uniform float cloudScale;
uniform float cloudStrength;
uniform float saturation;
uniform vec3 grade;
uniform sampler2D overlay;
uniform vec2 mapSize;
uniform float overlayMix;
uniform float gridMix;
uniform float selected;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAo;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 n = normalize(vNormal);
  float diff = max(0.0, dot(n, sunDir));
  float back = max(0.0, dot(n, vec3(-sunDir.x, 0.3, -sunDir.z)));
  float light = 0.48 + 0.62 * diff + 0.08 * back;
  vec3 c = vColor * light * vAo;
  float cloud = noise(vWorld.xz * cloudScale + cloudTime * vec2(1.0, 0.4));
  cloud += 0.5 * noise(vWorld.xz * cloudScale * 2.3 + cloudTime * vec2(0.7, 0.9));
  c *= 1.0 - cloudStrength * smoothstep(0.55, 1.05, cloud);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation) + grade;
  // overlays are a temporary recolouring, off by default
  vec2 uv = (vWorld.xz) / mapSize;
  vec4 o = texture2D(overlay, uv);
  c = mix(c, o.rgb, o.a * overlayMix);
  // grid lines appear only on the selected tile
  vec2 cell = fract(vWorld.xz);
  float edge = min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y));
  float isSel = step(0.5, o.a) * gridMix;
  c = mix(c, vec3(1.0, 0.97, 0.85), isSel * (1.0 - smoothstep(0.02, 0.06, edge)) * 0.9);
  gl_FragColor = vec4(c, 1.0);
}`

const WATER_VS = /* glsl */ `
varying vec3 vWorld;
void main() { vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const WATER_FS = /* glsl */ `
precision highp float;
uniform vec3 shallow;
uniform vec3 deep;
uniform vec3 grade;
uniform float saturation;
uniform float cloudTime;
uniform sampler2D depthMap;
uniform vec2 mapSize;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec2 uv = vWorld.xz / mapSize;
  float d = texture2D(depthMap, uv).r;
  vec3 c = mix(shallow, deep, smoothstep(0.05, 0.8, d));
  float ripple = noise(vWorld.xz * 3.0 + cloudTime * vec2(2.0, 1.3)) * 0.5 + noise(vWorld.xz * 7.0 - cloudTime * 1.7) * 0.5;
  c += (ripple - 0.5) * 0.05;
  c += vec3(0.10, 0.09, 0.05) * (1.0 - smoothstep(0.0, 0.18, d));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation) + grade * 0.5;
  gl_FragColor = vec4(c, 1.0);
}`

export interface TerrainBuild {
  mesh: THREE.Mesh
  water: THREE.Mesh
  material: THREE.ShaderMaterial
  waterMaterial: THREE.ShaderMaterial
  overlay: THREE.DataTexture
  heightAt: (x: number, z: number) => number
}

/** Season grade: four recolourings a year, art brief section 8. */
export function seasonUniforms(season: number): { saturation: number; grade: THREE.Vector3; sun: THREE.Vector3 } {
  const hue = C.art.seasonHueShift[season]
  const sat = C.art.seasonSaturation[season]
  const grade = new THREE.Vector3(hue * 0.5 + (season === 3 ? 0.03 : 0), hue * 0.2, -hue * 0.6 + (season === 3 ? 0.02 : 0))
  // the sun's angle changes across the year
  const el = C.art.sunElevation + (season === 1 ? 0.18 : season === 3 ? -0.12 : 0)
  const az = -0.9 + season * 0.25
  const sun = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize()
  return { saturation: sat, grade, sun }
}

export function buildTerrain(s: GameState, seedNum: number): TerrainBuild {
  const w = s.world.width, h = s.world.height, tiles = s.world.tiles
  const S = C.art.subdivisions
  const gw = w * S + 1, gh = h * S + 1
  const N = gw * gh
  const positions = new Float32Array(N * 3)
  const colours = new Float32Array(N * 3)
  const ao = new Float32Array(N)
  const cell = 1 / S
  const jitter = C.art.jitter * cell
  const blendR = C.art.blendRadius

  const tileAt = (x: number, z: number): Tile | null => {
    if (x < 0 || z < 0 || x >= w || z >= h) return null
    return tiles[z * w + x]
  }
  // distance to water per tile, for the shore band and the water depth map
  const shoreDist = new Float32Array(w * h).fill(99)
  const queue: number[] = []
  for (let i = 0; i < w * h; i++) if (tiles[i].terrain === 'water') { shoreDist[i] = 0; queue.push(i) }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi], x = i % w, z = Math.floor(i / w)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
      const n = nz * w + nx
      if (shoreDist[n] > shoreDist[i] + 1) { shoreDist[n] = shoreDist[i] + 1; queue.push(n) }
    }
  }
  const landDist = new Float32Array(w * h).fill(99)
  const q2: number[] = []
  for (let i = 0; i < w * h; i++) if (tiles[i].terrain !== 'water') { landDist[i] = 0; q2.push(i) }
  for (let qi = 0; qi < q2.length; qi++) {
    const i = q2[qi], x = i % w, z = Math.floor(i / w)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
      const n = nz * w + nx
      if (landDist[n] > landDist[i] + 1) { landDist[n] = landDist[i] + 1; q2.push(n) }
    }
  }

  const heights = new Float32Array(N)
  for (let gz = 0; gz < gh; gz++) for (let gx = 0; gx < gw; gx++) {
    const vi = gz * gw + gx
    let x = gx * cell, z = gz * cell
    const edge = gx === 0 || gz === 0 || gx === gw - 1 || gz === gh - 1
    if (!edge) {
      x += (hash2(gx, gz, seedNum) - 0.5) * 2 * jitter
      z += (hash2(gx + 7919, gz + 104729, seedNum) - 0.5) * 2 * jitter
    }
    // blend terrain height and colour from tiles within the blend radius
    const tx = Math.floor(x), tz = Math.floor(z)
    let hsum = 0, wsum = 0
    let r = 0, g = 0, b = 0
    let waterW = 0
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(tx + dx, tz + dz)
      if (!t) continue
      const cxT = tx + dx + 0.5, czT = tz + dz + 0.5
      const d = Math.hypot(x - cxT, z - czT)
      const wgt = Math.max(0, 1 - d / (blendR + 0.5))
      if (wgt <= 0) continue
      const ww = wgt * wgt
      hsum += terrainHeight(t) * ww
      const c = tileColour(t)
      r += c[0] * ww; g += c[1] * ww; b += c[2] * ww
      if (t.terrain === 'water') waterW += ww
      wsum += ww
    }
    if (wsum > 0) { hsum /= wsum; r /= wsum; g /= wsum; b /= wsum; waterW /= wsum }
    const here = tileAt(tx, tz)
    // roughness: mountains are broken, grassland is smooth
    const rough = here ? (here.terrain === 'mountain' ? 0.22 : here.terrain === 'highland' ? 0.1 : here.terrain === 'water' ? 0.02 : 0.035) : 0
    const nz1 = hash2(gx * 3 + 1, gz * 3 + 2, seedNum + 11) - 0.5
    const nz2 = hash2(gx + 31, gz + 17, seedNum + 23) - 0.5
    let y = hsum + nz1 * rough + nz2 * rough * 0.5
    // shoreline: desaturate into wet ground and pull the surface down at the waterline
    const sd = here ? shoreDist[tz * w + tx] : 0
    if (here && here.terrain !== 'water' && sd <= 1) {
      const k = C.art.shoreBand * (1 - Math.min(1, d2(x, z, tx, tz, tiles, w, h)))
      r = r * (1 - k) + SHORE[0] * k; g = g * (1 - k) + SHORE[1] * k; b = b * (1 - k) + SHORE[2] * k
    }
    if (here && here.terrain === 'water') {
      const ld = landDist[tz * w + tx]
      y = -0.12 - Math.min(0.5, ld * 0.12)
      const k = Math.min(1, ld / 3)
      r = WATER[0] * (1 - k) + DEEP_WATER[0] * k; g = WATER[1] * (1 - k) + DEEP_WATER[1] * k; b = WATER[2] * (1 - k) + DEEP_WATER[2] * k
    } else if (waterW > 0.3) {
      y = Math.min(y, 0.03 + (1 - waterW) * 0.05)
    }
    // snow on the highest ground
    if (here && here.terrain === 'mountain' && y > 0.98) { const k = Math.min(1, (y - 0.98) * 6); r = r * (1 - k) + SNOW[0] * k; g = g * (1 - k) + SNOW[1] * k; b = b * (1 - k) + SNOW[2] * k }
    heights[vi] = y
    positions[vi * 3] = x; positions[vi * 3 + 1] = y; positions[vi * 3 + 2] = z
    colours[vi * 3] = r; colours[vi * 3 + 1] = g; colours[vi * 3 + 2] = b
  }
  // baked ambient occlusion: a vertex below the average of its neighbours sits in a hollow
  for (let gz = 0; gz < gh; gz++) for (let gx = 0; gx < gw; gx++) {
    const vi = gz * gw + gx
    let sum = 0, n = 0
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = gx + dx, nz = gz + dz
      if (nx < 0 || nz < 0 || nx >= gw || nz >= gh) continue
      sum += heights[nz * gw + nx]; n++
    }
    const avg = sum / n
    ao[vi] = Math.max(0.6, Math.min(1.05, 1 - (avg - heights[vi]) * 1.6))
  }
  const index = new Uint32Array(w * S * h * S * 6)
  let k = 0
  for (let gz = 0; gz < gh - 1; gz++) for (let gx = 0; gx < gw - 1; gx++) {
    const a = gz * gw + gx, b = a + 1, c = a + gw, d = c + 1
    // alternate the diagonal for a less regular surface
    if (((gx + gz) & 1) === 0) { index[k++] = a; index[k++] = c; index[k++] = b; index[k++] = b; index[k++] = c; index[k++] = d }
    else { index[k++] = a; index[k++] = c; index[k++] = d; index[k++] = a; index[k++] = d; index[k++] = b }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('vcol', new THREE.BufferAttribute(colours, 3))
  geo.setAttribute('vao', new THREE.BufferAttribute(ao, 1))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeVertexNormals()

  const overlay = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h, THREE.RGBAFormat)
  overlay.magFilter = THREE.NearestFilter
  overlay.minFilter = THREE.NearestFilter
  overlay.needsUpdate = true

  const su = seasonUniforms(0)
  const material = new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VS,
    fragmentShader: TERRAIN_FS,
    uniforms: {
      sunDir: { value: su.sun },
      cloudTime: { value: 0 },
      cloudScale: { value: C.art.cloudScale },
      cloudStrength: { value: C.art.cloudStrength },
      saturation: { value: su.saturation },
      grade: { value: su.grade },
      overlay: { value: overlay },
      mapSize: { value: new THREE.Vector2(w, h) },
      overlayMix: { value: 1 },
      gridMix: { value: 1 },
      selected: { value: -1 },
    },
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false

  // water plane at sea level with a depth map, one draw call
  const depth = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const d = Math.min(255, Math.round(Math.min(1, landDist[i] / 4) * 255))
    depth[i * 4] = d; depth[i * 4 + 1] = d; depth[i * 4 + 2] = d; depth[i * 4 + 3] = 255
  }
  const depthMap = new THREE.DataTexture(depth, w, h, THREE.RGBAFormat)
  depthMap.magFilter = THREE.LinearFilter
  depthMap.minFilter = THREE.LinearFilter
  depthMap.needsUpdate = true
  const waterMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VS,
    fragmentShader: WATER_FS,
    uniforms: {
      shallow: { value: new THREE.Vector3(...WATER) },
      deep: { value: new THREE.Vector3(...DEEP_WATER) },
      grade: { value: su.grade },
      saturation: { value: su.saturation },
      cloudTime: { value: 0 },
      depthMap: { value: depthMap },
      mapSize: { value: new THREE.Vector2(w, h) },
    },
  })
  const wgeo = new THREE.PlaneGeometry(w + 40, h + 40, 1, 1)
  wgeo.rotateX(-Math.PI / 2)
  wgeo.translate(w / 2, 0, h / 2)
  const water = new THREE.Mesh(wgeo, waterMaterial)
  water.frustumCulled = false
  water.renderOrder = -1

  const heightAt = (x: number, z: number) => {
    const gx = Math.max(0, Math.min(gw - 1, Math.round(x * S))), gz = Math.max(0, Math.min(gh - 1, Math.round(z * S)))
    return heights[gz * gw + gx]
  }
  return { mesh, water, material, waterMaterial, overlay, heightAt }
}

/** Distance from a point to the nearest water tile edge, in tiles, approximated. */
function d2(x: number, z: number, tx: number, tz: number, tiles: Tile[], w: number, h: number): number {
  let best = 9
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const nx = tx + dx, nz = tz + dz
    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
    if (tiles[nz * w + nx].terrain !== 'water') continue
    // distance to that tile's square
    const ddx = Math.max(nx - x, 0, x - (nx + 1)), ddz = Math.max(nz - z, 0, z - (nz + 1))
    best = Math.min(best, Math.hypot(ddx, ddz))
  }
  return best
}

export function setOverlayTile(tex: THREE.DataTexture, w: number, i: number, rgb: RGB, alpha: number) {
  const d = tex.image.data as Uint8Array
  d[i * 4] = Math.round(rgb[0] * 255); d[i * 4 + 1] = Math.round(rgb[1] * 255); d[i * 4 + 2] = Math.round(rgb[2] * 255); d[i * 4 + 3] = Math.round(alpha * 255)
  tex.needsUpdate = true
}
export function clearOverlay(tex: THREE.DataTexture) {
  ;(tex.image.data as Uint8Array).fill(0)
  tex.needsUpdate = true
}
