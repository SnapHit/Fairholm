// Cast shadows, baked. Architecture brief section 3 and art brief section 1: shadows and occlusion
// are computed when the world changes, never per frame.
//
// The camera looks straight down, which removes silhouette. Shadow is what replaces it. A ray is
// marched from every texel toward the sun across the heightfield, so a ridge throws a shadow across
// the valley behind it; then every tree, boulder, roof and unit stamps its own shadow onto the same
// map, lying away from the sun and lengthening with height. One greyscale texture, sampled by the
// ground, the water and everything standing on them, so a tree in a hill's shade is dark too.
//
// Two layers: a base baked with the world and re-baked when the season moves the sun, and a working
// copy that takes the settlements and units, which change within a turn. Copying the base is one
// typed-array copy.

import * as THREE from 'three'
import { SHADOW } from './look'

export interface Occluder {
  x: number
  z: number
  /** How far the top of it stands above the ground it sits on, in tiles. */
  height: number
  /** Half width of the thing casting, in tiles. */
  radius: number
}

export class ShadowBake {
  readonly texture: THREE.DataTexture
  readonly tw: number
  readonly th: number
  private base: Uint8Array
  private work: Uint8Array
  private mapW: number
  private mapH: number
  private per = SHADOW.texelsPerTile

  constructor(mapW: number, mapH: number) {
    this.mapW = mapW
    this.mapH = mapH
    this.tw = Math.max(1, Math.round(mapW * this.per))
    this.th = Math.max(1, Math.round(mapH * this.per))
    this.base = new Uint8Array(this.tw * this.th).fill(255)
    this.work = new Uint8Array(this.tw * this.th).fill(255)
    this.texture = new THREE.DataTexture(this.work, this.tw, this.th, THREE.RedFormat)
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.wrapS = THREE.ClampToEdgeWrapping
    this.texture.wrapT = THREE.ClampToEdgeWrapping
    this.texture.unpackAlignment = 1
    this.texture.needsUpdate = true
  }

  /** Bake the ground's own shadow and everything that stands on it permanently. Per world and per
   *  season, because the sun moves across the year.
   *
   *  Two resolutions, because the two jobs want different things. A ridge's shadow is broad and its
   *  ray march is the expensive part, so that is done on a coarse grid with a step that lengthens as
   *  it goes. A tree's shadow is a hand's breadth across and needs the fine grid, but stamping one
   *  is nearly free. The coarse result is lifted onto the fine grid and the props go on top. */
  bakeBase(heightAt: (x: number, z: number) => number, sun: [number, number, number], statics: Occluder[]) {
    const { tw, th, per } = this
    const hl = Math.hypot(sun[0], sun[2]) || 1
    const sx = sun[0] / hl, sz = sun[2] / hl
    const tanE = Math.max(0.08, sun[1] / hl)
    const soft = SHADOW.softness

    const cper = per / SHADOW.marchDivisor
    const cw = Math.max(1, Math.round(this.mapW * cper)), ch = Math.max(1, Math.round(this.mapH * cper))
    const coarse = new Float32Array(cw * ch)
    const steps = SHADOW.marchSteps
    // a step that grows, so the near ground is sampled closely and the far ground cheaply
    const offsets: number[] = []
    let d = 1 / per, growth = 1
    for (let k = 0; k < steps && d < SHADOW.reachTiles; k++) { offsets.push(d); growth *= SHADOW.marchGrowth; d += growth / per }
    for (let tz = 0; tz < ch; tz++) {
      for (let tx = 0; tx < cw; tx++) {
        const x = (tx + 0.5) / cper, z = (tz + 0.5) / cper
        const h0 = heightAt(x, z)
        let occ = 0
        for (const dd of offsets) {
          const px = x - sx * dd, pz = z - sz * dd
          if (px < 0 || pz < 0 || px >= this.mapW || pz >= this.mapH) break
          const rise = heightAt(px, pz) - (h0 + dd * tanE)
          if (rise > 0) {
            const o = Math.min(1, rise / soft)
            if (o > occ) { occ = o; if (occ >= 1) break }
          }
        }
        coarse[tz * cw + tx] = 1 - occ
      }
    }
    // lift the coarse march onto the fine grid
    const base = this.base
    for (let tz = 0; tz < th; tz++) {
      const cz = Math.min(ch - 1.001, Math.max(0, (tz + 0.5) / per * cper - 0.5))
      const z0 = Math.floor(cz), fz = cz - z0
      for (let tx = 0; tx < tw; tx++) {
        const cx = Math.min(cw - 1.001, Math.max(0, (tx + 0.5) / per * cper - 0.5))
        const x0 = Math.floor(cx), fx = cx - x0
        const a = coarse[z0 * cw + x0], b = coarse[z0 * cw + x0 + 1]
        const c = coarse[(z0 + 1) * cw + x0], e = coarse[(z0 + 1) * cw + x0 + 1]
        const v = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + e * fx) * fz
        base[tz * tw + tx] = Math.round(Math.max(0, Math.min(1, v)) * 255)
      }
    }
    for (const o of statics) this.stamp(base, o, sx, sz, tanE)
    blur(base, tw, th, SHADOW.blurPasses)
    this.work.set(base)
    this.texture.needsUpdate = true
  }

  /** Put the settlements and the units back on top of the baked base. Cheap: one copy and a few
   *  hundred stamps. Called whenever the dynamic layers are rebuilt. */
  stampDynamic(sun: [number, number, number], movers: Occluder[]) {
    const hl = Math.hypot(sun[0], sun[2]) || 1
    const sx = sun[0] / hl, sz = sun[2] / hl
    const tanE = Math.max(0.08, sun[1] / hl)
    this.work.set(this.base)
    for (const o of movers) this.stamp(this.work, o, sx, sz, tanE)
    this.texture.needsUpdate = true
  }

  /** One occluder's shadow: a soft trail of discs lying away from the sun, as long as the thing is
   *  tall and fading along its length, with the darkest part where it meets the ground. */
  private stamp(buf: Uint8Array, o: Occluder, sx: number, sz: number, tanE: number) {
    const per = this.per
    const len = Math.min(SHADOW.reachTiles, o.height / tanE)
    const discs = Math.max(2, Math.min(14, Math.round(len * per * 0.9)))
    for (let k = 0; k <= discs; k++) {
      const t = k / discs
      const wx = o.x - sx * len * t
      const wz = o.z - sz * len * t
      const r = o.radius * SHADOW.contactWidth * (1 - 0.4 * t)
      const depth = SHADOW.contactDepth * (1 - 0.55 * t)
      disc(buf, this.tw, this.th, wx * per, wz * per, r * per, depth)
    }
  }

  dispose() { this.texture.dispose() }
}

/** A soft round bite out of the light. */
function disc(buf: Uint8Array, tw: number, th: number, cx: number, cz: number, r: number, depth: number) {
  if (r <= 0 || depth <= 0) return
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(tw - 1, Math.ceil(cx + r))
  const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(th - 1, Math.ceil(cz + r))
  const r2 = r * r
  for (let z = z0; z <= z1; z++) {
    const dz = z + 0.5 - cz
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const d2 = dx * dx + dz * dz
      if (d2 > r2) continue
      // a linear falloff rather than a squared one: squared leaves a pin of dark in the middle and
      // nothing around it, which after the blur is no shadow at all
      const fall = 1 - Math.sqrt(d2 / r2)
      const bite = depth * fall * (0.45 + 0.55 * fall) * 255
      const i = z * tw + x
      const v = buf[i] - bite
      buf[i] = v < 0 ? 0 : v
    }
  }
}

/** A three by three box blur, in place, to take the stair edges off a marched shadow. */
function blur(buf: Uint8Array, w: number, h: number, passes: number) {
  if (passes <= 0) return
  const tmp = new Uint8Array(buf.length)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= w) continue
            sum += buf[yy * w + xx]; n++
          }
        }
        tmp[y * w + x] = (sum / n) | 0
      }
    }
    buf.set(tmp)
  }
}
