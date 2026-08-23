// The core technique, art direction brief section 3: a rigid grid, softly rendered. The gameplay grid
// is square and exact; the rendered surface is not. Each tile subdivides into a grid of quads, every
// vertex is jittered deterministically from the seed, and vertex colours blend across tile boundaries.
// One merged mesh, one draw call.
//
// What this file adds beyond that: real elevation, so the ground has slopes for a low sun to rake
// across; ambient occlusion baked into the vertex colours at generation; a baked shadow map sampled
// per fragment; two tiling detail textures that give the surface tooth and bend its normal; and a
// season that is a whole palette rather than a tint, re-baked into the vertex colours when it turns.
//
// Shading is flat throughout, taken from the screen-space derivative of the world position. That gives
// exact per-face normals on an indexed mesh without tripling its vertex count.
//
// Every colour and magnitude comes from src/render/look.ts.

import * as THREE from 'three'
import type { GameState, Tile, TerrainId } from '../sim/state'
import { tileColour, terrainHeight, waterColours, shoreColour, snowColour, type RGB } from './palette'
import { seasonLook, hexRgb, SURFACE, SHADOW, LIGHT, CLOUD, PROPS } from './look'
import { LIGHT_GLSL, type LightUniforms } from './shading'
import type { DetailTextures } from './textures'
import { groundCover } from './props'

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise for the rolling landform under everything. */
function vnoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z)
  const fx = smooth(x - x0), fz = smooth(z - z0)
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed)
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed)
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
}

/** The large scale of the three: gentle country under the tile heights, so flat ground is not a plane. */
function landform(x: number, z: number, seed: number): number {
  const L = SURFACE.landform
  const broad = vnoise(x * L.scale * 10, z * L.scale * 10, seed) - 0.5
  const mid = vnoise(x * L.detailScale * 10, z * L.detailScale * 10, seed + 613) - 0.5
  return broad * L.amplitude + mid * L.detail
}

const TERRAIN_VS = /* glsl */ `
attribute vec3 vcol;
attribute vec4 vcover;
attribute float vao;
attribute float vrock;
varying vec3 vColour;
varying vec4 vCover;
varying vec3 vNormal2;
varying vec3 vWorld;
varying float vAo;
varying float vRock;
void main() {
  vColour = vcol;
  vCover = vcover;
  vNormal2 = normal;
  vWorld = position;
  vAo = vao;
  vRock = vrock;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const TERRAIN_FS = /* glsl */ `
precision highp float;
${LIGHT_GLSL}
uniform sampler2D uGrain;
uniform sampler2D uRock;
uniform float uGrainStrength;
uniform float uRockStrength;
uniform sampler2D overlay;
uniform float overlayMix;
uniform float gridMix;
uniform float selected;
uniform float uCover;
varying vec3 vColour;
varying vec4 vCover;
varying vec3 vNormal2;
varying vec3 vWorld;
varying float vAo;
varying float vRock;

void main() {
  vec3 n = facetNormal(vWorld, vNormal2);

  // the tooth: one fine grain everywhere, a coarser rock where the ground is stone. It darkens the
  // colour a little and bends the normal a lot, which is what makes it catch a raking light
  vec2 guv = vWorld.xz * ${SURFACE.grainRepeat.toFixed(3)};
  vec2 ruv = vWorld.xz * ${SURFACE.rockRepeat.toFixed(3)};
  float g0 = texture2D(uGrain, guv).r;
  float gx = texture2D(uGrain, guv + vec2(0.0039, 0.0)).r;
  float gz = texture2D(uGrain, guv + vec2(0.0, 0.0039)).r;
  float r0 = texture2D(uRock, ruv).r;
  float rx = texture2D(uRock, ruv + vec2(0.0039, 0.0)).r;
  float rz = texture2D(uRock, ruv + vec2(0.0, 0.0039)).r;
  float tooth = mix(g0, r0, vRock);
  float bump = mix(${SURFACE.grainBump.toFixed(3)}, ${SURFACE.rockBump.toFixed(3)}, vRock);
  vec3 slope = vec3(mix(g0 - gx, r0 - rx, vRock), 0.0, mix(g0 - gz, r0 - rz, vRock));
  n = normalize(n + slope * bump);

  float strength = mix(uGrainStrength, uRockStrength, vRock);
  // where the props that stand here are not being drawn, the ground carries their colour instead,
  // so that pulling the camera back changes the level of detail and not the palette
  vec3 base = mix(vColour, vCover.rgb, vCover.a * uCover);
  vec3 albedo = base * (1.0 + (tooth - 0.5) * strength);

  // where the props are culled, the ground reads the light where their tops would have been
  vec3 probe = vWorld + uSunHoriz * (vCover.a * uCover * ${PROPS.coverLift.toFixed(3)} * uSunLift);
  float shadow = sunReach(probe);
  vec3 c = shade(albedo, n, shadow, vAo, cloudShadow(vWorld));
  c = finish(c, vWorld);

  // overlays are a temporary recolouring, off by default
  vec2 uv = vWorld.xz / uMapSize;
  vec4 o = texture2D(overlay, uv);
  c = mix(c, o.rgb, o.a * overlayMix);
  // grid lines appear only on the selected tile
  vec2 cell = fract(vWorld.xz);
  float edge = min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y));
  float here = floor(vWorld.z) * uMapSize.x + floor(vWorld.x);
  float isSel = step(abs(here - selected), 0.5) * gridMix;
  c = mix(c, vec3(1.0, 0.97, 0.85), isSel * (1.0 - smoothstep(0.02, 0.06, edge)) * 0.9);
  gl_FragColor = vec4(c, 1.0);
}`

const WATER_VS = /* glsl */ `
varying vec3 vWorld;
void main() { vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const WATER_FS = /* glsl */ `
precision highp float;
${LIGHT_GLSL}
uniform vec3 shallow;
uniform vec3 deep;
uniform vec3 sky;
uniform sampler2D uRipple;
uniform sampler2D depthMap;
varying vec3 vWorld;

void main() {
  vec2 uv = vWorld.xz / uMapSize;
  float d = texture2D(depthMap, uv).r;
  vec3 base = mix(shallow, deep, smoothstep(0.05, 0.85, d));

  // the surface: two ripple samples drifting against each other, read as a normal
  vec2 a = vWorld.xz * ${SURFACE.rippleRepeat.toFixed(3)} + uCloudTime * vec2(0.6, 0.25);
  vec2 b = vWorld.xz * ${(SURFACE.rippleRepeat * 2.1).toFixed(3)} - uCloudTime * vec2(0.35, 0.55);
  float h0 = texture2D(uRipple, a).r * 0.6 + texture2D(uRipple, b).r * 0.4;
  float hx = texture2D(uRipple, a + vec2(0.006, 0.0)).r * 0.6 + texture2D(uRipple, b + vec2(0.006, 0.0)).r * 0.4;
  float hz = texture2D(uRipple, a + vec2(0.0, 0.006)).r * 0.6 + texture2D(uRipple, b + vec2(0.0, 0.006)).r * 0.4;
  vec3 n = normalize(vec3((h0 - hx) * ${LIGHT.waterRipple.toFixed(2)} * 6.0, 1.0, (h0 - hz) * ${LIGHT.waterRipple.toFixed(2)} * 6.0));

  // the sky is in the water, more of it where it is deep
  vec3 albedo = mix(base, sky, ${LIGHT.waterSkyMix.toFixed(3)} * smoothstep(0.0, 0.6, d));
  float shadow = mix(1.0, sunReach(vWorld), ${LIGHT.waterShadow.toFixed(3)});
  vec3 c = shade(albedo, n, shadow, 1.0, cloudShadow(vWorld));

  // a warm streak of sun on the water, toward the light
  vec3 view = vec3(0.0, 1.0, 0.0);
  vec3 halfv = normalize(uSunDir + view);
  float spec = pow(max(0.0, dot(n, halfv)), ${LIGHT.waterSpecPower.toFixed(1)});
  float toward = smoothstep(-0.2, 0.9, dot(normalize(vec3(n.x, 0.0, n.z) + vec3(0.001)), uSunHoriz));
  float sh = 1.0 - (1.0 - shadow) * uShadowStrength;
  c += uKeyColour * (${LIGHT.waterSpecStrength.toFixed(3)} * spec * (0.35 + 0.65 * toward) * sh);

  // the shallows keep a little warmth off the sand under them
  c += vec3(0.10, 0.09, 0.05) * (1.0 - smoothstep(0.0, 0.2, d));
  gl_FragColor = vec4(finish(c, vWorld), 1.0);
}`

export interface TerrainBuild {
  mesh: THREE.Mesh
  water: THREE.Mesh
  material: THREE.ShaderMaterial
  waterMaterial: THREE.ShaderMaterial
  overlay: THREE.DataTexture
  heightAt: (x: number, z: number) => number
  /** Re-colour the surface for a season. A per-turn bake, never per frame. */
  recolour: (s: GameState, season: number) => void
}

export function buildTerrain(s: GameState, seedNum: number, light: LightUniforms, detail: DetailTextures, season: number): TerrainBuild {
  const w = s.world.width, h = s.world.height, tiles = s.world.tiles
  const S = SURFACE.subdivisions
  const gw = w * S + 1, gh = h * S + 1
  const N = gw * gh
  const positions = new Float32Array(N * 3)
  const colours = new Float32Array(N * 3)
  const cover = new Float32Array(N * 4)
  const ao = new Float32Array(N)
  const rockiness = new Float32Array(N)
  const cell = 1 / S
  const jitter = SURFACE.jitter * cell
  const blendR = SURFACE.blendRadius

  const tileAt = (x: number, z: number): Tile | null => {
    if (x < 0 || z < 0 || x >= w || z >= h) return null
    return tiles[z * w + x]
  }
  const shoreDist = spread(tiles, w, h, t => t.terrain === 'water')
  const landDist = spread(tiles, w, h, t => t.terrain !== 'water')

  const heights = new Float32Array(N)
  const ROCKY: Record<TerrainId, number> = {
    water: 0, marsh: 0.1, grassland: 0.05, plains: 0.08, dry: 0.45,
    downs: 0.2, highland: 0.75, mountain: 1,
  }

  // ---- positions and the height field ------------------------------------------------------------
  const xs = new Float32Array(N), zs = new Float32Array(N)
  for (let gz = 0; gz < gh; gz++) for (let gx = 0; gx < gw; gx++) {
    const vi = gz * gw + gx
    let x = gx * cell, z = gz * cell
    const edge = gx === 0 || gz === 0 || gx === gw - 1 || gz === gh - 1
    if (!edge) {
      x += (hash2(gx, gz, seedNum) - 0.5) * 2 * jitter
      z += (hash2(gx + 7919, gz + 104729, seedNum) - 0.5) * 2 * jitter
    }
    // near the waterline, pull the vertex sideways so the coast is drawn rather than stepped
    {
      const ix = Math.max(0, Math.min(w - 1, Math.floor(x))), iz = Math.max(0, Math.min(h - 1, Math.floor(z)))
      const ti = iz * w + ix
      // distance to the waterline: for land that is the distance to water, for water the distance
      // to land. Taking the smaller of the two is always zero, which warps the whole map instead
      const near = tiles[ti].terrain === 'water' ? landDist[ti] : shoreDist[ti]
      if (near <= 2 && !edge) {
        const k = SURFACE.coastWobble * Math.max(0, 1 - near * 0.5)
        x += (vnoise(x * 0.45, z * 0.45, seedNum + 401) - 0.5) * k
        z += (vnoise(x * 0.45 + 31, z * 0.45 + 17, seedNum + 977) - 0.5) * k
      }
    }
    xs[vi] = x; zs[vi] = z
    const tx = Math.floor(x), tz = Math.floor(z)
    let hsum = 0, wsum = 0, waterW = 0, rock = 0
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(tx + dx, tz + dz)
      if (!t) continue
      const d = Math.hypot(x - (tx + dx + 0.5), z - (tz + dz + 0.5))
      const wgt = Math.max(0, 1 - d / (blendR + 0.5))
      if (wgt <= 0) continue
      const ww = wgt * wgt
      hsum += terrainHeight(t) * ww
      rock += ROCKY[t.terrain] * ww
      if (t.terrain === 'water') waterW += ww
      wsum += ww
    }
    if (wsum > 0) { hsum /= wsum; waterW /= wsum; rock /= wsum }
    const here = tileAt(tx, tz)
    const rough = here ? SURFACE.roughness[here.terrain] : 0
    const n1 = hash2(gx * 3 + 1, gz * 3 + 2, seedNum + 11) - 0.5
    const n2 = hash2(gx + 31, gz + 17, seedNum + 23) - 0.5
    const dry = 1 - waterW
    // the coast is a beach, not a cliff: the drop to the sea bed comes through the blended water
    // weight, so it ramps across the boundary with everything else rather than stepping at it
    let y = hsum + landform(x, z, seedNum) * dry + (n1 * rough + n2 * rough * 0.5) * dry - SURFACE.waterDeepen * waterW * waterW
    // ploughed ground and roads settle what they cross
    if (here && (here.improved || here.road)) y = hsum + (y - hsum) * SURFACE.improvedFlatten
    heights[vi] = y
    rockiness[vi] = Math.min(1, rock + (here && shoreDist[tz * w + tx] <= 1 ? 0.35 : 0))
    positions[vi * 3] = x; positions[vi * 3 + 1] = y; positions[vi * 3 + 2] = z
  }

  // ---- baked ambient occlusion: a vertex below its neighbours sits in a hollow -----------------
  // the local average comes from two one-dimensional passes rather than a square of samples, which
  // is the same number and a great deal less arithmetic
  const R = SHADOW.aoRadius
  const rowAvg = new Float32Array(N)
  for (let gz = 0; gz < gh; gz++) {
    const base = gz * gw
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0, n = 0
      const lo = Math.max(0, gx - R), hi = Math.min(gw - 1, gx + R)
      for (let k = lo; k <= hi; k++) { sum += heights[base + k]; n++ }
      rowAvg[base + gx] = sum / n
    }
  }
  for (let gx = 0; gx < gw; gx++) {
    for (let gz = 0; gz < gh; gz++) {
      let sum = 0, n = 0
      const lo = Math.max(0, gz - R), hi = Math.min(gh - 1, gz + R)
      for (let k = lo; k <= hi; k++) { sum += rowAvg[k * gw + gx]; n++ }
      const avg = sum / n
      const vi = gz * gw + gx
      ao[vi] = Math.max(SHADOW.aoFloor, Math.min(SHADOW.aoCeiling, 1 - (avg - heights[vi]) * SHADOW.aoStrength))
    }
  }

  // ---- colours, which the season re-bakes -------------------------------------------------------
  const paint = (seasonNow: number) => {
    const look = seasonLook(seasonNow)
    const SHORE = shoreColour(seasonNow)
    const SNOW = snowColour(seasonNow)
    const { shallow, deep } = waterColours(seasonNow)
    const snowFrom = look.snowFrom * SURFACE.height.mountain
    for (let vi = 0; vi < N; vi++) {
      const x = xs[vi], z = zs[vi]
      const tx = Math.floor(x), tz = Math.floor(z)
      let r = 0, g = 0, b = 0, wsum = 0, waterW = 0
      let cr = 0, cg = 0, cb = 0, cm = 0
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const t = tileAt(tx + dx, tz + dz)
        if (!t) continue
        const d = Math.hypot(x - (tx + dx + 0.5), z - (tz + dz + 0.5))
        const wgt = Math.max(0, 1 - d / (blendR + 0.5))
        if (wgt <= 0) continue
        const ww = wgt * wgt
        const c = tileColour(t, seasonNow)
        r += c[0] * ww; g += c[1] * ww; b += c[2] * ww
        const cov = groundCover(t, seasonNow)
        cr += cov.colour[0] * ww; cg += cov.colour[1] * ww; cb += cov.colour[2] * ww; cm += cov.mix * ww
        if (t.terrain === 'water') waterW += ww
        wsum += ww
      }
      if (wsum > 0) { r /= wsum; g /= wsum; b /= wsum; waterW /= wsum; cr /= wsum; cg /= wsum; cb /= wsum; cm /= wsum }
      cover[vi * 4] = cr; cover[vi * 4 + 1] = cg; cover[vi * 4 + 2] = cb; cover[vi * 4 + 3] = cm
      const here = tileAt(tx, tz)
      const y = heights[vi]
      // country is not one colour: a broad field of value and warmth and a finer one over it, so
      // open ground has weather in it rather than being one flat green from edge to edge
      if (here && here.terrain !== 'water') {
        const broad = vnoise(x * SURFACE.patchScale, z * SURFACE.patchScale, seedNum + 613) - 0.5
        const warm = vnoise(x * SURFACE.patchScale + 53, z * SURFACE.patchScale + 91, seedNum + 811) - 0.5
        const mote = vnoise(x * SURFACE.moteScale, z * SURFACE.moteScale, seedNum + 227) - 0.5
        const v = 1 + broad * SURFACE.patchValue + mote * SURFACE.moteValue
        const t = warm * SURFACE.patchWarmth
        r *= v * (1 + t); g *= v; b *= v * (1 - t)
      }
      if (here && here.terrain !== 'water' && shoreDist[tz * w + tx] <= 1) {
        const k = SURFACE.shoreBand * (1 - Math.min(1, nearestWater(x, z, tx, tz, tiles, w, h)))
        r = r * (1 - k) + SHORE[0] * k; g = g * (1 - k) + SHORE[1] * k; b = b * (1 - k) + SHORE[2] * k
      }
      if (here && here.terrain === 'water') {
        const k = Math.min(1, landDist[tz * w + tx] / 3)
        r = shallow[0] * (1 - k) + deep[0] * k; g = shallow[1] * (1 - k) + deep[1] * k; b = shallow[2] * (1 - k) + deep[2] * k
      } else if (y > snowFrom) {
        const k = Math.min(1, (y - snowFrom) / Math.max(0.2, SURFACE.height.mountain - snowFrom))
        r = r * (1 - k) + SNOW[0] * k; g = g * (1 - k) + SNOW[1] * k; b = b * (1 - k) + SNOW[2] * k
      }
      colours[vi * 3] = r; colours[vi * 3 + 1] = g; colours[vi * 3 + 2] = b
    }
  }
  paint(season)

  // ---- the mesh ---------------------------------------------------------------------------------
  const index = new Uint32Array(w * S * h * S * 6)
  let k = 0
  for (let gz = 0; gz < gh - 1; gz++) for (let gx = 0; gx < gw - 1; gx++) {
    const a = gz * gw + gx, b = a + 1, c = a + gw, d = c + 1
    // alternate the diagonal for a less regular surface
    if (((gx + gz) & 1) === 0) { index[k++] = a; index[k++] = c; index[k++] = b; index[k++] = b; index[k++] = c; index[k++] = d }
    else { index[k++] = a; index[k++] = c; index[k++] = d; index[k++] = a; index[k++] = d; index[k++] = b }
  }
  const geo = new THREE.BufferGeometry()
  const colourAttr = new THREE.BufferAttribute(colours, 3)
  const coverAttr = new THREE.BufferAttribute(cover, 4)
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('vcol', colourAttr)
  geo.setAttribute('vcover', coverAttr)
  geo.setAttribute('vao', new THREE.BufferAttribute(ao, 1))
  geo.setAttribute('vrock', new THREE.BufferAttribute(rockiness, 1))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeVertexNormals()

  const overlay = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h, THREE.RGBAFormat)
  overlay.magFilter = THREE.NearestFilter
  overlay.minFilter = THREE.NearestFilter
  overlay.needsUpdate = true

  const look = seasonLook(season)
  ;(light.uMapSize.value as THREE.Vector2).set(w, h)
  const material = new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VS,
    fragmentShader: TERRAIN_FS,
    uniforms: {
      ...light,
      uGrain: detail.grain,
      uRock: detail.rock,
      uGrainStrength: { value: look.grainStrength },
      uRockStrength: { value: look.rockStrength },
      overlay: { value: overlay },
      overlayMix: { value: 1 },
      gridMix: { value: 1 },
      selected: { value: -1 },
      uCover: { value: 0 },
    },
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false

  // ---- water: one plane at sea level with a depth map --------------------------------------------
  const depth = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) depth[i] = Math.min(255, Math.round(Math.min(1, landDist[i] / 4) * 255))
  const depthMap = new THREE.DataTexture(depth, w, h, THREE.RedFormat)
  depthMap.magFilter = THREE.LinearFilter
  depthMap.minFilter = THREE.LinearFilter
  depthMap.unpackAlignment = 1
  depthMap.needsUpdate = true
  const wc = waterColours(season)
  const waterMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VS,
    fragmentShader: WATER_FS,
    uniforms: {
      ...light,
      shallow: { value: new THREE.Vector3(...wc.shallow) },
      deep: { value: new THREE.Vector3(...wc.deep) },
      sky: { value: new THREE.Vector3(...wc.sky) },
      uRipple: detail.ripple,
      depthMap: { value: depthMap },
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

  const recolour = (_s: GameState, seasonNow: number) => {
    paint(seasonNow)
    colourAttr.needsUpdate = true
    coverAttr.needsUpdate = true
    const l = seasonLook(seasonNow)
    material.uniforms.uGrainStrength.value = l.grainStrength
    material.uniforms.uRockStrength.value = l.rockStrength
    const c = waterColours(seasonNow)
    ;(waterMaterial.uniforms.shallow.value as THREE.Vector3).set(...c.shallow)
    ;(waterMaterial.uniforms.deep.value as THREE.Vector3).set(...c.deep)
    ;(waterMaterial.uniforms.sky.value as THREE.Vector3).set(...c.sky)
  }

  return { mesh, water, material, waterMaterial, overlay, heightAt, recolour }
}

/** Distance in tiles from every tile to the nearest tile matching a test. */
function spread(tiles: Tile[], w: number, h: number, test: (t: Tile) => boolean): Float32Array {
  const dist = new Float32Array(w * h).fill(99)
  const queue: number[] = []
  for (let i = 0; i < w * h; i++) if (test(tiles[i])) { dist[i] = 0; queue.push(i) }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi], x = i % w, z = Math.floor(i / w)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
      const n = nz * w + nx
      if (dist[n] > dist[i] + 1) { dist[n] = dist[i] + 1; queue.push(n) }
    }
  }
  return dist
}

/** Distance from a point to the nearest water tile's edge, in tiles. */
function nearestWater(x: number, z: number, tx: number, tz: number, tiles: Tile[], w: number, h: number): number {
  let best = 9
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const nx = tx + dx, nz = tz + dz
    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
    if (tiles[nz * w + nx].terrain !== 'water') continue
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

/** Kept for callers that still want the season's grade as a pair of numbers. */
export function seasonUniforms(season: number): { saturation: number; grade: THREE.Vector3; sun: THREE.Vector3 } {
  const look = seasonLook(season)
  const e = (look.elevationDeg * Math.PI) / 180, a = (look.azimuthDeg * Math.PI) / 180
  const key = hexRgb(look.keyColour)
  return {
    saturation: 1,
    grade: new THREE.Vector3(key[0] - 1, key[1] - 1, key[2] - 1).multiplyScalar(0.2),
    sun: new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).normalize(),
  }
}

void CLOUD
