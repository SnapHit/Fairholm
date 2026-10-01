// The early era, drawn rather than built.
//
// Art direction brief section 6 says a settlement is a kit of roofs, and for worked stone and for
// brick that is still true: those are built from the forms in settlements.ts. The first era is not.
// It is seven timber buildings drawn as pictures, packed into one sheet, and a settlement is
// composed from them the way a village is composed from buildings: at most four of them, chosen by
// what the place holds, standing on a small lattice that is deterministic from the settlement's own
// id so that the same place is the same place every time it is drawn.
//
// The drawing itself is done by billboards.ts, which every picture on the map shares so that they
// can be sorted against one another. This file is the composition: which buildings, where, how big.
//
// How big is set in world terms, against the person on the units sheet, and not by eye. The cabin's
// wall stands a person tall, so a colonist beside it stands at the eave; the roof above that is what
// the drawing says it is. That makes a building a tile and more across, and a settlement of four of
// them well over the tile it is counted on, which is the point: one tile of gameplay and rather more
// than one tile of place.
//
// The sheet is drawn already lit, from the upper left. Rather than light it a second time, the map's
// light is applied to it as a colour and a depth: full sun leaves it as drawn, a cast shadow or a
// cloud takes it down and turns it cold, and the season tints it. The scene's sun was turned round
// to agree with the sheet rather than the sheet repainted to agree with the sun; see DECISIONS.md.
//
// Every number and colour comes from src/render/look.ts.

import * as THREE from 'three'
import type { Settlement } from '../sim/state'
import { SPRITE, UNIT_SPRITE } from './look'
import { SETTLEMENT_ATLAS } from './settlement-atlas'
import type { Billboard } from './billboards'

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 10000) / 10000
}

/** Tiles per sheet pixel: the cabin's drawn wall is a person tall. */
export function sheetScale(): number {
  const eave = SPRITE.eave
  return (eave.people * UNIT_SPRITE.tileHeight) / eave.px
}

/** How many buildings a place of this many people has standing: two to begin with, four by the
 *  time a handful live there, and never more. */
export function pieceCount(pop: number): number {
  let n = SPRITE.fromCount
  for (const at of SPRITE.growAt) if (pop >= at) n++
  return Math.min(SPRITE.maxCount, n)
}

const INDUSTRY = ['carpenter', 'smelter', 'toolworks', 'armoury', 'linenWorks', 'ropeWorks', 'dyeWorks', 'still', 'finishing'] as const

/** Which buildings a settlement shows, in the order they matter, from what it holds: a dwelling
 *  always, the hall where there is one, the frame of whatever is being built, and then the barn,
 *  the steading and the yard for what the place is for. A large place lives in a longhouse rather
 *  than a cabin. Only the first few of these are drawn; see pieceCount. */
export function piecesFor(st: Settlement, pop: number): string[] {
  const b = st.buildings
  const out: string[] = []
  const want = (name: string) => { if (!out.includes(name) && SETTLEMENT_ATLAS.pieces[name]) out.push(name) }
  want(pop >= SPRITE.longhouseAt ? 'longhouse' : 'lodge')
  if (b.meeting > 0 || b.press > 0 || b.school > 0) want('hall')
  if (st.building) want('frame')
  if (b.storage > 0 || st.orders.purpose === 'food') want('barn')
  if (b.stable > 0 || st.orders.purpose === 'horses') want('steading')
  if (INDUSTRY.some(line => b[line] > 0) || b.wharf > 0 || b.works > 0) want('yard')
  // and the rest of the kit, for a place that has outgrown what it holds
  for (const name of ['barn', 'yard', 'steading', 'lodge', 'hall']) want(name)
  return out
}

/** The buildings of one settlement, laid out from its id so the place never reshuffles.
 *  `sheet` is the index the settlement sheet was handed to buildBillboards at. */
export function layOut(
  st: Settlement,
  pop: number,
  cx: number,
  cz: number,
  heightAt: (x: number, z: number) => number,
  onLand: (x: number, z: number) => boolean,
  sheet: number,
): Billboard[] {
  const n = pieceCount(pop)
  const names = piecesFor(st, pop).slice(0, n)
  const scale = sheetScale()
  const id = st.id
  // the lattice: four places around the middle, the far ones first so the hall stands behind. A
  // place is mirrored or not from its id, so two settlements are not the same picture
  const mirror = hash(id, 7) > 0.5 ? -1 : 1
  const slots = SPRITE.slots
  const order = SPRITE.slotOrder[names.length - 1] ?? SPRITE.slotOrder[SPRITE.slotOrder.length - 1]
  const out: Billboard[] = []
  const colour = new THREE.Color()
  for (let k = 0; k < names.length; k++) {
    const piece = SETTLEMENT_ATLAS.pieces[names[k]]
    const slot = slots[Math.min(slots.length - 1, order[k] ?? k)]
    const jx = (hash(id * 31 + k, 2) - 0.5) * SPRITE.jitter
    const jz = (hash(id * 31 + k, 3) - 0.5) * SPRITE.jitter
    // a footprint this size reaches past the tile, and a coastal settlement's can reach past the
    // coast with it. A building that will not stand on the ground it is given walks back in
    let x = cx + slot[0] * mirror + jx
    let z = cz + slot[1] + jz
    for (let back = 0; back < 3 && !onLand(x, z); back++) {
      x = cx + (x - cx) * 0.5
      z = cz + (z - cz) * 0.5
    }
    // a tint of one is the drawing as it was drawn, so the wander is around that rather than from it
    const warm = (hash(id * 13 + k, 4) - 0.5) * SPRITE.hueJitter
    const value = 1 + (hash(id * 13 + k, 5) - 0.5) * SPRITE.valueJitter
    colour.setRGB(value * (1 + warm), value, value * (1 - warm))
    const width = piece.w * scale
    const height = piece.h * scale
    out.push({
      sheet, piece, x, z, y: heightAt(x, z), width, height, lift: SPRITE.lift, tint: colour.clone(),
      exposure: SPRITE.exposure, sunSide: 0, probeHeight: SPRITE.probeHeight,
      flip: false, desaturate: 0, tilt: 0, cut: 0, bob: 0,
    })
  }
  return out
}
