// The sheets. Each is a function of the app and a spec, returning DOM for the bottom third.
// Everything that changes state goes through app.dispatch, so it is undoable and never a dialog.

import type { GameState, Settlement, Unit, Colonist, GoodId, BuildId, BuildingLine, TileGood, LandKind, Purpose, HullKind, Difficulty, MapSize, LandShape, GoodRule, SurplusDestination, SignatoryCategory } from '../sim/state'
import { GOODS, BUILDING_LINES } from '../sim/state'
import { C } from '../sim/constants'
import { unitLabel } from '../sim/queue'
import { workableTiles, tileOffers, tileYield, passageCost, goldPassageCost, buildingWorkers, foodBalance, workerOutput, landingSettlement, clerksRequired } from '../sim/labour'
import { previewProduction, buildable, buildingName, storageCapacity, isCoastalSettlement, canStart, foundingProblem, surplusRuleFor } from '../sim/settlement'
import { neighbours8, isLand, dist } from '../sim/worldgen'
import { turnsToCoast } from '../sim/autopilot'
import { sellPrice, buyPrice, canConsign, isEmbargoed, freightLoss, consignPreview, dumpedGoods } from '../sim/market'
import { maxMoves, cargoCapacity, equipCost, isHull, isArmed, unitAttack, unitDefence } from '../sim/units'
import { sightMask } from '../sim/fog'
import { signatoryList, signatoryCost } from '../sim/grievance'
import { predecessorStore, offerTerms } from '../sim/predecessors'
import { term, TERMS } from './glossary'
import { settlementProblems } from '../sim/problems'
import { h, button, row, muted, fmt, signed, plural } from './dom'
import { TERRAIN_WORDS, FOREST_WORDS, PRIME_WORDS, tileLook, tileWords } from '../render/tiles'
import {
  GOOD_WORDS, ringCells, ringPreview, tileCandidates, buildingCandidates, standingWords, jobWords, goodWord,
  takesWorkers, ruleStarts, catalogue, makesIn, goodsShelf, buildingSlots, personTitle, type Candidate, type CatalogueEntry,
} from './selectors'
import { settlementScreen, terrainLayers, tileGoodOrder } from './settlement'
import * as Save from '../io/save'
import * as Telemetry from '../io/telemetry'
import type { App, Authoring } from './app'
import type { RoutePlan } from '../sim/route'
import { oddsWords } from './route'
import { icon, isGood, SEASON_ICONS, type IconName } from './icons'
import { season } from '../sim/turn'
import { goodMark, buildingPicture, unitPicture, personPicture, intoArrow, dispatchIcon, queueIcon } from './pictures'
import { priceGauge, fillBar, pips, sealRow, relationTrack } from './meters'
import { STORE_WARM, PLACE_BOX_REM, PLACE_TILES_SHOWN, RING_PICTURES_KEPT } from './theme'
import { ringPixels } from './ring'
import { RING_PICTURE } from '../render/look'
import type { Action } from '../sim/actions'

export type SheetSpec =
  | { kind: 'queue' } | { kind: 'fold' } | { kind: 'group'; group: string }
  /** What is not working at one settlement, each with its fix (src/sim/problems.ts). */
  | { kind: 'problems'; settlement: number }
  | { kind: 'settlement'; id: number } | { kind: 'settlementDetail'; id: number }
  | { kind: 'workers'; settlement: number; colonist: number }
  | { kind: 'assignTile'; settlement: number; tile: number; good?: TileGood }
  | { kind: 'assignBuilding'; settlement: number; line: BuildingLine }
  | { kind: 'goodActions'; settlement: number; good: GoodId }
  | { kind: 'build'; settlement: number } | { kind: 'orders'; settlement: number }
  | { kind: 'market'; settlement: number } | { kind: 'consign'; settlement: number; good: GoodId }
  | { kind: 'buy'; settlement: number; good: GoodId } | { kind: 'equip'; settlement: number }
  | { kind: 'educate'; settlement: number } | { kind: 'hulls'; settlement: number } | { kind: 'rename'; settlement: number }
  | { kind: 'unit'; id: number } | { kind: 'cargo'; id: number } | { kind: 'tile'; tile: number } | { kind: 'stack'; tile: number }
  | { kind: 'demand' } | { kind: 'glossary'; key: string } | { kind: 'dispatch' }
  | { kind: 'signatories' } | { kind: 'predecessor'; id: number } | { kind: 'rivals' } | { kind: 'declaration' }
  | { kind: 'authoring' }
  | { kind: 'menu' } | { kind: 'newgame' } | { kind: 'intent' } | { kind: 'settings' }

// One place each of these becomes a word: the goods in src/ui/selectors.ts, the ground in
// src/render/tiles.ts. A new good or terrain with no entry is then obvious rather than undefined.
const GOOD_NAMES: Record<string, string> = GOOD_WORDS
const TERRAIN_NAMES: Record<string, string> = TERRAIN_WORDS
const FOREST_NAMES: Record<string, string> = FOREST_WORDS
const PRIME_NAMES: Record<string, string> = PRIME_WORDS
const PURPOSES: Purpose[] = ['food', 'timber', 'ore', 'gold', 'horses', 'flax', 'hemp', 'madder', 'bloom', 'industry', 'civic']

function header(app: App, title: (HTMLElement | string)[] | string, sub?: string): HTMLElement {
  return h('div', { class: 'sheet-head' },
    button('‹', () => app.back(), 'back'),
    h('div', { class: 'sheet-title' }, h('div', { class: 'h' }, title), sub ? muted(sub) : null),
  )
}

/** A sheet's head led by a picture of what it is about (art direction brief section 11a): a good's
 *  icon at hero size, a building's drawing, a unit's, a banner. The title and the line under it as
 *  `header` has them, and an aside at the right for the one figure that matters most there. */
function heroHeader(app: App, pic: Element, title: Kids, sub?: Kids, aside?: Kids): HTMLElement {
  return h('div', { class: 'sheet-head hero' },
    button('‹', () => app.back(), 'back'),
    h('span', { class: 'hero-pic' }, pic),
    h('div', { class: 'sheet-title' }, h('div', { class: 'h' }, title), sub ? h('div', { class: 'muted sub' }, sub) : null),
    aside ? h('div', { class: 'aside' }, aside) : null,
  )
}

/** An icon and a figure, the word for it said to a screen reader and shown nowhere: for a dense row
 *  of numbers, where the icon and the number are enough (rule 3). */
function fig(name: IconName, value: string, word: string, cls = ''): HTMLElement {
  return h('span', { class: 'fig' + (cls ? ' ' + cls : '') }, icon(name, 'pill'), h('b', {}, value), h('span', { class: 'sr' }, ` ${word}`))
}

function T(app: App, key: string, label?: string): HTMLElement {
  return h('span', { class: 'term', onClick: (e: Event) => { e.stopPropagation(); app.open({ kind: 'glossary', key }) } }, label ?? (term(key)?.title ?? key))
}

type Kids = HTMLElement | string | null | false | undefined | Kids[]

function section(title: string, ...children: Kids[]): HTMLElement {
  return h('div', { class: 'section' }, h('div', { class: 'section-title' }, title), ...children)
}

function line(left: Kids, right?: Kids, onTap?: () => void): HTMLElement {
  return h('div', { class: 'line' + (onTap ? ' tappable' : ''), onClick: onTap }, h('span', { class: 'l' }, left), right !== undefined ? h('span', { class: 'r' }, right) : null)
}

function colonistLabel(c: Colonist): string {
  const sp = c.speciality ? ` of ${GOOD_NAMES[c.speciality as GoodId] ?? buildingName({ line: c.speciality as BuildingLine, tier: 1 })}` : ''
  return `${c.standing}${c.standing === 'master' ? sp.toLowerCase() : ''}`
}

function jobLabel(s: GameState, c: Colonist): string {
  if (c.job.kind === 'idle') return 'idle'
  if (c.job.kind === 'tile') return `${GOOD_NAMES[c.job.good]} ${tileYield(s, c.job.tile, c.job.good, c)}`
  return buildingName({ line: c.job.line, tier: 1 })
}

function notYet(app: App, what: string): HTMLElement {
  return h('p', { class: 'muted' }, `${what} is not in this build yet. The game runs without it.`)
}

export function renderSheet(app: App, spec: SheetSpec): HTMLElement {
  const s = app.state
  switch (spec.kind) {
    case 'settlement': return settlementScreen(app, s, s.settlements[spec.id])
    case 'settlementDetail': return settlementDetailSheet(app, s, s.settlements[spec.id])
    case 'assignTile': return assignTileSheet(app, s, s.settlements[spec.settlement], spec.tile, spec.good)
    case 'assignBuilding': return assignBuildingSheet(app, s, s.settlements[spec.settlement], spec.line)
    case 'goodActions': return goodActionsSheet(app, s, s.settlements[spec.settlement], spec.good)
    case 'workers': return workersSheet(app, s, s.settlements[spec.settlement], spec.colonist)
    case 'build': return buildSheet(app, s, s.settlements[spec.settlement])
    case 'orders': return ordersSheet(app, s, s.settlements[spec.settlement])
    case 'market': return marketSheet(app, s, s.settlements[spec.settlement])
    case 'consign': return consignSheet(app, s, s.settlements[spec.settlement], spec.good)
    case 'buy': return buySheet(app, s, s.settlements[spec.settlement], spec.good)
    case 'equip': return equipSheet(app, s, s.settlements[spec.settlement])
    case 'educate': return educateSheet(app, s, s.settlements[spec.settlement])
    case 'hulls': return hullsSheet(app, s, s.settlements[spec.settlement])
    case 'rename': return renameSheet(app, s, s.settlements[spec.settlement])
    case 'unit': { const u = s.units.find(x => x.id === spec.id); return u ? unitSheet(app, s, u) : h('div', { class: 'panel' }, header(app, 'Gone'), h('p', { class: 'muted' }, 'That unit is no longer on the map.')) }
    case 'cargo': { const u = s.units.find(x => x.id === spec.id); return u ? cargoSheet(app, s, u) : app.renderQueue() }
    case 'tile': return tileSheet(app, s, spec.tile)
    case 'stack': return stackSheet(app, s, spec.tile)
    case 'demand': return demandSheet(app, s)
    case 'glossary': return glossarySheet(app, s, spec.key)
    case 'dispatch': return dispatchSheet(app, s)
    case 'signatories': return signatoriesSheet(app, s)
    case 'predecessor': return predecessorSheet(app, s, spec.id)
    case 'authoring': return app.authoring ? authoringSheet(app, s, app.authoring) : app.renderQueue()
    case 'rivals': return rivalsSheet(app, s)
    case 'declaration': return declarationSheet(app, s)
    case 'menu': return menuSheet(app, s)
    case 'newgame': return newGameSheet(app, s)
    case 'intent': return intentSheet(app, s)
    case 'settings': return settingsSheet(app, s)
    case 'group': return groupSheet(app, spec.group)
    case 'problems': return problemsSheet(app, s, spec.settlement)
    case 'fold': return foldSheet(app)
    default: return app.renderQueue()
  }
}

// ---- settlement ------------------------------------------------------------------------------------
// The settlement screen itself is in src/ui/settlement.ts. This is the long form behind it: every
// number in one scrolling list, for when the screen's shorthand is not enough.
function settlementDetailSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  if (!st || st.owner !== 0) return h('div', { class: 'panel' }, header(app, 'Not yours'))
  const pop = st.colonists.length
  const prod = previewProduction(s, st)
  const fb = foodBalance(s, st)
  const cap = storageCapacity(st)
  const consignable = canConsign(s, st)
  const landing = landingSettlement(s)
  const clerksNeed = clerksRequired(pop)
  const panel = h('div', { class: 'panel' },
    heroHeader(app, placePicture(app, s, st.tile), [st.name, ' ', h('span', { class: 'muted small tappable', onClick: () => app.open({ kind: 'rename', settlement: st.id }) }, 'rename')],
      h('span', { class: 'figs' }, fig('colonist', String(pop), pop === 1 ? 'colonist' : 'colonists'), fig('food', signed(fb), 'food a turn', fb < 0 ? 'loss' : ''), fig('crate', String(cap), 'held of each good before it spoils'))),
  )
  if (st.hunger > 0) panel.append(h('div', { class: 'crisis' }, `Short of food for ${plural(st.hunger, 'turn')}.`))
  // what is made this turn: each good's icon and its signed number, with a short bar to scale
  const made = (Object.entries(prod) as [GoodId | 'frame' | 'grievance', number][]).filter(([, v]) => (v ?? 0) > 0).sort((a, b) => b[1] - a[1])
  const most = Math.max(1, ...made.map(([, v]) => v))
  panel.append(section('This turn', made.length ? h('div', { class: 'tally' }, made.map(([g, v]) => h('div', { class: 'tally-row' },
    goodMark(g, 'pill'), h('b', {}, signed(v)), fillBar(v / most, 'plain', null, 'made'), h('span', { class: 'sr' }, ` ${goodWord(g).toLowerCase()} made`)))) : h('p', { class: 'muted' }, 'Nothing is being made. Assign the colonists below.')))
  // what is in store: each good's icon and number, with its fullness bar and the rule's tick
  const shelf = goodsShelf(s, st, STORE_WARM).filter(g => g.good !== 'food' && g.stock > 0)
  panel.append(section('In store' + (consignable.ok ? '' : ' (haul to the coast to consign)'),
    shelf.length ? h('div', { class: 'tally' }, shelf.map(g => h('div', {
      class: 'tally-row tappable ' + g.state, role: 'button', 'aria-label': `${GOOD_NAMES[g.good]}: ${g.stock} of ${g.capacity}${g.state === 'spoils' ? ', spoiling' : ''}`,
      onClick: () => app.open({ kind: 'goodActions', settlement: st.id, good: g.good }),
    }, goodMark(g.good, 'pill'), h('b', {}, fmt(g.stock)), fillBar(g.fill, g.state, g.tick), g.state === 'spoils' ? h('span', { class: 'warn small-print' }, 'spoiling') : null))) : h('p', { class: 'muted' }, 'Nothing in store.'),
    row(button('Market', () => app.open({ kind: 'market', settlement: st.id }), 'small'), consignable.ok ? null : muted(consignable.reason ?? '')),
  ))
  // the people, as their figures with what each does now
  panel.append(section('Colonists',
    h('div', { class: 'people' }, st.colonists.map((c, i) => h('button', {
      class: 'person-tile', type: 'button', 'aria-label': `${standingWords(c)}, ${jobWords(s, st, c)}. Change their work.`,
      onClick: () => app.open({ kind: 'workers', settlement: st.id, colonist: i }),
    }, personPicture(c, 'var(--tile-figure-h)'), h('span', { class: 'standing' }, standingWords(c)), nowFigure(s, st, c)))),
    clerksNeed > 0 ? muted(`${plural(clerksNeed, 'clerk')} needed at this size; ${buildingWorkers(st, 'meeting') + buildingWorkers(st, 'press')} civic workers.`) : null,
    row(button('Assign all', () => app.dispatch({ t: 'autoAssign', settlement: st.id }, 'Assigned'), 'small'),
      button('Equip', () => app.open({ kind: 'equip', settlement: st.id }), 'small'),
      st.buildings.school > 0 ? button('School', () => app.open({ kind: 'educate', settlement: st.id }), 'small') : null,
      st.education ? muted(`schooling, ${st.education.turnsLeft} turns left`) : null),
  ))
  // the buildings, as their pictures, with who works in each and what it makes
  const held = BUILDING_LINES.filter(l => st.buildings[l] > 0)
  const outputs = buildingSlots(s, st)
  panel.append(section('Buildings',
    held.map(l => {
      const def = C.buildings.lines[l]
      const workers = buildingWorkers(st, l)
      const imported = st.imported[l]
      const slot = outputs.find(x => x.line === l)
      return h('div', { class: 'line in-building' },
        buildingPicture(l, 'var(--row-building-h)'),
        h('span', { class: 'l' }, h('span', { class: 'name' }, buildingName({ line: l, tier: st.buildings[l] as 1 | 2 | 3 })),
          def.output && slot ? fig(def.output, fmt(slot.output), `${def.output === 'frame' ? 'frame' : GOOD_NAMES[def.output].toLowerCase()} this turn`) : h('span', { class: 'muted small-role' }, describeLine(l)),
          imported ? muted(imported.starved > 0 ? ' starved of instruments' : ' imported') : ''),
        takesWorkers(l) ? h('span', { class: 'r' }, pips(workers, C.labour.workersPerBuilding, 'places'), h('span', { class: 'sr' }, `${workers} of ${C.labour.workersPerBuilding} workers`)) : null,
      )
    }),
    st.building ? h('div', { class: 'line in-building' }, buildingPicture(null, 'var(--row-building-h)'),
      h('span', { class: 'l' }, h('span', { class: 'name' }, 'Building ', buildingName(st.building.id)), fillBar(st.building.frame / Math.max(1, C.buildings.costs[st.building.id.tier]!.frame), 'plain', null, 'progress')),
      h('span', { class: 'r' }, fig('frame', `${st.building.frame}/${C.buildings.costs[st.building.id.tier]!.frame}`, 'frame'))) : muted(st.buildQueue.length ? '' : 'Nothing in the build order.'),
    row(button('Build order' + (st.buildQueue.length ? ` (${st.buildQueue.length})` : ''), () => app.open({ kind: 'build', settlement: st.id }), 'small'), st.buildings.wharf > 0 ? button('Hulls', () => app.open({ kind: 'hulls', settlement: st.id }), 'small') : null),
  ))
  // orders
  const o = st.orders
  panel.append(section('Standing orders',
    line([T(app, 'purpose'), ': ', o.purpose === 'ask' ? 'not set' : o.purpose], undefined, () => app.open({ kind: 'orders', settlement: st.id })),
    line([T(app, 'surplus'), ': above ', String(o.surplus.threshold), ', ', o.surplus.destination.kind === 'ship' ? `ship to ${s.settlements[o.surplus.destination.settlement]?.name ?? '?'}` : o.surplus.destination.kind === 'offer' ? `offer to ${s.predecessors[o.surplus.destination.predecessor]?.name ?? '?'}` : o.surplus.destination.kind], undefined, () => app.open({ kind: 'orders', settlement: st.id })),
    line([T(app, 'growth'), ': ', o.growth.kind === 'send' ? `send to ${s.settlements[o.growth.settlement]?.name ?? '?'}` : o.growth.kind], undefined, () => app.open({ kind: 'orders', settlement: st.id })),
  ))
  // passages: the Word held as a bar toward the next passage
  if (landing && landing.id === st.id) {
    const ch = s.charters[0]
    const wc = passageCost(s), gc = goldPassageCost(s)
    panel.append(section('Passages',
      h('div', { class: 'meter' }, fillBar(wc ? Math.min(1, ch.word / wc) : 0, 'plain', null, 'wide'),
        h('div', { class: 'meter-words' }, h('span', {}, icon('word', 'pill'), h('b', {}, fmt(ch.word)), ` Word of ${wc} for the next passage`))),
      muted(`Or ${gc} gold now. Word passages come by themselves when they can.`),
      row(button(`Buy a passage (${gc} gold)`, () => app.dispatch({ t: 'buyPassage' }, 'Passage bought'), 'small')),
    ))
  }
  // resolve as a bar with the flame, and the tick where the declaration can be made
  if (st.grievance > 0 || st.buildings.meeting > 0) {
    const gate = C.grievance.declarationGate
    panel.append(section('Grievance',
      h('div', { class: 'meter' }, fillBar(Math.min(1, st.resolve), 'plain', gate, 'wide resolve'),
        h('div', { class: 'meter-words' }, h('span', {}, icon('resolve', 'pill'), T(app, 'resolve'), ' ', h('b', {}, `${Math.round(st.resolve * 100)}%`)), h('span', { class: 'rule-at' }, h('i', { class: 'tick-key' }), `${Math.round(gate * 100)}% to declare`))),
      h('div', { class: 'meter-words' }, h('span', {}, icon('grievance', 'pill'), T(app, 'grievance'), ' gathered here ', h('b', {}, fmt(Math.round(st.grievance))))),
    ))
  }
  return panel
}

function renameSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const input = h('input', { type: 'text', value: st.name, maxlength: 24 }) as HTMLInputElement
  return h('div', { class: 'panel' }, header(app, 'Name the settlement'), input,
    row(button('Keep', () => { if (app.dispatch({ t: 'renameSettlement', settlement: st.id, name: input.value.trim() || st.name }, 'Renamed')) app.back() }, 'primary')))
}

// ---- assignment, without drag and drop -----------------------------------------------------------
// Settlement screen brief section 3. Two paths, both one tap to start. This is the first: tap the
// place, then tap the person. The second, tap the person then the place, lives on the settlement
// screen itself. Reassignment is the same gesture and offers a move or a swap.

// People as figures, build brief phase 3: each person is their figure, with their standing as
// chevrons at their feet and in a word, what they do now as an icon and a number, and then what
// they would do here and the actions.

/** What a colonist does now, as an icon and a number: what a tile gives them, what they make in a
 *  building with the building's name, or the word idle. */
function nowFigure(s: GameState, st: Settlement, c: Colonist): HTMLElement {
  if (c.job.kind === 'idle') return h('span', { class: 'now idle' }, 'idle')
  if (c.job.kind === 'tile') return h('span', { class: 'now' }, fig(c.job.good, String(tileYield(s, c.job.tile, c.job.good, c)), `${GOOD_NAMES[c.job.good].toLowerCase()} a turn`))
  const line = c.job.line
  const out = C.buildings.lines[line].output
  const name = buildingName({ line, tier: 1 })
  const mark = out ? fig(out, fmt(makesIn(s, st, c, line)), `${out === 'frame' ? 'frame' : GOOD_NAMES[out].toLowerCase()} a turn`) : LINE_ICONS[line] ? icon(LINE_ICONS[line]!, 'pill') : null
  return h('span', { class: 'now' }, mark, h('small', {}, name))
}

/** One person in a list: their figure, their standing in a word, what they do now, what they would
 *  make here if anything, and the actions at the end. */
function personRow(s: GameState, st: Settlement, c: Colonist, here: HTMLElement | null, actions: (HTMLElement | null)[], cls = ''): HTMLElement {
  return h('div', { class: 'line person-row' + (cls ? ' ' + cls : '') },
    personPicture(c, 'var(--row-figure-h)'),
    h('span', { class: 'l who' }, h('b', {}, standingWords(c)), nowFigure(s, st, c)),
    here ? h('span', { class: 'here' }, here) : null,
    h('span', { class: 'acts' }, ...actions),
  )
}

function candidateRow(app: App, s: GameState, st: Settlement, c: Candidate, made: GoodId | 'frame' | null, act: (swapWith?: number) => void, holders: { index: number; label: string }[]): HTMLElement {
  const right: HTMLElement[] = []
  if (holders.length === 0) right.push(button('Put here', () => act(), 'tiny'))
  else for (const hd of holders) right.push(button(c.colonist.job.kind === 'idle' ? `Take ${hd.label}'s place` : `Swap with ${hd.label}`, () => act(hd.index), 'tiny'))
  const here = made ? fig(made, fmt(c.amount), `${made === 'frame' ? 'frame' : GOOD_NAMES[made].toLowerCase()} a turn here`, 'would') : null
  return personRow(s, st, c.colonist, here, right)
}

function assignTileSheet(app: App, s: GameState, st: Settlement, tile: number, good?: TileGood): HTMLElement {
  if (!st || st.owner !== 0) return h('div', { class: 'panel' }, header(app, 'Not yours'))
  const cell = ringCells(s, st).find(x => x.tile === tile)
  if (!cell) return h('div', { class: 'panel' }, header(app, 'Out of reach'))
  const offers = tileGoodOrder(s, tile, cell.offers).filter(g => tileYield(s, tile, g, null) > 0)
  const chosen: TileGood | undefined = good ?? cell.worker?.good ?? offers[0]
  const holderIdx = st.colonists.findIndex(c => c.job.kind === 'tile' && c.job.tile === tile)
  const panel = h('div', { class: 'panel' }, heroHeader(app, chosen ? goodMark(chosen, 'hero') : h('span', {}), 'Who works this ground', cell.words))
  if (!chosen) { panel.append(h('p', { class: 'muted' }, 'Nothing grows or is dug here.')); return panel }
  if (cell.reason && !cell.available) panel.append(h('p', { class: 'warn' }, cell.reason))
  if (offers.length > 1) {
    panel.append(section('For what', h('div', { class: 'chips' }, offers.map(g => h('button', {
      class: 'chip' + (g === chosen ? ' on' : ''), type: 'button', 'aria-label': `${GOOD_NAMES[g]}, ${tileYield(s, tile, g, null)} a turn`,
      onClick: () => app.open({ kind: 'assignTile', settlement: st.id, tile, good: g }),
    }, goodMark(g, 'pill'), `${GOOD_NAMES[g]} ${tileYield(s, tile, g, null)}`)))))
  }
  const holders: { index: number; label: string }[] = holderIdx >= 0 ? [{ index: holderIdx, label: standingWords(st.colonists[holderIdx]) }] : []
  if (holderIdx >= 0) {
    panel.append(section('Working it now', personRow(s, st, st.colonists[holderIdx], null,
      [button('Leave it empty', () => { if (app.dispatch({ t: 'assignWorker', settlement: st.id, colonist: holderIdx, job: { kind: 'idle' } }, 'Set idle')) app.back() }, 'tiny ghost')], 'holder')))
  }
  const rows = tileCandidates(s, st, tile, chosen)
  panel.append(section('Best here first', ...(rows.length ? rows.map(c => candidateRow(app, s, st, c, chosen, (swapWith) => {
    app.assign(st.id, c.index, { kind: 'tile', tile, good: chosen }, `Set to ${chosen}`, swapWith)
  }, holders)) : [muted('Nobody else is here.')])))
  return panel
}

function assignBuildingSheet(app: App, s: GameState, st: Settlement, l: BuildingLine): HTMLElement {
  if (!st || st.owner !== 0) return h('div', { class: 'panel' }, header(app, 'Not yours'))
  const tier = st.buildings[l]
  if (tier === 0) return h('div', { class: 'panel' }, header(app, 'Not built here'))
  const def = C.buildings.lines[l]
  const name = buildingName({ line: l, tier: tier as 1 | 2 | 3 })
  const inside: { index: number; label: string }[] = []
  st.colonists.forEach((c, i) => { if (c.job.kind === 'building' && c.job.line === l) inside.push({ index: i, label: standingWords(c) }) })
  const full = inside.length >= C.labour.workersPerBuilding
  const panel = h('div', { class: 'panel' }, heroHeader(app, buildingPicture(l, 'var(--hero-box)'), `Who works the ${name.toLowerCase()}`, doesWhat(l)))
  if (!takesWorkers(l)) { panel.append(h('p', { class: 'muted' }, 'This one needs nobody.')); return panel }
  if (def.input && st.stock[def.input] <= 0) panel.append(h('p', { class: 'warn' }, `No ${GOOD_NAMES[def.input].toLowerCase()} in store, so it makes nothing this turn.`))
  if (inside.length) {
    panel.append(section('Inside now', ...inside.map(w => personRow(s, st, st.colonists[w.index], null,
      [button('Send out', () => { if (app.dispatch({ t: 'assignWorker', settlement: st.id, colonist: w.index, job: { kind: 'idle' } }, 'Set idle')) app.back() }, 'tiny ghost')], 'holder'))))
  }
  const rows = buildingCandidates(s, st, l)
  const made = def.output ?? null
  panel.append(section(full ? 'Full: someone must trade places' : 'Best here first',
    ...(rows.length ? rows.map(c => candidateRow(app, s, st, c, made, (swapWith) => {
      app.assign(st.id, c.index, { kind: 'building', line: l }, `Set to ${name}`, swapWith)
    }, full ? inside : [])) : [muted('Nobody else is here.')])))
  return panel
}

function goodActionsSheet(app: App, s: GameState, st: Settlement, g: GoodId): HTMLElement {
  if (!st || st.owner !== 0) return h('div', { class: 'panel' }, header(app, 'Not yours'))
  const cap = storageCapacity(st)
  const traded = C.market.goods[g].traded
  const ok = canConsign(s, st)
  const o = st.orders
  const others = s.settlements.filter(x => x.owner === 0 && x.id !== st.id)
  // food's store is the bank toward the next colonist, as the shelf has it; everything else is what
  // the storehouse holds against its capacity, with a tick where the surplus rule starts to sell
  const food = g === 'food'
  const held = food ? st.foodStore : st.stock[g]
  const whole = food ? C.labour.granaryThreshold : cap
  const rule = surplusRuleFor(st, g)
  const starts = ruleStarts(s, st, g)
  const state = !food && held > cap ? 'spoils' : !food && held >= STORE_WARM * cap ? 'warm' : 'plain'
  const panel = h('div', { class: 'panel' }, heroHeader(app, goodMark(g, 'hero'), [T(app, g, GOOD_NAMES[g])],
    food ? `${fmt(held)} banked of ${whole} toward the next colonist at ${st.name}` : `${fmt(held)} of ${whole} held at ${st.name}`))
  const store = h('div', { class: 'meter' },
    fillBar(held / whole, state, starts !== null ? Math.min(1, starts / whole) : null, 'wide'),
    h('div', { class: 'meter-words' },
      h('span', {}, food ? 'Banked' : 'Held', ' ', h('b', {}, fmt(held)), ` of ${whole}`),
      starts !== null ? h('span', { class: 'rule-at' }, h('i', { class: 'tick-key' }), `${RULE_VERBS[rule.destination.kind] ?? 'Sold'} from ${starts}`) : null,
    ))
  panel.append(store)
  if (traded) panel.append(h('div', { class: 'meter' },
    priceGauge(s, g, { wide: true }),
    h('div', { class: 'meter-words' }, h('span', {}, icon('coin', 'pill'), 'The Company pays ', h('b', {}, String(sellPrice(s, g))), ' and asks ', h('b', {}, String(buyPrice(s, g)))))))
  if (!food && st.stock[g] > cap) panel.append(h('p', { class: 'warn' }, 'Above the storage cap, so the excess spoils at the end of the turn.'))
  const acts = h('div', { class: 'row' })
  if (traded && ok.ok && st.stock[g] > 0) acts.append(button('Consign', () => app.open({ kind: 'consign', settlement: st.id, good: g }), 'primary'))
  if (traded && ok.ok) acts.append(button('Buy', () => app.open({ kind: 'buy', settlement: st.id, good: g }), 'small'))
  acts.append(button('Market', () => app.open({ kind: 'market', settlement: st.id }), 'small ghost'))
  panel.append(acts)
  if (!ok.ok && ok.reason) panel.append(muted(ok.reason))
  // this good's own surplus rule, over the settlement's: consign, hold, or send, above a threshold
  // of its own (DECISIONS.md 159). Clearing it puts the settlement's rule back
  const word = GOOD_NAMES[g].toLowerCase()
  const setRule = (r: GoodRule | null, label: string) => app.dispatch({ t: 'setGoodRule', settlement: st.id, good: g, rule: r }, label)
  const keep = (dest: SurplusDestination) => ({ destination: dest, ...(o.goods?.[g]?.threshold !== undefined ? { threshold: o.goods[g]!.threshold } : {}) })
  const on = (k: boolean) => 'chip' + (k ? ' on' : '')
  panel.append(section(`What ${st.name} does with its ${word}`,
    h('p', { class: 'muted' }, rule.own
      ? `A rule for ${word} alone: ${destinationWords(s, rule.destination)} above ${rule.threshold}.`
      : `The settlement's rule: ${destinationWords(s, rule.destination)} above ${rule.threshold}, ${word} included.`),
    h('div', { class: 'chips' },
      h('button', { class: on(rule.destination.kind === 'hold'), type: 'button', onClick: () => setRule(keep({ kind: 'hold' }), `Hold ${word}`) }, icon('crate', 'pill'), 'hold it'),
      h('button', { class: on(rule.destination.kind === 'consign'), type: 'button', onClick: () => setRule(keep({ kind: 'consign' }), `Consign ${word}`) }, icon('coin', 'pill'), 'consign it'),
      others.map(x => h('button', { class: on(rule.destination.kind === 'ship' && rule.destination.settlement === x.id), type: 'button', onClick: () => setRule(keep({ kind: 'ship', settlement: x.id }), `Send ${word} to ${x.name}`) }, `send to ${x.name}`)),
      peoplesInReach(s, st).map(pp => h('button', { class: on(rule.destination.kind === 'offer' && rule.destination.predecessor === pp.id), type: 'button', onClick: () => setRule(keep({ kind: 'offer', predecessor: pp.id }), `Offer ${word} to ${pp.name}`) }, `offer to ${pp.name}`)),
    ),
    h('div', { class: 'chips' }, SURPLUS_THRESHOLDS.map(th => h('button', { class: on(rule.own && rule.threshold === th), type: 'button', onClick: () => setRule({ destination: rule.destination, threshold: th }, `${GOOD_NAMES[g]} above ${th}`) }, `above ${th}`))),
    rule.own ? button(`Use the settlement's rule for ${word}`, () => setRule(null, `${GOOD_NAMES[g]}: the settlement's rule`), 'small ghost') : '',
    button('All the standing orders', () => app.open({ kind: 'orders', settlement: st.id }), 'small ghost'),
  ))
  return panel
}

/** What a surplus rule does at the tick on the store's bar, in a word. */
const RULE_VERBS: Partial<Record<SurplusDestination['kind'], string>> = { consign: 'Sold', ship: 'Sent on', offer: 'Offered' }

/** The surplus threshold chips, shared by the orders sheet and the good panel. */
const SURPLUS_THRESHOLDS = [20, 40, 60, 100, 150]

/** The predecessor peoples a settlement's surplus rule could offer to: within reach, and known. */
function peoplesInReach(s: GameState, st: Settlement) {
  return s.predecessors.filter(pp => pp.scouted && dist(s.world.width, st.tile, pp.tile) <= C.predecessors.offerReach)
}

/** A surplus destination in the player's words. */
export function destinationWords(s: GameState, d: SurplusDestination): string {
  switch (d.kind) {
    case 'consign': return 'consigned to the Company'
    case 'hold': return 'held'
    case 'ship': return `sent to ${s.settlements[d.settlement]?.name ?? 'a settlement that is gone'}`
    case 'offer': return `offered to ${s.predecessors[d.predecessor]?.name ?? 'a people'}`
    case 'ask': return 'asked about'
  }
}

/** One colonist's places, the other path into assignment (settlement screen brief section 3): every
 *  tile they could work, as what it gives them, best first, and every building that takes workers,
 *  as its picture with what they would make there and how many work there now. */
function workersSheet(app: App, s: GameState, st: Settlement, idx: number): HTMLElement {
  const c = st.colonists[idx]
  if (!c) return app.renderQueue()
  const w = s.world.width
  const panel = h('div', { class: 'panel' }, heroHeader(app, personPicture(c, 'var(--hero-box)'), personTitle(c), h('span', { class: 'figs' }, 'now', nowFigure(s, st, c))))
  const assign = (job: Colonist['job'], label: string) => { if (app.dispatch({ t: 'assignWorker', settlement: st.id, colonist: idx, job }, label)) app.back() }
  const options: { tile: number; good: TileGood; y: number; blocked: boolean; where: string }[] = []
  for (const t of workableTiles(s, st)) {
    const tile = s.world.tiles[t]
    const takenBy = st.colonists.findIndex((o, j) => j !== idx && o.job.kind === 'tile' && o.job.tile === t)
    const other = tile.worked !== null && tile.worked !== st.id
    const dx = (t % w) - (st.tile % w), dz = Math.floor(t / w) - Math.floor(st.tile / w)
    const dir = t === st.tile ? 'here' : `${dz < 0 ? 'N' : dz > 0 ? 'S' : ''}${dx < 0 ? 'W' : dx > 0 ? 'E' : ''}`
    for (const g of tileOffers(tile)) {
      const y = tileYield(s, t, g, c)
      if (y > 0) options.push({ tile: t, good: g, y, blocked: takenBy >= 0 || other, where: `${TERRAIN_NAMES[tile.terrain]}${tile.forest ? ', ' + FOREST_NAMES[tile.forest] : ''} ${dir}` })
    }
  }
  options.sort((a, b) => b.y - a.y)
  panel.append(section('On the land', ...options.map(o => line(
    [fig(o.good, String(o.y), `${GOOD_NAMES[o.good].toLowerCase()} a turn`), muted(` · ${o.where}`), o.blocked ? h('span', { class: 'warn' }, ' taken') : ''],
    undefined, o.blocked ? undefined : () => assign({ kind: 'tile', tile: o.tile, good: o.good }, `Set to ${o.good}`)))))
  const builds: HTMLElement[] = []
  for (const l of BUILDING_LINES) {
    if (st.buildings[l] === 0 || !takesWorkers(l)) continue
    const def = C.buildings.lines[l]
    const n = buildingWorkers(st, l) - (c.job.kind === 'building' && c.job.line === l ? 1 : 0)
    const full = n >= C.labour.workersPerBuilding
    const name = buildingName({ line: l, tier: st.buildings[l] as 1 | 2 | 3 })
    const makes = def.output ? fig(def.output, fmt(makesIn(s, st, c, l)), `${def.output === 'frame' ? 'frame' : GOOD_NAMES[def.output].toLowerCase()} a turn`) : h('span', { class: 'muted small-role' }, describeLine(l))
    builds.push(h('div', { class: 'line in-building' + (full ? '' : ' tappable'), onClick: full ? undefined : () => assign({ kind: 'building', line: l }, `Set to ${buildingName({ line: l, tier: 1 })}`) },
      buildingPicture(l, 'var(--row-building-h)'),
      h('span', { class: 'l' }, h('span', { class: 'name' }, name), makes, full ? h('span', { class: 'warn' }, ' full') : ''),
      h('span', { class: 'r' }, pips(n, C.labour.workersPerBuilding, 'places'), h('span', { class: 'sr' }, `${n} of ${C.labour.workersPerBuilding} at work`)),
    ))
  }
  panel.append(section('In a building', ...(builds.length ? builds : [muted('No building here takes workers yet.')])))
  panel.append(row(button('Leave idle', () => assign({ kind: 'idle' }, 'Set idle'), 'small ghost')))
  return panel
}

// ---- the build order: a catalogue --------------------------------------------------------------
// Build brief phase 3. What is under way leads, as the frame the map draws, with a bar for each cost
// and that cost's icon at the end of it; then what is queued, as the buildings' pictures in order;
// then everything that could be built, as a catalogue of cards two across: the building's picture,
// its name, what it turns into what as icons or its role in a word and an icon, and its cost as icons
// and numbers. A gated card is faint and gives its gate on tap.
function buildSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const panel = h('div', { class: 'panel' }, heroHeader(app, buildingPicture(null, 'var(--hero-box)'), 'Build order',
    h('span', { class: 'figs' }, `${st.name}`, fig('frame', fmt(st.frame), 'frame in store'), fig('tooling', fmt(st.stock.tooling), 'tooling in store'))))
  if (st.building) {
    const b = st.building
    const cost = C.buildings.costs[b.id.tier]!
    const bar = (name: 'frame' | 'tooling', have: number, need: number) => h('div', { class: 'cost-bar' },
      fillBar(need > 0 ? have / need : 1, 'plain', null, 'progress'), icon(name, 'pill'),
      h('span', {}, h('b', {}, fmt(have)), `/${need}`), h('span', { class: 'sr' }, ` ${name}`))
    panel.append(section('Under way', h('div', { class: 'underway' },
      buildingPicture(null, 'var(--underway-h)'),
      h('span', { class: 'what' }, h('span', { class: 'name' }, buildingName(b.id)), bar('frame', b.frame, cost.frame), cost.tooling ? bar('tooling', b.tooling, cost.tooling) : null),
    )))
  }
  panel.append(section('Queued', st.buildQueue.length ? h('div', { class: 'queued' }, st.buildQueue.map((b, i) => {
    const ok = canStart(st, b)
    const name = buildingName(b)
    return h('div', { class: 'qitem' + (ok.ok ? '' : ' blocked') },
      buildingPicture(b.line, 'var(--queued-h)'),
      h('span', { class: 'name' }, name),
      ok.ok ? null : h('span', { class: 'warn small-print' }, ok.reason ?? ''),
      h('button', { class: 'btn tiny ghost', type: 'button', 'aria-label': `Take ${name} out of the build order`, onClick: () => app.dispatch({ t: 'setBuildOrder', settlement: st.id, queue: st.buildQueue.filter((_, j) => j !== i) }, 'Removed from the build order') }, 'Remove'),
    )
  })) : muted('Nothing queued. The carpenter keeps making frame regardless.')))
  const options = catalogue(s, st)
  panel.append(section('Can be built', options.length ? h('div', { class: 'board catalogue' }, options.map(e => buildCard(app, st, e))) : muted('Nothing new can be built at this size.')))
  return panel
}

/** What a line does when it makes no good, as an icon where one fits. */
const LINE_ICONS: Partial<Record<BuildingLine, IconName>> = {
  meeting: 'grievance', press: 'grievance', school: 'colonist', storage: 'crate', stable: 'horses',
  wharf: 'sail', works: 'cannon', agentOffice: 'word', consignment: 'coin',
}

/** What a building turns into what, as icons with an arrow between, or its role in words with its
 *  icon. */
function doesWhat(l: BuildingLine): HTMLElement {
  const def = C.buildings.lines[l]
  if (def.output && def.input) {
    const words = `${GOOD_NAMES[def.input].toLowerCase()}${def.secondInput ? ` and ${GOOD_NAMES[def.secondInput].toLowerCase()}` : ''} to ${def.output === 'frame' ? 'frame' : GOOD_NAMES[def.output].toLowerCase()}`
    return h('span', { class: 'does', title: words }, goodMark(def.input, 'pill'), def.secondInput ? goodMark(def.secondInput, 'pill') : null, intoArrow(), goodMark(def.output, 'pill'), h('span', { class: 'sr' }, words))
  }
  const name = LINE_ICONS[l]
  return h('span', { class: 'does' }, name ? icon(name, 'pill') : null, describeLine(l))
}

/** One card of the catalogue. */
function buildCard(app: App, st: Settlement, e: CatalogueEntry): HTMLElement {
  const b = e.id
  const cost = C.buildings.costs[b.tier]!
  const name = buildingName(b)
  const price = b.imported
    ? [fig('coin', String(C.buildings.importedMachineGold), 'gold')]
    : [fig('frame', String(cost.frame), 'frame'), cost.tooling ? fig('tooling', String(cost.tooling), 'tooling') : null]
  const words = `${name}, ${b.imported ? `${C.buildings.importedMachineGold} gold` : `${cost.frame} frame${cost.tooling ? ` and ${cost.tooling} tooling` : ''}`}.${e.gate ? ` ${e.gate}` : b.imported ? ' Buy it now.' : ' Add it to the build order.'}`
  return h('button', {
    class: 'bcard' + (e.gate ? ' gated' : ''), type: 'button', 'aria-label': words,
    onClick: () => {
      if (e.gate) app.toast(e.gate)
      else if (b.imported) app.dispatch({ t: 'buyImported', settlement: st.id, line: b.line }, 'Imported machine bought')
      else app.dispatch({ t: 'setBuildOrder', settlement: st.id, queue: [...st.buildQueue, { line: b.line, tier: b.tier }] }, `${name} queued`)
    },
  },
    buildingPicture(b.line, 'var(--card-pic-h)'),
    h('span', { class: 'name' }, name),
    doesWhat(b.line),
    h('span', { class: 'cost' }, ...price),
  )
}

function describeLine(l: BuildingLine): string {
  switch (l) {
    case 'meeting': return 'gathers grievance'
    case 'press': return 'spreads grievance'
    case 'school': return 'raises standing'
    case 'storage': return 'raises the storage cap'
    case 'stable': return 'breeds horses'
    case 'wharf': return 'builds hulls, docks ships'
    case 'works': return 'defends the settlement'
    case 'agentOffice': return 'more Word per consignment'
    case 'consignment': return 'sells surplus by itself'
    default: return ''
  }
}

function ordersSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const o = st.orders
  const set = (rule: 'purpose' | 'surplus' | 'growth', value: unknown, label: string) => app.dispatch({ t: 'setStandingOrder', settlement: st.id, rule, value }, label)
  const others = s.settlements.filter(x => x.owner === 0 && x.id !== st.id)
  const panel = h('div', { class: 'panel' }, header(app, 'Standing orders', st.name),
    h('p', { class: 'muted' }, 'The settlement follows these by itself. Anything you set by hand is left alone.'))
  // a purpose that is a good wears its icon; industry the tooling it runs on, civic the grievance
  const purposeIcon = (p: Purpose): IconName => isGood(p) ? p : p === 'industry' ? 'tooling' : 'grievance'
  panel.append(section('Purpose', h('div', { class: 'chips' }, PURPOSES.map(p => h('button', { class: 'chip' + (o.purpose === p ? ' on' : ''), type: 'button', onClick: () => set('purpose', p, `Purpose: ${p}`) }, icon(purposeIcon(p), 'pill'), p)))))
  const thresholds = SURPLUS_THRESHOLDS
  const goodRules = Object.entries(o.goods ?? {}) as [GoodId, GoodRule][]
  panel.append(section('Surplus',
    h('div', { class: 'chips' }, thresholds.map(t => h('button', { class: 'chip' + (o.surplus.threshold === t ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, threshold: t }, `Surplus above ${t}`) }, `above ${t}`))),
    h('div', { class: 'chips' },
      h('button', { class: 'chip' + (o.surplus.destination.kind === 'consign' ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, destination: { kind: 'consign' } }, 'Surplus: consign') }, icon('coin', 'pill'), 'consign'),
      h('button', { class: 'chip' + (o.surplus.destination.kind === 'hold' ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, destination: { kind: 'hold' } }, 'Surplus: hold') }, icon('crate', 'pill'), 'hold'),
      others.map(x => h('button', { class: 'chip' + (o.surplus.destination.kind === 'ship' && o.surplus.destination.settlement === x.id ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, destination: { kind: 'ship', settlement: x.id } }, `Surplus: ship to ${x.name}`) }, `ship to ${x.name}`)),
      peoplesInReach(s, st).map(pp => h('button', { class: 'chip' + (o.surplus.destination.kind === 'offer' && o.surplus.destination.predecessor === pp.id ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, destination: { kind: 'offer', predecessor: pp.id } }, `Surplus: offer to ${pp.name}`) }, `offer to ${pp.name}`)),
    ),
    goodRules.length ? h('p', { class: 'muted' }, 'Rules for one good, set from the goods strip:') : '',
    ...goodRules.map(([g, r]) => line([h('span', { class: 'ic-word' }, goodMark(g), GOOD_NAMES[g]), muted(` · ${destinationWords(s, r.destination)} above ${r.threshold ?? o.surplus.threshold}`)], 'remove', () => app.dispatch({ t: 'setGoodRule', settlement: st.id, good: g, rule: null }, `${GOOD_NAMES[g]}: the settlement's rule`))),
  ))
  panel.append(section('Growth', h('div', { class: 'chips' },
    h('button', { class: 'chip' + (o.growth.kind === 'keep' ? ' on' : ''), type: 'button', onClick: () => set('growth', { kind: 'keep' }, 'Growth: keep') }, 'keep'),
    others.map(x => h('button', { class: 'chip' + (o.growth.kind === 'send' && o.growth.settlement === x.id ? ' on' : ''), type: 'button', onClick: () => set('growth', { kind: 'send', settlement: x.id }, `Growth: send to ${x.name}`) }, `send to ${x.name}`)),
  )))
  if (!o.reviewed) panel.append(row(button('These are fine', () => { if (app.dispatch({ t: 'reviewOrders', settlement: st.id }, 'Orders reviewed')) app.back() }, 'primary')))
  return panel
}

// ---- market ------------------------------------------------------------------------------------
// The market board, build brief phase 2: the goods as a grid of tiles, each the good's icon and
// name, what is held here, what the Company pays and asks beside the coin, and a gauge of where its
// price stands between its floor and its ceiling, so a dumped good is visibly dumped. Sell and Buy
// stay on the tile. The head carries the Company's banner in the Company's colour and its charge.
function marketSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const ok = canConsign(s, st)
  const loss = freightLoss(s, st)
  const charge = Math.round(s.company.charge * 100)
  const panel = h('div', { class: 'panel' }, heroHeader(app, icon('banner', 'tile', 'company-banner'),
    [T(app, 'company', 'The Company market')],
    `${st.name}${loss > 0 ? ` · freight takes ${Math.round(loss * 100)}%` : ''}`,
    h('span', { class: 'charge', onClick: () => app.open({ kind: 'glossary', key: 'charge' }) }, h('b', {}, `${charge}%`), h('small', {}, 'charge'))))
  if (!ok.ok) panel.append(h('p', { class: 'warn' }, ok.reason ?? 'Cannot consign from here.'))
  if (s.company.embargoed.length) panel.append(h('p', { class: 'warn' }, `Embargoed: ${s.company.embargoed.map(g => GOOD_NAMES[g].toLowerCase()).join(', ')}.`))
  const due = s.company.payments.filter(p => p.due > s.turn)
  if (due.length) panel.append(h('p', { class: 'muted on-water' }, icon('coin', 'pill'), `${due.reduce((a, p) => a + p.gold, 0)} gold on the water, due over ${plural(Math.max(...due.map(p => p.due - s.turn)), 'turn')}.`))
  const dumped = new Set(dumpedGoods(s).map(d => d.good))
  panel.append(h('div', { class: 'board' }, GOODS.filter(g => C.market.goods[g].traded).map(g => marketTile(app, s, st, g, ok.ok, dumped.has(g)))))
  return panel
}

/** One good on the market board. */
function marketTile(app: App, s: GameState, st: Settlement, g: GoodId, canTrade: boolean, dumped: boolean): HTMLElement {
  const emb = isEmbargoed(s, g)
  const held = st.stock[g]
  const sell = sellPrice(s, g), buy = buyPrice(s, g)
  const word = GOOD_NAMES[g].toLowerCase()
  return h('div', { class: 'mtile' + (dumped ? ' dumped' : '') + (emb ? ' embargoed' : '') },
    h('div', { class: 'mt-head' },
      goodMark(g, 'tile'),
      h('div', { class: 'mt-name' }, T(app, g, GOOD_NAMES[g]), h('span', { class: 'held' }, emb ? 'embargoed' : held > 0 ? `${fmt(held)} held` : 'none held')),
    ),
    // what it pays, large, and what it asks, small, each with its word, as the good's sheet says them
    h('div', { class: 'mt-price' }, icon('coin', 'pill'),
      h('span', { class: 'ask', 'aria-hidden': 'true' }, 'pays'), h('b', { 'aria-hidden': 'true' }, String(sell)),
      h('span', { class: 'ask', 'aria-hidden': 'true' }, `asks ${buy}`),
      h('span', { class: 'sr' }, ` The Company pays ${sell} a unit and asks ${buy}.`)),
    priceGauge(s, g),
    canTrade ? h('div', { class: 'mt-acts' },
      held > 0 && !emb ? h('button', { class: 'btn tiny', type: 'button', 'aria-label': `Sell ${word} at ${sell}`, onClick: () => app.open({ kind: 'consign', settlement: st.id, good: g }) }, 'Sell') : null,
      h('button', { class: 'btn tiny ghost', type: 'button', 'aria-label': `Buy ${word} at ${buy}`, onClick: () => app.open({ kind: 'buy', settlement: st.id, good: g }) }, 'Buy'),
    ) : null,
  )
}

/** What a trade comes to, as two figures: what goes and what comes back, each its icon and number. */
function deal(n: number, g: GoodId, gold: number, goldWords: string): HTMLElement {
  return h('div', { class: 'deal' },
    h('span', { class: 'side' }, h('b', {}, fmt(n)), goodMark(g, 'tile')),
    h('span', { class: 'side gold' }, icon('coin', 'tile'), h('b', {}, fmt(gold)), h('small', {}, goldWords)),
  )
}

function consignSheet(app: App, s: GameState, st: Settlement, g: GoodId): HTMLElement {
  const held = st.stock[g]
  let amount = Math.min(held, C.market.lotSize * 2)
  const smuggling = !!(s.declaration?.declared && !s.declaration.won)
  const rate = (1 - s.company.charge) * (1 - freightLoss(s, st)) * (smuggling ? C.market.smugglerRate : 1)
  const preview = h('div', { class: 'preview' })
  const slider = h('input', { type: 'range', min: 0, max: held, step: 1, value: amount, 'aria-label': `How much ${GOOD_NAMES[g].toLowerCase()} to consign` }) as HTMLInputElement
  const render = () => {
    // the market's own formula, lot by lot, on a copy: where the price would stand after this lot
    const p = consignPreview(s, g, amount)
    preview.replaceChildren(
      deal(amount, g, Math.round(p.gross * rate), `gold after the charge, due in ${plural(C.market.crossingTurns[s.settings.crossing], 'turn')}`),
      priceGauge(s, g, { ghost: amount > 0 ? p.after : null, wide: true }),
      h('div', { class: 'small-print' }, `Price ${p.first}${p.after !== p.first ? `, falling to ${p.after}` : ''}.`),
      p.after < p.first ? h('div', { class: 'warn small-print' }, `Each lot of ${C.market.lotSize} moves the price. ${amount > C.market.lotSize * 3 ? 'Sending less now and more later would earn more.' : ''}`) : h('div', { class: 'muted small-print' }, 'Below the volume that moves the price.'),
    )
    slider.value = String(amount)
  }
  slider.addEventListener('input', () => { amount = Number(slider.value); render() })
  render()
  const chips = h('div', { class: 'chips' }, [25, 50, 100, held].filter((v, i, a) => v > 0 && v <= held && a.indexOf(v) === i).map(v => h('button', { class: 'chip', type: 'button', onClick: () => { amount = v; render() } }, v === held ? `all ${held}` : String(v))))
  return h('div', { class: 'panel' }, heroHeader(app, goodMark(g, 'hero'), [T(app, 'consign'), ' ', GOOD_NAMES[g].toLowerCase()], `${held} held at ${st.name}`), preview, slider, chips,
    row(button('Consign', () => { if (amount > 0 && app.dispatch({ t: 'consign', settlement: st.id, good: g, amount }, `${amount} ${g} consigned`)) app.back() }, 'primary')))
}

function buySheet(app: App, s: GameState, st: Settlement, g: GoodId): HTMLElement {
  const price = buyPrice(s, g)
  const gold = s.charters[0].gold
  const can = Math.floor(gold / Math.max(1, price))
  let amount = Math.min(can, 10)
  const preview = h('div', { class: 'preview' })
  const slider = h('input', { type: 'range', min: 0, max: Math.max(1, can), step: 1, value: amount, 'aria-label': `How much ${GOOD_NAMES[g].toLowerCase()} to buy` }) as HTMLInputElement
  // buying from the Company does not move its price (buyFromCompany in src/sim/market.ts), so the
  // gauge has no ghost: it shows where the price stands, and what the Company asks above it
  const render = () => {
    preview.replaceChildren(
      deal(amount, g, amount * price, `gold of ${fmt(gold)}`),
      priceGauge(s, g, { wide: true }),
      h('div', { class: 'muted small-print' }, `The Company asks ${price}, ${price - sellPrice(s, g)} above what it pays. Buying does not move its price.`),
    )
  }
  slider.addEventListener('input', () => { amount = Number(slider.value); render() })
  render()
  return h('div', { class: 'panel' }, heroHeader(app, goodMark(g, 'hero'), ['Buy ', GOOD_NAMES[g].toLowerCase()], `${price} each from the Company`), preview, slider,
    row(button('Buy', () => { if (amount > 0 && app.dispatch({ t: 'buy', settlement: st.id, good: g, amount }, `${amount} ${g} bought`)) app.back() }, 'primary')))
}

/** Equip, build brief phase 3: who, as their figures, one chosen; and as what, as the units' own
 *  pictures with what each costs as icons, what it does, and its moves as pips. Equipment makes the
 *  unit, so the choice is a tap on the unit. */
function equipSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const kinds: LandKind[] = ['militia', 'outrider', 'battery', 'improver', 'hauler']
  const panel = h('div', { class: 'panel' }, heroHeader(app, unitPicture('militia', 'var(--hero-person)'), 'Equip a colonist',
    h('span', { class: 'figs' }, st.name, fig('arms', fmt(st.stock.arms), 'arms'), fig('horses', fmt(st.stock.horses), 'horses'), fig('tooling', fmt(st.stock.tooling), 'tooling'))),
    h('p', { class: 'muted' }, 'Equipment makes the unit. Take it off and the colonist is a colonist again.'))
  if (!st.colonists.length) { panel.append(muted('No one here to equip.')); return panel }
  let chosen = 0
  const who = h('div', { class: 'people' })
  const renderWho = () => who.replaceChildren(...st.colonists.map((c, i) => h('button', {
    class: 'person-tile' + (i === chosen ? ' on' : ''), type: 'button', 'aria-pressed': i === chosen ? 'true' : 'false',
    'aria-label': `${standingWords(c)}, ${jobWords(s, st, c)}`, onClick: () => { chosen = i; renderWho() },
  }, personPicture(c, 'var(--tile-figure-h)'), h('span', { class: 'standing' }, standingWords(c)), nowFigure(s, st, c))))
  renderWho()
  panel.append(section('Who', who))
  panel.append(section('As what', h('div', { class: 'board catalogue' }, kinds.map(k => {
    const cost = equipCost(k)
    const parts = Object.entries(cost) as [GoodId, number][]
    const short = parts.filter(([g, n]) => st.stock[g] < n).map(([g, n]) => `${n - st.stock[g]} ${GOOD_NAMES[g].toLowerCase()}`)
    const u = C.military.units[k as keyof typeof C.military.units] as { attack?: number; defence?: number; moves: number; capacity?: number }
    const does = k === 'battery' ? 'strong against settlements' : u.attack ? `attack ${u.attack}, defence ${u.defence}` : k === 'hauler' ? `carries ${u.capacity}` : 'roads, clearing, ploughing'
    const bare = unitLabel(k).replace(/^(A|An) /, '')
    const name = bare[0].toUpperCase() + bare.slice(1)
    return h('button', {
      class: 'bcard unit-card' + (short.length ? ' gated' : ''), type: 'button',
      'aria-label': `${name}: ${parts.map(([g, n]) => `${n} ${GOOD_NAMES[g].toLowerCase()}`).join(' and ') || 'nothing'}; ${does}; ${plural(u.moves, 'move')}.${short.length ? ` Short of ${short.join(' and ')}.` : ''}`,
      onClick: () => {
        if (short.length) { app.toast(`Short of ${short.join(' and ')}.`); return }
        if (app.dispatch({ t: 'equip', settlement: st.id, colonist: chosen, as: k }, `${k} equipped`)) app.back()
      },
    },
      unitPicture(k, 'var(--card-person)'),
      h('span', { class: 'name' }, name),
      h('span', { class: 'does' }, k === 'hauler' ? fig('crate', String(u.capacity), 'carried') : null, h('small', {}, `${k === 'hauler' ? '' : does + ', '}${plural(u.moves, 'move')}`)),
      h('span', { class: 'cost' }, ...parts.map(([g, n]) => fig(g, String(n), GOOD_NAMES[g].toLowerCase()))),
    )
  }))))
  return panel
}

/** The standing a colonist would be taught to, in a word. */
function taughtTo(c: Colonist): string {
  return c.standing === 'debtor' ? 'contracted' : c.standing === 'contracted' ? 'free' : c.standing === 'free' ? 'a master, if a master teaches' : 'already a master'
}

/** School, build brief phase 3: the people as their figures, each with what schooling would make of
 *  them; or the one being taught, with how far through they are. */
function educateSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const tier = st.buildings.school
  const cycle = C.labour.educationCycle[tier]
  const panel = h('div', { class: 'panel' }, heroHeader(app, buildingPicture('school', 'var(--hero-box)'), 'School',
    `${st.name} · ${tier ? buildingName({ line: 'school', tier: tier as 1 | 2 | 3 }) : 'no school'}, ${plural(cycle, 'turn')} a step`))
  const student = st.education ? st.colonists.find(c => c.id === st.education!.colonist) : undefined
  if (st.education && student) {
    const done = Math.max(0, cycle - st.education.turnsLeft)
    panel.append(section('Being taught', h('div', { class: 'line person-row' },
      personPicture(student, 'var(--row-figure-h)'),
      h('span', { class: 'l who' }, h('b', {}, standingWords(student)), h('span', { class: 'now' }, `to ${taughtTo(student)}`)),
      h('span', { class: 'r schooling' }, fillBar(cycle ? done / cycle : 0, 'plain', null, 'progress'), `${plural(st.education.turnsLeft, 'turn')} left`),
    )))
    return panel
  }
  panel.append(h('p', { class: 'muted' }, 'Schooling raises one colonist one standing. A master is made only from a colonist of free standing, by a master.'))
  panel.append(section('Who', ...st.colonists.map((c, i) => personRow(s, st, c, h('small', { class: 'muted' }, `to ${taughtTo(c)}`),
    [c.standing === 'master' ? null : button('Teach', () => { if (app.dispatch({ t: 'educate', settlement: st.id, colonist: i }, 'Schooling begun')) app.back() }, 'tiny')]))))
  return panel
}

/** Hulls, build brief phase 3: each hull as its own picture, at its size against the others, with its
 *  speed as pips beside the sail, its guns beside the cannon, its hold beside the crate, what it costs
 *  as icons, and the wharf it needs. A hull this wharf cannot lay down is faint and says why. */
function hullsSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const hulls: HullKind[] = ['lighter', 'trader', 'raider', 'cutter']
  const wharf = st.buildings.wharf
  const fastest = Math.max(...hulls.map(k => C.naval.hulls[k].speed))
  return h('div', { class: 'panel' }, heroHeader(app, buildingPicture('wharf', 'var(--hero-box)'), 'Hulls',
    `${st.name} · ${wharf ? buildingName({ line: 'wharf', tier: wharf as 1 | 2 | 3 }) : 'no wharf'}`),
    C.flags.naval ? null : notYet(app, 'Shipbuilding'),
    h('div', { class: 'hulls' }, hulls.map(k => {
      const d = C.naval.hulls[k]
      const parts = (Object.entries(d.cost) as [GoodId, number][]).filter(([, n]) => n > 0)
      const yard = buildingName({ line: 'wharf', tier: d.wharfTier as 1 | 2 | 3 })
      const short = parts.filter(([g, n]) => st.stock[g] < n).map(([g, n]) => `${n - st.stock[g]} ${GOOD_NAMES[g].toLowerCase()}`)
      const gate = wharf < d.wharfTier ? `Needs a ${yard.toLowerCase()}.` : short.length ? `Short of ${short.join(' and ')}.` : null
      const name = k[0].toUpperCase() + k.slice(1)
      return h('button', {
        class: 'hull-card' + (gate ? ' gated' : ''), type: 'button',
        'aria-label': `${name}: speed ${d.speed}, ${plural(d.guns, 'gun')}, holds ${d.capacity}; ${parts.map(([g, n]) => `${n} ${GOOD_NAMES[g].toLowerCase()}`).join(', ')}; at a ${yard.toLowerCase()}.${gate ? ' ' + gate : ' Lay it down.'}`,
        onClick: () => { if (gate) app.toast(gate); else app.dispatch({ t: 'buildHull', settlement: st.id, hull: k }, `${k} laid down`) },
      },
        unitPicture(k, 'var(--hull-person)'),
        h('span', { class: 'stats' },
          h('span', { class: 'name' }, T(app, 'hull', name)),
          h('span', { class: 'row-figs' }, icon('sail', 'pill'), pips(d.speed, fastest, 'speed')),
          h('span', { class: 'row-figs' }, fig('cannon', String(d.guns), 'guns'), fig('crate', String(d.capacity), 'hold')),
          h('span', { class: 'row-figs cost' }, ...parts.map(([g, n]) => fig(g, String(n), GOOD_NAMES[g].toLowerCase())), h('small', { class: 'muted' }, `at a ${yard.toLowerCase()}`)),
        ),
      )
    })))
}

// ---- units ------------------------------------------------------------------------------------
function unitSheet(app: App, s: GameState, u: Unit): HTMLElement {
  const w = s.world.width
  const here = s.settlements.find(x => x.tile === u.tile)
  const mine = u.owner === 0
  const lander = u.kind === 'lander'
  // its picture, whose it is, its quality, and its moves as pips: whole for the moves it has left
  const whose = lander || mine ? 'yours' : u.owner === -1 ? 'the Company' : s.charters[u.owner]?.name ?? 'a rival'
  const sub = h('span', { class: 'figs' }, whose,
    lander ? `${plural(u.aboard.length, 'colonist')} aboard` : h('span', {}, T(app, 'quality', u.quality)),
    !lander && u.colonist ? standingWords(u.colonist) : null,
    h('span', { class: 'moves' }, pips(u.moves, maxMoves(u), 'moves'), h('small', { 'aria-hidden': 'true' }, 'moves'), h('span', { class: 'sr' }, `${u.moves} of ${maxMoves(u)} moves left`)))
  const panel = h('div', { class: 'panel' }, heroHeader(app, unitPicture(u.kind, isHull(u.kind) || lander ? 'var(--hull-person)' : 'var(--hero-person)'), [T(app, u.kind, unitLabel(u.kind))], sub))
  if (!mine) { panel.append(muted(`Attack ${unitAttack(u, 'open')}, defence ${unitDefence(u, !!here)}.`)); return panel }
  // the route plotted for it, or why there is none; otherwise how to plot one. Feel brief section 4
  const r = app.route && app.route.unit === u.id && !('ashore' in app.route) ? app.route : null
  if (r) panel.append(routeBlock(app, s, u, r))
  else if (!lander) panel.append(h('p', { class: 'muted' }, u.kind === 'colonist' && s.units.some(x => x.owner === 0 && x.kind === 'lander' && neighbours8(w, s.world.height, x.tile).includes(u.tile))
    ? 'Press and hold where you want it to go, and let go to set off; hold the lander and let go to go back aboard.'
    : 'Press and hold where you want it to go. The way shows while you hold; let go to set off, or let go on the unit itself to stay.'))
  else if (!neighbours8(w, s.world.height, u.tile).some(n => isLand(s.world.tiles[n]))) {
    const turns = turnsToCoast(s)
    // once land is in sight the sheet says so rather than talking of a coast that cannot be seen
    const sight = sightMask(s)
    const landInSight = s.world.tiles.some((t, i) => sight[i] === 1 && t.terrain !== 'water')
    panel.append(h('p', { class: 'muted' }, landInSight
      ? 'Land in sight. Press and hold the water beside it: the course shows while you hold, and letting go sails it.'
      : `Open sea.${isFinite(turns) && turns > 0 ? ` The nearest coast you could found on is about ${plural(turns, 'turn')} away, though you cannot see it yet.` : ''} Press and hold where you want to go: the course shows while you hold, and letting go sails it.`))
  }
  if (lander) {
    // the lander's whole business is the shore beside it: where it can go ashore, what the ground
    // there would give, and the one control that founds. Interaction brief section 8
    panel.append(landerControls(app, s, u))
    const aboard = aboardSection(app, s, u)
    if (aboard) panel.append(aboard)
  }
  const actions: HTMLElement[] = []
  if (u.kind === 'colonist' && !here) {
    // a colonist founds where it stands, once the lander has founded the first settlement
    const own = s.settlements.some(x => x.owner === 0)
    const problem = foundingProblem(s, u.tile)
    const focused = app.foundTarget === u.tile
    if (!own) actions.push(muted('The lander founds the first settlement. Beach it first; a colonist may found after that.'))
    else if (!focused) actions.push(button('Found a settlement here', () => app.setFoundTarget(u.tile), 'small'))
    else actions.push(foundPreview(app, s, u.tile, problem, () => app.found(u.id, u.tile)))
  }
  if (here && here.owner === 0) {
    if (u.colonist) actions.push(button(u.kind === 'colonist' ? 'Join the settlement' : 'Stand down', () => app.dispatch({ t: 'disband', unit: u.id }, u.kind === 'colonist' ? 'Joined' : 'Stood down'), 'small'))
    if (cargoCapacity(u) > 0 || Object.keys(u.cargo).length) actions.push(button('Cargo', () => app.open({ kind: 'cargo', id: u.id }), 'small'))
  }
  if (u.kind === 'improver' && !here) {
    const t = s.world.tiles[u.tile]
    if (!t.road) actions.push(button('Build a road', () => app.dispatch({ t: 'improve', unit: u.id, task: 'road' }, 'Road begun'), 'small'))
    if (t.forest) actions.push(button('Clear the forest', () => app.dispatch({ t: 'improve', unit: u.id, task: 'clear' }, 'Clearing begun'), 'small'))
    if (!t.forest && !t.improved && t.terrain !== 'water' && t.terrain !== 'mountain') actions.push(button('Plough', () => app.dispatch({ t: 'improve', unit: u.id, task: 'plough' }, 'Ploughing begun'), 'small'))
    if (u.order && u.order.kind === 'improve') actions.push(muted(`Working: ${u.order.tasks[0]?.task ?? ''}, ${u.progress} done`))
  }
  const adjPred = s.predecessors.find(p => Math.abs((p.tile % w) - (u.tile % w)) <= 1 && Math.abs(Math.floor(p.tile / w) - Math.floor(u.tile / w)) <= 1)
  if (adjPred) actions.push(button(`${adjPred.name}`, () => app.open({ kind: 'predecessor', id: adjPred.id }), 'small'))
  if (u.kind !== 'colonist' && u.kind !== 'hauler' && u.kind !== 'improver' && !isHull(u.kind)) {
    if (here && here.owner === 0) actions.push(button(u.order?.kind === 'garrison' ? 'Garrisoned' : 'Garrison here', () => app.dispatch({ t: 'setUnitOrder', unit: u.id, order: u.order?.kind === 'garrison' ? null : { kind: 'garrison', settlement: here.id } }, 'Order set'), 'small'))
  }
  // orders that outlast the turn (DECISIONS.md 161): a haul circuit for anything that carries, a
  // patrol for anything armed on land. Planning is a mode: taps on the map add stops, Save sets it
  if (cargoCapacity(u) > 0 && u.kind !== 'lander') actions.push(button(u.order?.kind === 'haul' ? 'Change the haul circuit' : 'Plan a haul circuit', () => app.beginAuthoring(u.id, 'haul'), 'small'))
  if (isArmed(u.kind) && !isHull(u.kind) && u.kind !== 'battery' && u.kind !== 'damagedBattery') actions.push(button(u.order?.kind === 'patrol' ? 'Change the patrol' : 'Plan a patrol', () => app.beginAuthoring(u.id, 'patrol'), 'small'))
  if (u.order && u.order.kind === 'haul') actions.push(muted(`On a circuit of ${u.order.stops.length}: ${u.order.stops.map(st => s.settlements[st.settlement]?.name ?? '?').join(', ')}. Posture: ${RISK_WORDS[u.order.risk]}.`))
  if (u.order && u.order.kind !== 'garrison') actions.push(button(STOP_LABELS[u.order.kind] ?? 'Stop', () => app.dispatch({ t: 'setUnitOrder', unit: u.id, order: null }, 'Order cleared'), 'small ghost'))
  if (u.kind === 'colonist' && !u.order) actions.push(button('Explore by itself', () => app.dispatch({ t: 'setUnitOrder', unit: u.id, order: { kind: 'explore' } }, 'Exploring'), 'small ghost'))
  // what it carries, as icons with amounts, and a bar for how full its hold is; the lander's detail
  // keeps to what sailing and founding need, so its stores are one quiet line
  const cargo = (Object.entries(u.cargo) as [GoodId, number][]).filter(([, n]) => n)
  if (lander && cargo.length) panel.append(h('p', { class: 'muted small' }, 'Carrying ' + cargo.map(([g, n]) => `${n} ${GOOD_NAMES[g].toLowerCase()}`).join(', ') + '.'))
  else if (cargo.length || cargoCapacity(u) > 0) panel.append(holdBlock(u, cargo))
  if (actions.length) panel.append(section('Do', ...actions))
  return panel
}

/** A hold: what is in it as icons with amounts, and a bar for how full it is. */
function holdBlock(u: Unit, cargo: [GoodId, number][]): HTMLElement {
  const cap = cargoCapacity(u)
  const carried = cargo.reduce((a, [, n]) => a + n, 0)
  return h('div', { class: 'meter hold' },
    h('div', { class: 'goods-row' }, cargo.length ? cargo.map(([g, n]) => fig(g, fmt(n), GOOD_NAMES[g].toLowerCase())) : muted('The hold is empty.')),
    fillBar(cap ? carried / cap : 0, carried > cap ? 'spoils' : 'plain', null, 'wide'),
    h('div', { class: 'meter-words' }, h('span', {}, icon('crate', 'pill'), 'Holds ', h('b', {}, fmt(carried)), ` of ${cap}`)))
}

/** The route in the sheet: where it goes as far as the player knows, how many turns and where they
 *  end, an attack's odds and what it would start. There is no control here: the release is the
 *  commit (DECISIONS.md 163). Or, where there is no way, why. */
function routeBlock(app: App, s: GameState, u: Unit, r: RoutePlan): HTMLElement {
  void app
  if (!r.ok) {
    // the shore beside the lander is not a place to sail to but the place to found: the founding
    // control below is already looking at it
    if (r.shore !== null) return h('div', { class: 'preview' }, h('div', { class: 'big' }, 'Found here'), h('div', {}, r.words))
    return h('div', { class: 'preview none' }, h('div', { class: 'big warn' }, 'Not there'), h('div', {}, r.words))
  }
  const t = s.world.tiles[r.end]
  const known = !C.flags.fogOfWar || t.explored
  const afloat = u.kind === 'lander' || isHull(u.kind)
  const ds = known ? s.settlements.find(x => x.tile === r.end && x.owner === 0) : undefined
  const blind = r.unseen.some(Boolean)
  const turns = r.turnEnds.length
  const lines: string[] = []
  let title: string
  if (r.kind === 'attack') {
    title = `Attack ${r.target}`
    lines.push(r.odds === null ? 'The odds cannot be known until they are in sight.' : r.odds >= 0.995 ? 'Nothing there can stand against it.' : `It wins about ${oddsWords(r.odds).toLowerCase()} times.`)
    if (r.path.length) lines.push(r.arrives === 1 ? `It closes in ${plural(r.path.length, 'tile')} and attacks this turn.` : `It takes ${plural(r.arrives, 'turn')} to close in, then stops beside them: the attack waits for you to hold again.`)
    if (r.declares !== null) lines.push(`This is a declaration of war on ${s.charters[r.declares].name}.`)
  } else if (r.kind === 'board') {
    title = 'Back aboard the lander'
    lines.push(r.arrives === 1 ? 'It goes aboard this turn.' : `It reaches the lander in ${plural(r.arrives, 'turn')}, and goes aboard then.`)
  } else {
    title = ds ? `To ${ds.name}` : !known ? 'Into the fog' : t.terrain === 'water' ? 'Across open water' : `To ${TERRAIN_NAMES[t.terrain]}`
    lines.push(turns <= 1 ? `${plural(r.path.length, 'tile')}, this turn.` : `${plural(r.path.length, 'tile')}, ${turns} turns: the numbers mark where each turn ends.`)
  }
  if (r.startsNextTurn) lines.push('It has no moves left this turn, so it sets off next turn.')
  if (blind) lines.push(afloat ? 'Through water nobody has seen: it stops at any coast it meets.' : 'Through ground nobody has seen: it stops where the ground will not let it on.')
  return h('div', { class: 'preview' + (r.kind === 'attack' ? ' attack' : '') },
    h('div', { class: 'big' }, title),
    ...lines.map(l => h('div', {}, l)))
}

/** What the control that clears a standing order says, in the order's own plain words. */
const STOP_LABELS: Record<string, string> = {
  goto: 'Stop going there',
  explore: 'Stop exploring',
  patrol: 'Stop the patrol',
  haul: 'Stop the haul route',
  improve: 'Stop the work',
  reserve: 'Leave the reserve',
  screen: 'Stop screening',
}

/** Which way from one tile to another, in a word. */
function bearing(w: number, from: number, to: number): string {
  const dx = (to % w) - (from % w), dz = Math.floor(to / w) - Math.floor(from / w)
  const ns = dz < 0 ? 'north' : dz > 0 ? 'south' : ''
  const ew = dx < 0 ? 'west' : dx > 0 ? 'east' : ''
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'here'
}

/** The shore beside the lander, and the founding control for whichever bit of it is in focus. */
function landerControls(app: App, s: GameState, u: Unit): HTMLElement {
  const w = s.world.width, h2 = s.world.height
  const shore = neighbours8(w, h2, u.tile).filter(n => isLand(s.world.tiles[n]))
  const box = h('div', { class: 'section' })
  if (!shore.length) return box
  const first = !s.settlements.some(x => x.owner === 0)
  const target = app.foundTarget !== null && shore.includes(app.foundTarget) ? app.foundTarget : null
  box.append(h('div', { class: 'section-title' }, 'The shore'))
  box.append(h('div', { class: 'chips' }, shore.map(t => {
    const look = tileLook(s, t)
    return h('button', { class: 'chip' + (t === target ? ' on' : ''), type: 'button', onClick: () => app.setFoundTarget(t) }, `${bearing(w, u.tile, t)}: ${tileWords(look).toLowerCase()}`)
  })))
  if (target === null) {
    box.append(muted(first ? 'Pick the shore to beach on. Everyone aboard becomes the settlement, and the boat stays on the water.' : 'Pick the shore to beach on.'))
    return box
  }
  const problem = foundingProblem(s, target)
  box.append(foundPreview(app, s, target, problem, () => app.found(u.id, target), first ? `Beach the lander and found ${C.lander.firstName}` : 'Beach the lander and found a settlement'))
  return box
}

/** Who is aboard the lander, in the order they would step off. Any of them can be chosen, and a hold
 *  on the shore beside the lander, let go, then sends them ashore, the way a colonist beside it is
 *  sent aboard by holding the lander. With nobody chosen, a hold on the shore is the lander's own:
 *  the founding preview, and Found here on the card. Feel brief section 3. */
function aboardSection(app: App, s: GameState, u: Unit): HTMLElement | null {
  if (!u.aboard.length) return null
  const w = s.world.width, h2 = s.world.height
  const shore = neighbours8(w, h2, u.tile).some(n => isLand(s.world.tiles[n]) && s.world.tiles[n].explored && s.world.tiles[n].terrain !== 'mountain')
  const n = u.aboard.length
  return section(`Aboard, ${n}`,
    ...u.aboard.map((c, k) => ({ c, k })).reverse().map(({ c, k }) => h('div', { class: 'line person-row' },
      personPicture(c, 'var(--row-figure-h)'),
      h('span', { class: 'l who' }, h('b', {}, standingWords(c)), k === n - 1 && n > 1 ? h('span', { class: 'now' }, 'next off') : null),
      shore ? h('span', { class: 'acts' }, button('Choose', () => app.choosePassenger(u.id, k), 'tiny')) : null)),
    muted(shore ? 'Choose one, then hold the shore beside the lander and let go to send them ashore. The aboard count on the card chooses the next one off.' : 'Beside a shore, any of them can be sent ashore to look about.'),
  )
}

/** The ring a settlement founded at `tile` would work, and the control that founds it, or the reason
 *  it cannot be founded there: mountain, water, or too close to which settlement. */
function foundPreview(app: App, s: GameState, tile: number, problem: string | null, found: () => void, label = 'Found a settlement here'): HTMLElement {
  const cells = ringPreview(s, tile)
  const ring = h('div', { class: 'st-ring compact' }, ...cells.map(c => {
    if (c.tile === null || !c.look) return h('div', { class: 'cell dim', 'aria-label': c.words }, h('div', { class: 'label' }, c.words))
    const el = h('div', { class: 'cell' + (c.reason && !c.centre ? ' bad' : ''), 'aria-label': `${c.words}${c.best ? `, ${goodWord(c.best.good as GoodId)} ${c.best.yield}` : ''}` }, ...terrainLayers(c.look))
    if (c.centre) el.append(h('div', { class: 'centre' }, problem ? '✕' : '●'))
    else if (c.best && !c.reason) el.append(h('div', { class: 'label' }, goodMark(c.best.good, 'pill'), h('b', {}, String(c.best.yield))))
    return el
  }))
  const yields = cells.filter(c => c.best && !c.reason && !c.centre).reduce((acc, c) => { acc[c.best!.good] = (acc[c.best!.good] ?? 0) + c.best!.yield; return acc }, {} as Partial<Record<TileGood, number>>)
  const best = (Object.entries(yields) as [TileGood, number][]).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 4)
  const words = best.map(([g, v]) => `${v} ${GOOD_NAMES[g].toLowerCase()}`).join(', ')
  const about = h('div', { class: 'about' })
  if (problem) {
    about.append(h('div', { class: 'big warn' }, 'Not here'), h('p', { class: 'muted' }, `${problem[0].toUpperCase()}${problem.slice(1)}. ${problem.startsWith('too close') ? 'Two settlements need two clear tiles between them.' : ''}`))
  } else {
    const t = s.world.tiles[tile]
    about.append(h('div', { class: 'big' }, tileWords(tileLook(s, tile))))
    if (best.length) about.append(h('div', { class: 'goods-row', role: 'img', 'aria-label': `Its best work: ${words}.` }, best.map(([g, v]) => h('span', { class: 'fig' }, goodMark(g, 'pill'), h('b', {}, String(v))))))
    about.append(h('p', { class: 'muted' }, `${best.length ? '' : 'Little to work here.'}${t.river ? ' Fresh water.' : ''}${neighbours8(s.world.width, s.world.height, tile).some(n => s.world.tiles[n].terrain === 'water') ? ' On the coast, so ships and freight landers come to it.' : ' Inland: it will haul to the coast.'}`.trim()))
    about.append(button(label, found, 'primary'))
  }
  return h('div', { class: 'found' }, ring, about)
}

function stackSheet(app: App, s: GameState, tile: number): HTMLElement {
  const units = s.units.filter(u => u.tile === tile && u.owner === 0)
  if (units.length === 1) { app.scene.cam.view.activeUnit = units[0].id; return unitSheet(app, s, units[0]) }
  const here = s.settlements.find(x => x.tile === tile)
  // each unit as the map draws it, with its quality and what it carries in words and its moves as pips
  return h('div', { class: 'panel' }, header(app, here ? `At ${here.name}` : 'On this tile', plural(units.length, 'unit')),
    ...units.map(u => h('div', { class: 'line tappable in-building', role: 'button', 'aria-label': `${unitLabel(u.kind)}, ${u.quality}, ${u.moves} of ${maxMoves(u)} moves. Choose it.`, onClick: () => app.select(u.id) },
      unitPicture(u.kind, isHull(u.kind) ? 'var(--hull-person)' : 'var(--row-figure-h)'),
      h('span', { class: 'l' }, h('b', {}, unitLabel(u.kind)), muted(`${u.quality}${u.colonist ? ', ' + standingWords(u.colonist) : ''}`)),
      h('span', { class: 'r' }, u.order ? u.order.kind : pips(u.moves, maxMoves(u), 'moves')))))
}

/** Cargo, build brief phase 3: the hold as a bar, and the goods to unload and to load as their icons
 *  with amounts, one tap each. */
function cargoSheet(app: App, s: GameState, u: Unit): HTMLElement {
  const here = s.settlements.find(x => x.tile === u.tile && x.owner === 0)
  const cap = cargoCapacity(u)
  const cargo = (Object.entries(u.cargo) as [GoodId, number][]).filter(([, n]) => n)
  const carried = cargo.reduce((a, [, n]) => a + n, 0)
  const panel = h('div', { class: 'panel' }, heroHeader(app, unitPicture(u.kind, isHull(u.kind) ? 'var(--hull-person)' : 'var(--hero-person)'), 'Cargo', `${unitLabel(u.kind)} · ${carried} of ${cap}`), holdBlock(u, cargo))
  if (!here) { panel.append(muted('Load and unload at a settlement.')); return panel }
  const chip = (g: GoodId, n: number, verb: string, act: () => void) => h('button', { class: 'chip good-chip', type: 'button', 'aria-label': `${verb} ${n} ${GOOD_NAMES[g].toLowerCase()}`, onClick: act }, goodMark(g, 'pill'), h('b', {}, fmt(n)))
  panel.append(section('Unload', cargo.length ? h('div', { class: 'chips' }, cargo.map(([g, n]) => chip(g, n, 'Unload', () => app.dispatch({ t: 'unload', unit: u.id, good: g, amount: n }, `${n} ${g} unloaded`)))) : muted('Nothing aboard.')))
  const room = cap - carried
  panel.append(section('Load from ' + here.name, h('div', { class: 'chips' }, GOODS.filter(g => here.stock[g] > 0).map(g => chip(g, here.stock[g], 'Load up to', () => app.dispatch({ t: 'load', unit: u.id, good: g, amount: Math.min(here.stock[g], room) }, `${g} loaded`)))),
    room <= 0 ? muted('The hold is full.') : null))
  return panel
}

// ---- tiles ------------------------------------------------------------------------------------
/** The place itself, small, as the map draws it: the ring's picture of the tile and the eight round
 *  it (Scene.drawRing), cropped to the tile in the middle and a little of its neighbours. Where the
 *  renderer cannot draw, the tile's own swatch in the map's palette. */
function placePicture(app: App, s: GameState, tile: number): HTMLElement {
  const box = h('span', { class: 'place' })
  const across = 3 + 2 * RING_PICTURE.margin
  const zoom = across / PLACE_TILES_SHOWN
  box.style.setProperty('--place-zoom', zoom.toFixed(4))
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const px = ringPixels(PLACE_BOX_REM * rem * zoom)
  // drawn once for what it shows, so a sheet drawn again after a tap draws nothing: the tile, the
  // turn, the size, the renderer's epoch, and the units and people in sight of it
  const w = s.world.width
  const near = new Set([tile, ...neighbours8(w, s.world.height, tile)])
  const key = [s.seed, tile, s.turn, px, app.scene.epoch,
    s.units.filter(u => near.has(u.tile)).map(u => `${u.id}.${u.kind}.${u.tile}`).sort().join(','),
    s.settlements.filter(x => near.has(x.tile)).map(x => `${x.id}.${x.colonists.length}`).join(',')].join('|')
  let canvas = places.get(key) ?? null
  if (canvas) { places.delete(key); places.set(key, canvas) }
  else if (app.scene.canDraw) {
    canvas = app.scene.drawRing(tile, px)
    // one taken while a move is drawn shows it half way: shown, not kept
    if (canvas && !app.scene.moving) {
      places.set(key, canvas)
      while (places.size > RING_PICTURES_KEPT) places.delete(places.keys().next().value as string)
    }
  }
  if (canvas) box.append(canvas)
  else box.append(h('span', { class: 'cell' }, ...terrainLayers(tileLook(s, tile))))
  return box
}

/** The places drawn for sheets, most recently used last. */
const places = new Map<string, HTMLCanvasElement>()

function tileSheet(app: App, s: GameState, tile: number): HTMLElement {
  const t = s.world.tiles[tile]
  const w = s.world.width
  const x = tile % w, z = Math.floor(tile / w)
  if (C.flags.fogOfWar && !t.explored) {
    // nothing is known of it but where it is and whatever of yours stands on it
    const panel = h('div', { class: 'panel' }, header(app, 'Unexplored', `${x}, ${z}`), h('p', { class: 'muted' }, 'Nothing is known of this ground yet. Sail or walk toward it and it will show itself.'))
    const own = s.units.filter(u => u.tile === tile && u.owner === 0)
    if (own.length) panel.append(section('Here', ...own.map(u => line([unitLabel(u.kind)], 'select', () => app.select(u.id)))))
    return panel
  }
  const title = t.forest ? `${TERRAIN_NAMES[t.terrain]}, ${FOREST_NAMES[t.forest]}` : TERRAIN_NAMES[t.terrain]
  const bits: string[] = []
  if (t.river === 2) bits.push('on a major river'); else if (t.river === 1) bits.push('by a river')
  if (t.road) bits.push('road')
  if (t.improved) bits.push('ploughed')
  if (t.prime && (t.prime !== 'seam' || t.goldReserve > 0)) bits.push(PRIME_NAMES[t.prime] ?? t.prime)
  if (t.workings) bits.push('old workings')
  const owner = t.owner !== null ? s.charters[t.owner] : null
  const pred = s.predecessors.find(p => p.territory.includes(tile))
  const panel = h('div', { class: 'panel' }, heroHeader(app, placePicture(app, s, tile), title, `${x}, ${z}${bits.length ? ' · ' + bits.join(', ') : ''}`))
  const yields = tileOffers(t).map(g => ({ g, y: tileYield(s, tile, g, null) })).filter(e => e.y > 0).sort((a, b) => b.y - a.y)
  panel.append(section('Yields', yields.length ? h('div', { class: 'chips' }, yields.map(e => h('button', {
    class: 'chip good-chip', type: 'button', 'aria-label': `${GOOD_NAMES[e.g]}, ${e.y} a turn`, onClick: () => app.open({ kind: 'glossary', key: e.g }),
  }, goodMark(e.g, 'pill'), h('b', {}, String(e.y)), h('span', { class: 'word' }, GOOD_NAMES[e.g])))) : muted('Nothing to work here.')))
  if (owner) panel.append(muted(`${owner.player ? 'Your' : owner.name + "'s"} ground.`))
  if (pred) panel.append(line([T(app, 'predecessor', pred.name), muted(' ground')], 'open', () => app.open({ kind: 'predecessor', id: pred.id })))
  const st = s.settlements.find(x => x.tile === tile)
  if (st) panel.append(line([st.owner === 0 ? st.name : `${st.name} (${s.charters[st.owner]?.name})`], st.owner === 0 ? 'open' : `${st.abstractPop} people`, st.owner === 0 ? () => app.open({ kind: 'settlement', id: st.id }) : undefined))
  const units = s.units.filter(u => u.tile === tile && app.scene.unitPositions.has(u.id))
  if (units.length) panel.append(section('Here', ...units.map(u => line([unitLabel(u.kind), muted(` · ${u.owner === 0 ? 'yours' : u.owner === -1 ? 'the Company' : s.charters[u.owner]?.name}`)], u.owner === 0 ? 'select' : `${unitAttack(u, 'open')}/${unitDefence(u, !!st)}`, u.owner === 0 ? () => app.select(u.id) : undefined))))
  // assign a worker from a settlement in reach
  const reach = s.settlements.filter(x => x.owner === 0 && workableTiles(s, x).includes(tile))
  for (const r of reach) {
    const worked = r.colonists.findIndex(c => c.job.kind === 'tile' && c.job.tile === tile)
    if (worked >= 0) panel.append(line([`Worked by a ${colonistLabel(r.colonists[worked])} from ${r.name}`], 'change', () => app.open({ kind: 'workers', settlement: r.id, colonist: worked })))
    else if (yields.length) {
      const idle = r.colonists.findIndex(c => c.job.kind === 'idle')
      const pickFrom = idle >= 0 ? idle : 0
      if (r.colonists.length) panel.append(section(`From ${r.name}`, ...yields.map(e => line([`Work ${GOOD_NAMES[e.g]} here`], idle >= 0 ? 'with an idle colonist' : `with a ${colonistLabel(r.colonists[0])}`, () => app.dispatch({ t: 'assignWorker', settlement: r.id, colonist: pickFrom, job: { kind: 'tile', tile, good: e.g } }, `Set to ${e.g}`)))))
    }
  }
  return panel
}

// ---- company, glossary, dispatch ------------------------------------------------------------------
function demandSheet(app: App, s: GameState): HTMLElement {
  const d = s.company.demand
  if (!d) return h('div', { class: 'panel' }, header(app, 'No demand'), muted('The Company is not asking for anything at present.'))
  const left = d.turnOffered + C.market.demandDeadline - s.turn
  return h('div', { class: 'panel' }, heroHeader(app, icon('coin', 'hero'), [T(app, 'demand', 'A demand from the Company')], `${plural(Math.max(0, left), 'turn')} to answer; silence is acceptance`),
    h('p', {}, `The Company asks that the charge rise by ${Math.round(d.rise * 100)} points, to ${Math.round((s.company.charge + d.rise) * 100)} per cent of everything you consign.`),
    h('p', { class: 'muted' }, `Refuse and the Company will not buy ${GOOD_NAMES[d.good]} for a time, and the refusal is remembered as grievance.`),
    row(button('Accept', () => { if (app.dispatch({ t: 'answerDemand', accept: true }, 'Demand accepted')) app.back() }, 'small'), button('Refuse', () => { if (app.dispatch({ t: 'answerDemand', accept: false }, 'Demand refused')) app.back() }, 'danger')))
}

/** The glossary's entries that are something the player could see or hold, by the icon that draws
 *  them; every good is its own. */
const TERM_PICTURES: Record<string, IconName> = {
  word: 'word', passage: 'word', grievance: 'grievance', resolve: 'resolve', colonist: 'colonist', frame: 'frame',
  signatory: 'seal', charter: 'banner', company: 'banner', storage: 'crate', spoilage: 'crate', hull: 'sail',
  declaration: 'resolve', fleet: 'cannon', consign: 'coin', charge: 'coin',
}

function glossarySheet(app: App, s: GameState, key: string): HTMLElement {
  const t = term(key)
  if (!t) return h('div', { class: 'panel' }, header(app, key), muted('No entry.'))
  const state = t.state ? t.state(s) : ''
  const name: IconName | null = isGood(key) ? key : key === 'turn' || key === 'season' ? SEASON_ICONS[season(s.turn)] : TERM_PICTURES[key] ?? null
  const head = name ? heroHeader(app, icon(name, 'tile', name === 'banner' ? 'company-banner' : ''), t.title) : header(app, t.title)
  return h('div', { class: 'panel' }, head, h('p', {}, app.withTerms(t.text)), state ? h('p', { class: 'state' }, state) : null,
    h('div', { class: 'chips' }, Object.keys(TERMS).filter(k => k !== key).slice(0, 60).map(k => h('button', { class: 'chip small', type: 'button', onClick: () => app.open({ kind: 'glossary', key: k }) }, TERMS[k].title))))
}

function dispatchSheet(app: App, s: GameState): HTMLElement {
  const entries = s.dispatch.slice(-40).reverse()
  return h('div', { class: 'panel' }, header(app, [T(app, 'dispatch', 'The dispatch')], 'what moved, newest first'),
    entries.length ? entries.map(d => {
      const lead = dispatchIcon(s, d.kind, d.text)
      const el = h('div', { class: 'card small-card ' + d.kind + (lead ? ' led' : '') })
      const main = h('div', { class: 'card-main' })
      if (lead) el.append(h('span', { class: 'card-lead' }, lead))
      el.append(main)
      main.append(h('div', { class: 'card-body' }, muted(`Turn ${d.turn} · `), app.withTerms(d.text)))
      if (d.why) { const why = h('div', { class: 'why' }, d.why); why.style.display = 'none'; main.append(button('Why', () => { why.style.display = why.style.display === 'none' ? 'block' : 'none' }, 'tiny ghost'), why) }
      if (d.settlement !== undefined && s.settlements[d.settlement]) main.append(button(s.settlements[d.settlement].name, () => { app.focus(s.settlements[d.settlement!].tile); if (s.settlements[d.settlement!].owner === 0) app.open({ kind: 'settlement', id: d.settlement! }) }, 'tiny ghost'))
      return el
    }) : muted('Nothing yet.'))
}

/** What each kind of signatory seeks, as the icon that stands for it: trade the coin, land the
 *  sprout, arms the rifle, voice the letter. */
const SEEK_ICONS: Record<SignatoryCategory, IconName> = { trade: 'coin', land: 'sprout', arms: 'arms', voice: 'word' }

/** The signatories, build brief phase 4: twelve seals in a row, whole for those who have signed and
 *  faint for those who have not; the grievance toward the next name as a bar; what is sought, with
 *  its icon; and each of the twelve led by a seal of their own. */
function signatoriesSheet(app: App, s: GameState): HTMLElement {
  const ch = s.charters[0]
  const list = signatoryList()
  const signed = ch.signatories.length
  const panel = h('div', { class: 'panel' }, heroHeader(app, icon('seal', 'hero'), [T(app, 'signatory', 'Signatories')], `${signed} of twelve have signed`))
  if (!list.length) { panel.append(notYet(app, 'Recruiting signatories')); return panel }
  panel.append(h('div', { class: 'meter' }, sealRow(signed, list.length)))
  if (signed < list.length) {
    const cost = signatoryCost(signed)
    panel.append(h('div', { class: 'meter' }, fillBar(Math.min(1, ch.grievance / cost), 'plain', null, 'wide progress'),
      h('div', { class: 'meter-words' }, h('span', {}, icon('grievance', 'pill'), h('b', {}, fmt(Math.round(ch.grievance))), ` of ${cost} grievance toward the next name`))))
  }
  panel.append(section('Seeking', h('div', { class: 'chips' }, (['trade', 'land', 'arms', 'voice'] as const).map(c => h('button', {
    class: 'chip' + (ch.signatoryTarget === c ? ' on' : ''), type: 'button', onClick: () => app.dispatch({ t: 'setSignatoryTarget', category: c }, `Seeking ${c}`),
  }, icon(SEEK_ICONS[c], 'pill'), c)))))
  panel.append(section('The twelve', ...list.map(e => {
    const has = ch.signatories.includes(e.index)
    return h('div', { class: 'line signatory' + (has ? ' signed' : '') },
      icon('seal', 'tile', has ? 'whole' : 'faint'),
      h('span', { class: 'l' }, h('b', {}, e.name), h('span', { class: 'what' }, icon(SEEK_ICONS[e.category], 'pill'), e.effect)),
      h('span', { class: 'r' }, has ? 'signed' : muted(e.category)),
    )
  })))
  return panel
}

const RISK_WORDS: Record<'avoid' | 'run' | 'escort', string> = {
  avoid: 'avoid: wait while anything hostile is near',
  run: 'run: go on regardless',
  escort: 'escort: wait for an armed unit to stand with it',
}

/** The stops of a haul circuit being planned, each with what it loads and unloads, and the risk
 *  posture for the whole route. Nothing here is written until Save on the card. */
function authoringSheet(app: App, s: GameState, a: Authoring): HTMLElement {
  const panel = h('div', { class: 'panel' }, header(app, 'The haul circuit', `${a.stops.length} ${a.stops.length === 1 ? 'stop' : 'stops'} so far · tap the map to add more`))
  const goods = (st: Settlement) => GOODS.filter(g => st.stock[g] > 0 || a.stops.some(x => (x.load[g] ?? 0) > 0))
  a.stops.forEach((stop, i) => {
    const st = s.settlements[stop.settlement]
    if (!st) return
    const rows: HTMLElement[] = []
    for (const g of goods(st)) {
      const loading = (stop.load[g] ?? 0) > 0, unloading = (stop.unload[g] ?? 0) > 0
      const set = (what: 'load' | 'unload' | 'leave') => {
        delete stop.load[g]; delete stop.unload[g]
        if (what === 'load') stop.load[g] = HAUL_ALL
        if (what === 'unload') stop.unload[g] = HAUL_ALL
        app.renderSheet()
      }
      rows.push(h('div', { class: 'line' },
        h('span', { class: 'l' }, h('span', { class: 'ic-word' }, goodMark(g), GOOD_NAMES[g]), muted(` · ${st.stock[g]} here`)),
        h('span', { class: 'chips' },
          h('button', { class: 'chip small' + (loading ? ' on' : ''), type: 'button', onClick: () => set(loading ? 'leave' : 'load') }, 'load'),
          h('button', { class: 'chip small' + (unloading ? ' on' : ''), type: 'button', onClick: () => set(unloading ? 'leave' : 'unload') }, 'unload'),
        )))
    }
    panel.append(section(`${i + 1}. ${st.name}`,
      rows.length ? h('p', { class: 'muted' }, 'Load takes all of a good there is room for; unload leaves all of it.') : muted('Nothing in store here yet; set what to unload when it has something.'),
      ...rows,
      button('Take this stop off', () => { a.stops.splice(i, 1); app.renderSheet(); app.renderQueueBar(); app.paintCircuit() }, 'small ghost'),
    ))
  })
  panel.append(section('Risk posture', h('p', { class: 'muted' }, 'Decided once for the route, not once per encounter.'),
    h('div', { class: 'chips' }, (['avoid', 'run', 'escort'] as const).map(r => h('button', { class: 'chip' + (a.risk === r ? ' on' : ''), type: 'button', onClick: () => { a.risk = r; app.renderSheet() } }, RISK_WORDS[r])))))
  panel.append(row(button('Save the circuit', () => { if (app.saveAuthoring()) app.back() }, 'primary'), button('Cancel', () => app.cancelAuthoring(), 'ghost')))
  return panel
}

/** "All of it": a load or unload amount larger than any cargo. */
const HAUL_ALL = 9999

function predecessorSheet(app: App, s: GameState, id: number): HTMLElement {
  const p = s.predecessors[id]
  if (!p) return app.renderQueue()
  const u = s.units.find(x => x.id === app.scene.cam.view.activeUnit && x.owner === 0)
  const w = s.world.width
  const adjacent = u ? Math.abs((p.tile % w) - (u.tile % w)) <= 1 && Math.abs(Math.floor(p.tile / w) - Math.floor(u.tile / w)) <= 1 : false
  // led by the crop they teach; what they want and what they have as icons (build brief phase 4)
  const panel = h('div', { class: 'panel' }, heroHeader(app, goodMark(p.teaches, 'hero'), [T(app, 'predecessor', p.name)],
    h('span', { class: 'figs' }, h('span', {}, 'teaches ', h('span', { class: 'ic-word' }, goodMark(p.teaches), GOOD_NAMES[p.teaches].toLowerCase())), p.taught ? muted('taught') : null)))
  panel.append(section('They want', h('div', { class: 'wants' },
    h('span', { class: 'most' }, goodMark(p.strong, 'tile'), h('span', {}, h('b', {}, GOOD_NAMES[p.strong]), h('small', {}, 'most'))),
    ...p.minor.map(g => h('span', { class: 'also' }, goodMark(g, 'tile'), h('span', {}, GOOD_NAMES[g], h('small', {}, 'too')))))))
  const alarmWord = p.alarm > 0.66 ? 'high' : p.alarm > 0.33 ? 'rising' : 'low'
  panel.append(h('div', { class: 'meter' }, fillBar(Math.min(1, p.alarm), p.alarm > C.predecessors.alarmRefuse ? 'spoils' : p.alarm > 0.33 ? 'warm' : 'plain', C.predecessors.alarmRefuse, 'wide'),
    h('div', { class: 'meter-words' }, h('span', {}, T(app, 'alarm'), ' ', h('b', {}, alarmWord)), h('span', { class: 'rule-at' }, h('i', { class: 'tick-key' }), 'they stop trading'))))
  if (p.agent) panel.append(muted('An agent of yours is stationed here.'))
  if (!C.flags.predecessors) panel.append(notYet(app, 'Trading and learning with predecessor peoples'))
  // what they have to give in kind, and what the unit beside them could offer, for gold or for goods
  const store = (Object.entries(predecessorStore(p)) as [GoodId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  if (store.length) panel.append(section('They have', h('div', { class: 'chips' }, store.map(([g, n]) => h('span', { class: 'chip good-chip' }, goodMark(g, 'pill'), h('b', {}, fmt(n)), h('span', { class: 'word' }, GOOD_NAMES[g].toLowerCase()))))))
  if (u && adjacent) {
    const goods = (Object.entries(u.cargo).filter(([, n]) => n) as [GoodId, number][]).filter(([g]) => C.market.goods[g].predecessor || g === 'metal' || g === 'tooling' || g === 'arms' || g === 'horses')
    const carries = cargoCapacity(u) > 0
    const rows: HTMLElement[] = []
    for (const [g, n] of goods) {
      const forGold = offerTerms(s, p, u, g, n, null)
      const same = p.lastBought === g
      rows.push(line(['Offer ', fig(g, fmt(n), GOOD_NAMES[g].toLowerCase()), same ? h('span', { class: 'warn' }, ' they took that last time') : ''], same ? '' : fig('coin', String(forGold.gold), 'gold'), same ? undefined : () => app.dispatch({ t: 'offer', unit: u.id, predecessor: p.id, good: g, amount: n, haggle: false }, 'Offered')))
      if (!same && carries) for (const [want] of store) {
        if (want === g) continue
        const terms = offerTerms(s, p, u, g, n, want)
        if (terms.inKind <= 0) continue
        rows.push(line([muted('  for '), fig(want, fmt(terms.inKind), GOOD_NAMES[want].toLowerCase()), terms.gold > 0 ? h('span', {}, muted(' and '), fig('coin', String(terms.gold), 'gold')) : ''], 'barter', () => app.dispatch({ t: 'offer', unit: u.id, predecessor: p.id, good: g, amount: n, haggle: false, want }, `Offered for ${GOOD_NAMES[want].toLowerCase()}`)))
      }
    }
    panel.append(section(`With your ${unitLabel(u.kind)}`,
      ...rows,
      goods.length && !carries ? muted('Goods in kind need something that carries: a hauler or a hull.') : '',
      u.kind === 'colonist' && !p.taught ? button(`Learn ${p.teaches}`, () => app.dispatch({ t: 'learn', unit: u.id, predecessor: p.id }, 'Learning'), 'small') : null,
      u.kind === 'colonist' && !p.agent ? button('Station as agent', () => app.dispatch({ t: 'stationAgent', unit: u.id, predecessor: p.id }, 'Stationed'), 'small ghost') : null,
    ))
  } else panel.append(muted('Bring a unit next to them to trade, learn or station an agent. A hauler or a hull can take goods in kind.'))
  return panel
}

/** The other charters, build brief phase 4: each led by its banner in its own colour, its relation
 *  as a marker on a three step track, and its settlements as a number. */
function rivalsSheet(app: App, s: GameState): HTMLElement {
  return h('div', { class: 'panel' }, heroHeader(app, icon('banner', 'hero'), [T(app, 'rival', 'The other charters')], 'peace, tense or war with each'),
    h('div', { class: 'rivals' }, s.charters.slice(1).map(c => {
      const n = s.settlements.filter(x => x.owner === c.id).length
      const banner = icon('banner', 'tile')
      banner.style.color = c.colour
      return h('div', { class: 'rival' },
        banner,
        h('span', { class: 'who' }, h('b', {}, c.name), c.fell ? muted('fell to its Company') : c.independent ? muted('independent') : null),
        relationTrack(c.relation),
        h('span', { class: 'count' }, h('b', {}, String(n)), h('small', {}, n === 1 ? 'settlement' : 'settlements')),
      )
    })),
    C.flags.rivals ? null : notYet(app, 'Rival expansion and diplomacy'))
}

/** At most this many hulls stand for the recall fleet's strength, one each; past it, a number. */
const FLEET_SHIPS_DRAWN = 12

/** The declaration, build brief phase 4: resolve as a bar with the flame and a tick at the threshold
 *  it needs; the recall fleet's strength as small hulls, one each up to a dozen and then a number;
 *  once declared, each wave as its soldiers and when it lands. */
function declarationSheet(app: App, s: GameState): HTMLElement {
  const ch = s.charters[0]
  const mine = s.settlements.filter(x => x.owner === 0)
  const pop = mine.reduce((a, st) => a + st.colonists.length, 0)
  const resolve = pop ? mine.reduce((a, st) => a + st.resolve * st.colonists.length, 0) / pop : 0
  const gate = C.grievance.declarationGate
  const d = s.declaration
  const panel = h('div', { class: 'panel' }, heroHeader(app, icon('resolve', 'hero'), [T(app, 'declaration', 'The declaration')], d?.declared ? 'Declared' : resolve >= gate ? 'It can be made when you are ready' : 'Not yet within reach'))
  panel.append(h('div', { class: 'meter' }, fillBar(Math.min(1, resolve), resolve >= gate ? 'warm' : 'plain', gate, 'wide resolve'),
    h('div', { class: 'meter-words' }, h('span', {}, icon('resolve', 'pill'), T(app, 'resolve'), ' ', h('b', {}, `${Math.round(resolve * 100)}%`), ' across your settlements'),
      h('span', { class: 'rule-at' }, h('i', { class: 'tick-key' }), `${Math.round(gate * 100)}% needed`))))
  const strength = Math.round(s.company.fleetStrength)
  const drawn = Math.min(strength, FLEET_SHIPS_DRAWN)
  const fleet = h('div', { class: 'fleet', role: 'img', 'aria-label': `The recall fleet's strength is ${strength}.` })
  for (let k = 0; k < drawn; k++) fleet.append(unitPicture('companyShip', 'var(--fleet-person)'))
  if (strength > FLEET_SHIPS_DRAWN) fleet.append(h('b', { class: 'more' }, `${strength} in all`))
  panel.append(section('The recall fleet', fleet, h('div', { class: 'meter-words' }, h('span', {}, 'Strength ', h('b', {}, String(strength)), '. It grows with every grievance gathered.'))))
  if (d?.declared) {
    panel.append(section('The war', ...d.waves.map(wv => h('div', { class: 'line wave' },
      h('span', { class: 'l' }, h('b', {}, `Wave ${wv.id}`), h('span', { class: 'soldiers' }, wv.units.map(u => unitPicture(u.kind, 'var(--wave-person)')))),
      h('span', { class: 'r' }, wv.landed ? 'landed' : `lands in ${plural(wv.turnsToLand, 'turn')}`))),
      muted(`Intervention ${Math.round(d.interventionProgress)}`)))
  } else {
    panel.append(h('p', { class: 'muted' }, 'Tearing up the charter ends consignments at the full rate and brings the fleet. It is never forced, and it can wait until you are ready.'))
    if (C.flags.fleet) panel.append(row(button('Declare', () => app.dispatch({ t: 'declare' }, 'Declared'), 'danger')))
    else panel.append(notYet(app, 'The declaration and the recall fleet'))
  }
  panel.append(h('div', { class: 'figs foot' },
    h('span', {}, icon('seal', 'pill'), plural(ch.signatories.length, 'signatory', 'signatories')),
    h('span', {}, icon('grievance', 'pill'), `${fmt(Math.round(ch.grievanceTotal))} grievance gathered in all`)))
  return panel
}

// ---- menu, settings, new game ----------------------------------------------------------------------
function menuSheet(app: App, s: GameState): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: '.txt,.json,.fairholm,text/plain,application/json', style: { display: 'none' }, onChange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) app.importSave(f) } }) as HTMLInputElement
  return h('div', { class: 'panel' }, header(app, 'Fairholm', `seed ${s.seed} · ${s.settings.size} ${s.settings.shape} · ${s.settings.difficulty}`),
    section('Look at',
      line(['Signatories'], `${s.charters[0].signatories.length}/12`, () => app.open({ kind: 'signatories' })),
      line(['The declaration'], '', () => app.open({ kind: 'declaration' })),
      line(['The other charters'], '', () => app.open({ kind: 'rivals' })),
      line(['The dispatch'], '', () => app.open({ kind: 'dispatch' })),
      line(['Glossary'], '', () => app.open({ kind: 'glossary', key: 'queue' })),
    ),
    section('Map',
      h('div', { class: 'chips' }, (['none', 'territory', 'yields', 'threat'] as const).map(m => h('button', { class: 'chip' + (app.scene.overlayMode === m ? ' on' : ''), type: 'button', onClick: () => { app.scene.setOverlay(m, s); app.renderSheet() } }, m === 'none' ? 'plain' : m))),
      row(button('Overview', () => app.scene.glideTo(app.homeTile(), C.feel.zoom.overview), 'small'), button('Home', () => app.scene.glideTo(app.homeTile(), C.feel.zoom.working), 'small')),
    ),
    section('Game',
      row(button('Settings', () => app.open({ kind: 'settings' }), 'small'), button('Save now', () => { app.save(); app.toast('Saved') }, 'small'),
        button('Export', async () => { try { const r = await Save.shareExport(s); app.toast(r === 'shared' ? 'Shared' : 'Downloaded') } catch (e) { app.toast('Could not export: ' + (e as Error).message) } }, 'small'),
        button('Import', () => fileInput.click(), 'small'), fileInput),
      row(button('New game', () => app.open({ kind: 'newgame' }), 'small ghost')),
      muted(Telemetry.summary()),
    ),
  )
}

function settingsSheet(app: App, s: GameState): HTMLElement {
  const order: Difficulty[] = ['generous', 'standard', 'hard', 'punitive']
  const cur = order.indexOf(s.settings.difficulty)
  return h('div', { class: 'panel' }, header(app, 'Settings'),
    section('Turns', muted('Whether turns run on by themselves while nothing new needs you. Any touch stops them.'), h('div', { class: 'chips' },
      h('button', { class: 'chip' + (s.settings.autoTurns !== false ? ' on' : ''), type: 'button', onClick: () => app.dispatch({ t: 'setAutoTurns', on: true }) }, 'run on'),
      h('button', { class: 'chip' + (s.settings.autoTurns === false ? ' on' : ''), type: 'button', onClick: () => app.dispatch({ t: 'setAutoTurns', on: false }) }, 'wait for me'))),
    section('Pace', muted('How much the queue shows before folding.'), h('div', { class: 'chips' }, (['light', 'normal', 'all'] as const).map(p => h('button', { class: 'chip' + (s.settings.pace === p ? ' on' : ''), type: 'button', onClick: () => app.dispatch({ t: 'setPace', pace: p }) }, p)))),
    section('The charter terms', muted('Can be eased at any time, never tightened.'), h('div', { class: 'chips' }, order.map((d, i) => h('button', { class: 'chip' + (i === cur ? ' on' : '') + (i > cur ? ' off' : ''), type: 'button', onClick: () => { if (i < cur) app.dispatch({ t: 'lowerDifficulty', difficulty: d }) } }, d)))),
    section('Music', row(button(s.settings.audio.on ? 'Pause' : 'Play', () => app.music.toggleOn(), 'small'), button(s.settings.audio.muted ? 'Unmute' : 'Mute', () => app.music.toggleMute(), 'small'), button('Next track', () => app.music.skip(), 'small'))),
  )
}

function newGameSheet(app: App, s: GameState): HTMLElement {
  const last = Save.readLastSettings() ?? {}
  let size: MapSize = (last.size as MapSize) ?? 'small'
  let shape: LandShape = (last.shape as LandShape) ?? 'continent'
  let difficulty: Difficulty = (last.difficulty as Difficulty) ?? (s.settings.firstGame ? 'generous' : 'standard')
  const sizes: MapSize[] = ['small', 'standard', 'large', 'massive']
  const shapes: LandShape[] = ['continent', 'coast', 'archipelago']
  const diffs: Difficulty[] = ['generous', 'standard', 'hard', 'punitive']
  const chips = (opts: string[], get: () => string, set: (v: string) => void) => {
    const el = h('div', { class: 'chips' })
    const render = () => el.replaceChildren(...opts.map(o => h('button', { class: 'chip' + (get() === o ? ' on' : ''), type: 'button', onClick: () => { set(o); render() } }, o + (o === 'massive' ? ' (untested)' : ''))))
    render()
    return el
  }
  return h('div', { class: 'panel' }, header(app, 'A new charter'),
    h('p', { class: 'muted' }, 'The game in progress is kept until you go ashore in the new one.'),
    section('Map', chips(sizes, () => size, v => { size = v as MapSize }), chips(shapes, () => shape, v => { shape = v as LandShape })),
    section('Charter terms', chips(diffs, () => difficulty, v => { difficulty = v as Difficulty })),
    row(button('Begin', () => app.newGame({ size, shape, difficulty }), 'primary')))
}

function intentSheet(app: App, s: GameState): HTMLElement {
  const input = h('input', { type: 'text', value: s.intent, maxlength: 80 }) as HTMLInputElement
  return h('div', { class: 'panel' }, header(app, [T(app, 'intent', 'Objective')]), input,
    row(button('Keep', () => { if (app.dispatch({ t: 'setIntent', text: input.value.trim() || s.intent })) app.back() }, 'primary')))
}

function groupSheet(app: App, group: string): HTMLElement {
  const g = [...app.queue.shown, ...app.queue.folded].find(x => x.group === group)
  if (!g) return app.renderQueue()
  return h('div', { class: 'panel' }, header(app, g.title),
    ...g.items.map(it => {
      const lead = queueIcon(app.state, it.group, it.key)
      const main = h('div', { class: 'card-main' }, h('div', { class: 'card-title' }, it.title), h('div', { class: 'card-body' }, app.withTerms(it.body)))
      const card = h('div', { class: 'card small-card' + (lead ? ' led' : '') }, lead ? h('span', { class: 'card-lead' }, lead) : null, main)
      const actions = h('div', { class: 'card-actions' })
      for (const c of it.choices) actions.append(button(c.label, () => app.dispatch(c.action as Action, c.label), 'small'))
      actions.append(button('Open', () => app.openItem(it), 'small ghost'))
      main.append(actions)
      return card
    }))
}

/** What needs the player at one settlement: every problem its screen's note line counts, as the queue
 *  shows it, each with its fix and the place to go to change it by hand. A fix taken is gone from
 *  the list at once; an empty list says so. */
function problemsSheet(app: App, s: GameState, id: number): HTMLElement {
  const st = s.settlements[id]
  if (!st) return app.renderQueue()
  const problems = settlementProblems(s, st)
  const panel = h('div', { class: 'panel' }, header(app, `What needs you at ${st.name}`))
  if (!problems.length) { panel.append(muted('Nothing here needs you.')); return panel }
  for (const p of problems) {
    const it = { key: p.key, group: p.group, type: p.type, title: p.title, body: p.body, settlement: p.settlement, unit: p.unit, tile: p.tile, magnitude: p.magnitude, since: s.turn, choices: p.choices, opens: p.opens }
    const lead = queueIcon(s, p.group, p.key)
    const typeClass = ['', 'loss', 'company', 'stuck', 'idle', 'chance'][p.type]
    const main = h('div', { class: 'card-main' }, h('div', { class: 'card-title' }, p.title), h('div', { class: 'card-body' }, app.withTerms(p.body)))
    const actions = h('div', { class: 'card-actions' })
    for (const c of p.choices) actions.append(button(c.label, () => app.dispatch(c.action as Action, c.label), 'small'))
    if (p.opens && p.opens !== 'settlement') actions.append(button('Open', () => app.openItem(it), 'small ghost'))
    main.append(actions)
    panel.append(h('div', { class: `card small-card ${typeClass}` + (lead ? ' led' : '') }, lead ? h('span', { class: 'card-lead' }, lead) : null, main))
  }
  return panel
}

function foldSheet(app: App): HTMLElement {
  return h('div', { class: 'panel' }, header(app, [T(app, 'fold', 'Folded beneath')]), ...app.queue.folded.map(g => app.renderGroup(g)))
}
