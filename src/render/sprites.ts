// The early era, drawn rather than built.
//
// Art direction brief section 6 says a settlement is a kit of roofs, and for worked stone and for
// brick that is still true: those are built from the forms in settlements.ts. The first era is not.
// It is seven timber buildings drawn as pictures, packed into one sheet, and a settlement is
// composed from them the way a village is composed from buildings: a couple of them when two people
// live there, all seven by the time twelve do, standing on a lattice that is deterministic from the
// settlement's own id so that the same place is the same place every time it is drawn.
//
// The drawing itself is done by billboards.ts, which every picture on the map shares so that they
// can be sorted against one another. This file is the composition: which buildings, where, how big.
//
// The sheet is drawn already lit, from the upper left. Rather than light it a second time, the map's
// light is applied to it as a colour and a depth: full sun leaves it as drawn, a cast shadow or a
// cloud takes it down and turns it cold, and the season tints it. The scene's sun was turned round
// to agree with the sheet rather than the sheet repainted to agree with the sun; see DECISIONS.md.
//
// Every number and colour comes from src/render/look.ts.

import * as THREE from 'three'
import { SPRITE } from './look'
import { SETTLEMENT_ATLAS } from './settlement-atlas'
import type { Billboard, AtlasPiece } from './billboards'

/** The buildings, by name, in a fixed order so a shuffle from a settlement's id is repeatable. */
const PIECES: AtlasPiece[] = Object.keys(SETTLEMENT_ATLAS.pieces).sort().map(k => SETTLEMENT_ATLAS.pieces[k])


/** How many buildings a place of this many people has standing. */
export function pieceCount(pop: number): number {
  const span = Math.max(1, SPRITE.allByPop - SPRITE.fromPop)
  const grown = (pop - SPRITE.fromPop) / span
  const base = Math.round(2 + grown * (PIECES.length - 2))
  const extra = Math.min(SPRITE.maxExtra, Math.max(0, Math.floor((pop - SPRITE.allByPop) / SPRITE.extraPer)))
  return Math.max(2, Math.min(PIECES.length + extra, base + extra))
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

/** The buildings of one settlement, laid out from its id so the place never reshuffles. Larger
 *  places stand further out, which is how a settlement grows past the tile it is counted on.
 *  `sheet` is the index the settlement sheet was handed to buildBillboards at. */
export function layOut(
  id: number,
  pop: number,
  cx: number,
  cz: number,
  heightAt: (x: number, z: number) => number,
  onLand: (x: number, z: number) => boolean,
  sheet: number,
): Billboard[] {
  const n = pieceCount(pop)
  const grown = Math.max(0, Math.min(1, (n - 2) / Math.max(1, PIECES.length - 2)))
  const spread = SPRITE.spreadFrom + grown * (SPRITE.spreadTo - SPRITE.spreadFrom)
  // a deterministic shuffle, so which buildings a place has is its own and does not follow its size
  const order = PIECES.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(hash(id * 7919 + i, 41) * (i + 1))
    const t = order[i]; order[i] = order[j]; order[j] = t
  }
  const out: Billboard[] = []
  const colour = new THREE.Color()
  for (let k = 0; k < n; k++) {
    const piece = PIECES[order[k % order.length]]
    // rings: one building in the middle, the rest around it, the ring growing as the place does
    const ring = k === 0 ? 0 : Math.ceil(k / 4)
    const inRing = ring === 0 ? 1 : Math.min(4 + (ring - 1) * 3, n)
    const index = ring === 0 ? 0 : (k - 1) % inRing
    const angle = (index / inRing) * Math.PI * 2 + hash(id, ring * 3 + 1) * Math.PI * 2
    const radius = ring === 0 ? 0 : spread * (ring / Math.max(1, Math.ceil((n - 1) / 4)))
    const jx = (hash(id * 31 + k, 2) - 0.5) * spread * SPRITE.jitter
    const jz = (hash(id * 31 + k, 3) - 0.5) * spread * SPRITE.jitter
    // a footprint this size reaches past the tile, and a coastal settlement's ring can reach past
    // the coast with it. A building that will not stand on the ground it is given walks back in
    let x = cx + Math.cos(angle) * radius + jx
    let z = cz + Math.sin(angle) * radius * 0.85 + jz
    for (let back = 0; back < 3 && !onLand(x, z); back++) {
      x = cx + (x - cx) * 0.5
      z = cz + (z - cz) * 0.5
    }
    // a tint of one is the drawing as it was drawn, so the wander is around that rather than from it
    const warm = (hash(id * 13 + k, 4) - 0.5) * SPRITE.hueJitter
    const value = 1 + (hash(id * 13 + k, 5) - 0.5) * SPRITE.valueJitter
    colour.setRGB(value * (1 + warm), value, value * (1 - warm))
    // every piece keeps its own proportions against a reference width, so the hall really is
    // taller than the barn
    const width = (piece.w / SPRITE.referenceWidth) * SPRITE.tileWidth
    const height = (piece.h / SPRITE.referenceWidth) * SPRITE.tileWidth
    out.push({
      sheet, piece, x, z, y: heightAt(x, z), width, height, lift: SPRITE.lift, tint: colour.clone(),
      exposure: SPRITE.exposure, sunSide: 0, probeHeight: SPRITE.occluderHeight,
    })
  }
  return out
}
