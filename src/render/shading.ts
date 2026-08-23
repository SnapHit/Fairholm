// One light model, shared by the ground, the props, the settlements, the ribbons and the units, so
// that nothing on the map is lit differently from anything else.
//
// The direction, from the art brief section 8 and from what an eye recognises as outdoor light:
// a warm key at a low elevation, a cool fill from the sky, and a cast shadow that takes the key away
// and leaves the fill behind. That is what makes a shadow read as cold and the light as warm.
//
// Everything is flat shaded. The face normal is taken from the screen space derivative of the world
// position rather than from a per-vertex normal, which gives exact per-face normals without tripling
// the vertex count of a merged mesh, and keeps every surface consistent.
//
// Every number and colour here comes from src/render/look.ts.

import * as THREE from 'three'
import { seasonLook, sunVector, hexRgb, LIGHT, CLOUD, SURFACE, SHADOW, type SeasonLook } from './look'

export type LightUniforms = Record<string, THREE.IUniform>

/** One shared set of light uniforms. Every material on the map points at this object, so a season
 *  turns everything at once. */
export function makeLightUniforms(): LightUniforms {
  return {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunHoriz: { value: new THREE.Vector3(1, 0, 0) },
    uKeyColour: { value: new THREE.Color(1, 1, 1) },
    uKeyStrength: { value: 1 },
    uAmbientColour: { value: new THREE.Color(0.5, 0.6, 0.8) },
    uAmbientStrength: { value: 0.35 },
    uShadowColour: { value: new THREE.Color(0.35, 0.45, 0.65) },
    uShadowStrength: { value: 0.6 },
    uRimColour: { value: new THREE.Color(1, 1, 1) },
    uRimStrength: { value: 0.3 },
    uBounceColour: { value: new THREE.Color(...hexRgb(LIGHT.bounceColour)) },
    uContrast: { value: 1.15 },
    uLift: { value: 0 },
    uCloudTime: { value: 0 },
    uShadowMap: { value: null as THREE.Texture | null },
    uMapSize: { value: new THREE.Vector2(1, 1) },
    uSunLift: { value: 1 },
    uFilm: { value: SURFACE.filmStrength },
  }
}

export function applyLook(u: LightUniforms, look: SeasonLook) {
  const sun = sunVector(look)
  ;(u.uSunDir.value as THREE.Vector3).set(sun[0], sun[1], sun[2]).normalize()
  const hl = Math.hypot(sun[0], sun[2]) || 1
  ;(u.uSunHoriz.value as THREE.Vector3).set(sun[0] / hl, 0, sun[2] / hl)
  ;(u.uKeyColour.value as THREE.Color).setRGB(...hexRgb(look.keyColour))
  u.uKeyStrength.value = look.keyStrength
  ;(u.uAmbientColour.value as THREE.Color).setRGB(...hexRgb(look.ambientColour))
  u.uAmbientStrength.value = look.ambientStrength
  ;(u.uShadowColour.value as THREE.Color).setRGB(...hexRgb(look.shadowColour))
  u.uShadowStrength.value = look.shadowStrength
  ;(u.uRimColour.value as THREE.Color).setRGB(...hexRgb(look.rimColour))
  u.uRimStrength.value = look.rimStrength
  u.uContrast.value = look.contrast
  u.uLift.value = look.lift
  // how far toward the sun a point standing this high above the ground has to look to find its own
  // light: its height over the tangent of the sun's elevation, capped so it does not read the
  // shadow of somewhere else entirely
  const tanE = Math.max(0.08, sun[1] / hl)
  u.uSunLift.value = Math.min(LIGHT.propShadowLiftMax, LIGHT.propShadowLift / tanE)
}

/** Declarations and the light itself. Included by every fragment shader on the map. */
export const LIGHT_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunHoriz;
uniform vec3 uKeyColour;
uniform float uKeyStrength;
uniform vec3 uAmbientColour;
uniform float uAmbientStrength;
uniform vec3 uShadowColour;
uniform float uShadowStrength;
uniform vec3 uRimColour;
uniform float uRimStrength;
uniform vec3 uBounceColour;
uniform float uContrast;
uniform float uLift;
uniform float uCloudTime;
uniform sampler2D uShadowMap;
uniform vec2 uMapSize;
uniform float uFilm;
uniform float uSunLift;

float fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fhash(i), b = fhash(i + vec2(1.0, 0.0)), c = fhash(i + vec2(0.0, 1.0)), d = fhash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** The exact normal of the facet under this fragment, oriented like the surface it belongs to. */
vec3 facetNormal(vec3 world, vec3 smoothN) {
  vec3 n = normalize(cross(dFdx(world), dFdy(world)));
  return dot(n, smoothN) < 0.0 ? -n : n;
}

/** How much sun reaches this point on the ground, one is full light. */
float sunReach(vec3 world) {
  vec2 uv = world.xz / uMapSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uShadowMap, uv).r;
}

/** Cloud shadow: one scrolling noise, drifting. Art brief section 8. */
float cloudShadow(vec3 world) {
  float c = fnoise(world.xz * ${CLOUD.scale.toFixed(4)} + uCloudTime * vec2(1.0, 0.4));
  c += 0.5 * fnoise(world.xz * ${(CLOUD.scale * 2.3).toFixed(4)} + uCloudTime * vec2(0.7, 0.9));
  return smoothstep(0.55, 1.05, c);
}

/** Warm key, cool fill, cast shadow taking the key away and leaving the fill. */
vec3 shade(vec3 albedo, vec3 n, float shadowSample, float ao, float cloud) {
  float sh = 1.0 - (1.0 - shadowSample) * uShadowStrength;
  sh *= 1.0 - cloud * ${CLOUD.strength.toFixed(3)};
  float lambert = dot(n, uSunDir);
  float wrapped = max(0.0, lambert * (1.0 - ${LIGHT.wrap.toFixed(3)}) + ${LIGHT.wrap.toFixed(3)});
  float diff = pow(wrapped, ${LIGHT.diffuseGamma.toFixed(2)});
  vec3 key = uKeyColour * uKeyStrength * diff * sh;
  float skyFace = mix(1.0 - ${LIGHT.skyUpBias.toFixed(2)}, 1.0, max(0.0, n.y));
  vec3 fillColour = mix(uShadowColour, uAmbientColour, sh);
  vec3 fill = fillColour * uAmbientStrength * skyFace * ao;
  vec3 bounce = uBounceColour * ${LIGHT.bounceStrength.toFixed(3)} * (0.5 - n.y * 0.5) * ao;
  vec3 c = albedo * (key + fill + bounce);
  float rim = pow(max(0.0, dot(n, uSunHoriz)), ${LIGHT.rimPower.toFixed(2)}) * (1.0 - abs(n.y)) * sh;
  c += uRimColour * uRimStrength * rim;
  return c;
}

/** A fine grain over everything, and the contrast that puts the result across the whole range
 *  rather than the middle of it.
 *
 *  The grain is measured in pixels, not in tiles. Taken in world space it was a fixed number of
 *  cycles per tile, which at overview zoom is many cycles per pixel: it stopped being a grain and
 *  became speckle, and because the speckle does not average to what the smooth version would, the
 *  whole palette moved as the camera pulled back. In pixels it is the same grain at every zoom. */
vec3 finish(vec3 c, vec3 world) {
  float film = fnoise(gl_FragCoord.xy * ${SURFACE.filmScale.toFixed(3)}) - 0.5;
  c *= 1.0 + film * uFilm;
  c = (c - 0.5) * uContrast + 0.5 + uLift;
  return max(c, vec3(0.0));
}
`

/** The vertex shader every instanced form on the map shares: world position, smooth normal and the
 *  per-instance colour, with three.js supplying the instancing attributes. */
export const SURFACE_VS = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal2;
varying vec3 vTint;
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    vec4 world = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    nrm = normalize(mat3(instanceMatrix) * nrm);
  #else
    vec4 world = modelMatrix * vec4(pos, 1.0);
  #endif
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  #ifdef USE_COLOR
    vTint *= color;
  #endif
  vWorld = world.xyz;
  vNormal2 = normalize(mat3(modelMatrix) * nrm);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const SURFACE_FS = /* glsl */ `
precision highp float;
${LIGHT_GLSL}
uniform float uAo;
uniform vec3 uTint;
varying vec3 vWorld;
varying vec3 vNormal2;
varying vec3 vTint;
void main() {
  vec3 n = facetNormal(vWorld, vNormal2);
  // sample the light a little toward the sun, so a thing does not stand in its own shadow
  vec3 probe = vWorld + uSunHoriz * (max(0.0, vWorld.y) * uSunLift);
  float shadow = sunReach(probe);
  vec3 c = shade(vTint * uTint, n, shadow, uAo, cloudShadow(vWorld));
  gl_FragColor = vec4(finish(c, vWorld), 1.0);
}
`

/** A material for anything standing on the ground: props, roofs, ribbons, units. One per group so
 *  each can carry its own ambient occlusion floor, all sharing the light. */
export function surfaceMaterial(light: LightUniforms, ao = 1, vertexColors = false, tint: THREE.ColorRepresentation = 0xffffff): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VS,
    fragmentShader: SURFACE_FS,
    uniforms: { ...light, uAo: { value: ao }, uTint: { value: new THREE.Color(tint) } },
    vertexColors,
  })
}

/** A flat, unlit material, for the few things that must not take light: the selection ring, a wake. */
export function flatMaterial(colour: THREE.ColorRepresentation, opacity = 1): THREE.Material {
  return new THREE.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity })
}

export { SHADOW, seasonLook }
