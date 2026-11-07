// The settlement screen. Settlement screen and layout brief section 2: the whole settlement at once,
// tiles and buildings and workers and goods on one screen, with only the standing orders behind a
// control. A ring of nine in the middle, three building slots down each flank, an overflow row that
// scrolls sideways, the idle row and the goods strip.
//
// The ring is the map's own picture of the nine tiles, drawn by the renderer (src/ui/ring.ts and
// Scene.drawRing), so it improves whenever the map does. There is no second art pipeline.
//
// Nothing here writes to the state: every change goes through app.dispatch and is undoable.

import type { GameState, Settlement, GoodId, TileGood, BuildingLine } from '../sim/state'
import { C } from '../sim/constants'
import { foodBalance, clerksRequired, buildingWorkers, tileYield } from '../sim/labour'
import { storageCapacity } from '../sim/settlement'
import { h, button, muted, fmt, plural, signed } from './dom'
import { ringView, terrainLayers, type TileContent } from './ring'
import {
  ringCells, buildingSlots, goodsStrip, destinationsFor, ownSettlements, consignable,
  standingWords, standingMark, goodWord,
  type RingCell, type BuildingSlot,
} from './selectors'
import type { App } from './app'

export { terrainLayers }

/** What a tile carries over the picture, as the screen has always marked it: who works it, a prime,
 *  what it yields, and the settlement's name at the centre. */
function tileMarks(st: Settlement): TileContent {
  return (cell: RingCell, el: HTMLElement) => {
    if (cell.centre) { el.append(h('div', { class: 'centre' }, st.name)); return }
    const look = cell.look!
    if (cell.worker) el.append(h('div', { class: 'worker' }, standingMark(cell.worker.colonist)))
    if (look.prime) el.append(h('div', { class: 'prime' }))
    const shown = cell.worker ? { good: cell.worker.good as TileGood, yield: cell.worker.yield } : cell.best
    if (shown) el.append(h('div', { class: 'label' }, `${goodWord(shown.good as GoodId)} ${shown.yield}`))
  }
}

function buildingSlotEl(app: App, st: Settlement, slot: BuildingSlot, highlighted: boolean): HTMLElement {
  const el = h('button', {
    class: 'slot' + (slot.built ? '' : ' empty') + (highlighted ? ' can-take' : ''),
    type: 'button',
    'aria-label': `${slot.name}, ${slot.conversion}`,
    title: `${slot.name}, ${slot.conversion}${slot.warning ? '. ' + slot.warning : ''}`,
    onClick: () => app.settlementTapSlot(st, slot),
  })
  el.append(h('div', { class: 'name' }, slot.name))
  el.append(h('div', { class: 'conv' }, slot.built ? slot.conversion : (slot.cost ?? '')))
  const foot = h('div', { class: 'foot' })
  if (slot.built && slot.capacity > 0) {
    const crew = h('div', { class: 'crew' })
    for (let i = 0; i < slot.capacity; i++) crew.append(h('i', { class: i < slot.workers.length ? 'on' : '' }))
    foot.append(crew)
  } else foot.append(h('span', {}, slot.built ? '' : (slot.gate ?? '')))
  if (slot.built && slot.outputWord) foot.append(h('div', { class: 'out' + (slot.output > 0 ? '' : ' none') }, slot.output > 0 ? signed(slot.output) : '0'))
  el.append(foot)
  if (slot.warning) el.append(h('span', { class: 'flag', title: slot.warning }, '!'))
  return el
}

export function settlementScreen(app: App, s: GameState, st: Settlement): HTMLElement {
  const own = ownSettlements(s)
  const pick = app.pick && app.pick.settlement === st.id ? app.pick.colonist : null
  const dests = pick !== null ? destinationsFor(s, st, pick) : { tiles: new Set<number>(), lines: new Set<BuildingLine>() }
  const cells = ringCells(s, st)
  const slots = buildingSlots(s, st)
  const fb = foodBalance(s, st)
  const cap = storageCapacity(st)

  // ---- header ---------------------------------------------------------------------------------
  const head = h('div', { class: 'st-head' })
  if (own.length > 1) {
    head.append(h('button', { class: 'nav', type: 'button', 'aria-label': 'previous settlement', onClick: () => app.gotoSettlement(-1) }, '‹'))
  }
  head.append(h('div', { class: 'who' },
    h('div', { class: 'name tappable', onClick: () => app.open({ kind: 'rename', settlement: st.id }) }, st.name),
    h('div', { class: 'sub' }, `${plural(st.colonists.length, 'colonist')} · food ${signed(fb)}${C.flags.grievance ? ` · resolve ${Math.round(st.resolve * 100)}%` : ''}`),
  ))
  if (own.length > 1) {
    head.append(h('button', { class: 'nav', type: 'button', 'aria-label': 'next settlement', onClick: () => app.gotoSettlement(1) }, '›'))
  }
  head.append(
    // the one control the brief puts behind a header control, marked while the orders are unread
    h('button', { class: 'orders' + (st.orders.reviewed ? '' : ' unread'), type: 'button', 'aria-label': 'standing orders', onClick: () => app.open({ kind: 'orders', settlement: st.id }) }, '⚙'),
    h('button', { class: 'close', type: 'button', 'aria-label': 'close', onClick: () => app.closeSheet() }, '✕'),
  )

  // ---- the core: flank, ring, flank -------------------------------------------------------------
  const built = slots.filter(x => x.built)
  const options = slots.filter(x => !x.built)
  const flankLeft = built.slice(0, 3)
  const flankRight = built.slice(3, 6)
  const overflow = [...built.slice(6), ...options]

  const ring = ringView(app, s, st, cells, dests.tiles, tileMarks(st))

  // only a building that exists and has room can take the colonist being held
  const lit = (b: BuildingSlot) => b.built && dests.lines.has(b.line)
  const core = h('div', { class: 'st-core' },
    h('div', { class: 'st-flank' }, flankLeft.map(b => buildingSlotEl(app, st, b, lit(b)))),
    ring,
    h('div', { class: 'st-flank' }, flankRight.map(b => buildingSlotEl(app, st, b, lit(b)))),
  )

  const body = h('div', { class: 'st-body' }, core)
  if (overflow.length) body.append(h('div', { class: 'st-overflow' }, overflow.map(b => buildingSlotEl(app, st, b, lit(b)))))

  // ---- idle, only when someone is idle -----------------------------------------------------------
  const idle = st.colonists.map((c, i) => ({ c, i })).filter(x => x.c.job.kind === 'idle')
  if (idle.length) {
    body.append(h('div', { class: 'st-strip' },
      h('div', { class: 'head' },
        h('span', {}, pick !== null ? 'Tap where they should work' : `Idle: ${idle.length}`),
        button('Assign all', () => app.dispatch({ t: 'autoAssign', settlement: st.id }, 'Assigned'), 'tiny ghost'),
      ),
      h('div', { class: 'rail' }, idle.map(x => h('button', {
        class: 'person' + (pick === x.i ? ' picked' : ''), type: 'button',
        onClick: () => app.pickColonist(st, x.i),
      }, h('span', { class: 'dot' }), h('span', {}, standingWords(x.c))))),
    ))
  } else if (pick !== null) {
    body.append(h('div', { class: 'st-strip' }, h('div', { class: 'head' },
      h('span', {}, `Moving a ${standingWords(st.colonists[pick])}. Tap where they should work.`),
      button('Never mind', () => app.pickColonist(st, null), 'tiny ghost'),
    )))
  }

  // ---- goods --------------------------------------------------------------------------------------
  const goods = goodsStrip(s, st)
  const ok = consignable(s, st)
  body.append(h('div', { class: 'st-strip' },
    h('div', { class: 'head' },
      h('span', { class: 'l' }, h('span', {}, 'In store'), h('span', { class: 'plain' }, `${cap} a good`)),
      button('Market', () => app.open({ kind: 'market', settlement: st.id }), 'tiny ghost'),
    ),
    goods.length
      ? h('div', { class: 'rail' }, goods.map(g => h('button', {
        class: 'good' + (g.spoiling ? ' spoiling' : ''), type: 'button',
        onClick: () => app.open({ kind: 'goodActions', settlement: st.id, good: g.good }),
      },
        h('span', { class: 'n' }, goodWord(g.good)),
        h('span', { class: 'v' }, `${fmt(g.stock)} held${g.spoiling ? ', spoiling' : ''}${g.made > 0 ? ` · ${signed(Math.round(g.made))} a turn` : ''}${g.price !== null ? ` · ${g.price} each` : ''}${g.rule ? ` · ${g.rule}${g.ownRule ? ', its own rule' : ''}` : ''}`),
      )))
      : muted('Nothing in store yet.'),
  ))

  // ---- everything else, in the open rather than behind a tab -------------------------------------
  const more = h('div', { class: 'rail' })
  more.append(button(`Build order${st.buildQueue.length ? ` (${st.buildQueue.length})` : ''}`, () => app.open({ kind: 'build', settlement: st.id }), 'small ghost'))
  more.append(button('Equip', () => app.open({ kind: 'equip', settlement: st.id }), 'small ghost'))
  if (st.buildings.school > 0) more.append(button('School', () => app.open({ kind: 'educate', settlement: st.id }), 'small ghost'))
  if (st.buildings.wharf > 0) more.append(button('Hulls', () => app.open({ kind: 'hulls', settlement: st.id }), 'small ghost'))
  more.append(button('Everything here', () => app.open({ kind: 'settlementDetail', id: st.id }), 'small ghost'))
  body.append(h('div', { class: 'st-strip' }, h('div', { class: 'head' }, h('span', {}, 'Also')), more))

  const notes: string[] = []
  if (st.hunger > 0) notes.push(`Short of food for ${plural(st.hunger, 'turn')}.`)
  if (!ok.ok && ok.reason) notes.push(ok.reason)
  if (st.building) notes.push(`Building ${st.building.frame}/${C.buildings.costs[st.building.id.tier]!.frame} frame.`)
  const clerks = clerksRequired(st.colonists.length)
  if (clerks > 0) notes.push(`${plural(clerks, 'clerk')} needed at this size; ${buildingWorkers(st, 'meeting') + buildingWorkers(st, 'press')} civic workers.`)
  if (notes.length) body.append(h('div', { class: 'st-note' }, notes.join(' ')))

  return h('div', { class: 'settlement' }, head, body)
}

/** Which goods a tile could be worked for, best first, for the assignment sheet's chips. */
export function tileGoodOrder(s: GameState, tile: number, offers: TileGood[]): TileGood[] {
  return [...offers].sort((a, b) => tileYield(s, tile, b, null) - tileYield(s, tile, a, null))
}
