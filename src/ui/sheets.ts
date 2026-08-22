// The sheets. Each is a function of the app and a spec, returning DOM for the bottom third.
// Everything that changes state goes through app.dispatch, so it is undoable and never a dialog.

import type { GameState, Settlement, Unit, Colonist, GoodId, BuildId, BuildingLine, TileGood, LandKind, Purpose, HullKind, Difficulty, MapSize, LandShape } from '../sim/state'
import { GOODS, BUILDING_LINES } from '../sim/state'
import { C } from '../sim/constants'
import { unitLabel } from '../sim/queue'
import { workableTiles, tileOffers, tileYield, passageCost, goldPassageCost, buildingWorkers, foodBalance, workerOutput, landingSettlement, clerksRequired } from '../sim/labour'
import { previewProduction, buildable, buildingName, storageCapacity, isCoastalSettlement, canStart } from '../sim/settlement'
import { sellPrice, buyPrice, canConsign, isEmbargoed, freightLoss, recompute } from '../sim/market'
import { maxMoves, cargoCapacity, equipCost, isHull, unitAttack, unitDefence } from '../sim/units'
import { signatoryList } from '../sim/grievance'
import { term, TERMS } from './glossary'
import { h, button, row, muted, fmt, signed, plural } from './dom'
import * as Save from '../io/save'
import * as Telemetry from '../io/telemetry'
import type { App } from './app'
import type { Action } from '../sim/actions'

export type SheetSpec =
  | { kind: 'queue' } | { kind: 'landing' } | { kind: 'fold' } | { kind: 'group'; group: string }
  | { kind: 'settlement'; id: number } | { kind: 'workers'; settlement: number; colonist: number }
  | { kind: 'build'; settlement: number } | { kind: 'orders'; settlement: number }
  | { kind: 'market'; settlement: number } | { kind: 'consign'; settlement: number; good: GoodId }
  | { kind: 'buy'; settlement: number; good: GoodId } | { kind: 'equip'; settlement: number }
  | { kind: 'educate'; settlement: number } | { kind: 'hulls'; settlement: number } | { kind: 'rename'; settlement: number }
  | { kind: 'unit'; id: number } | { kind: 'cargo'; id: number } | { kind: 'tile'; tile: number } | { kind: 'stack'; tile: number }
  | { kind: 'demand' } | { kind: 'glossary'; key: string } | { kind: 'dispatch' }
  | { kind: 'signatories' } | { kind: 'predecessor'; id: number } | { kind: 'rivals' } | { kind: 'declaration' }
  | { kind: 'menu' } | { kind: 'newgame' } | { kind: 'intent' } | { kind: 'settings' }

const GOOD_NAMES: Record<GoodId, string> = { food: 'Food', timber: 'Timber', gold: 'Gold', horses: 'Horses', ore: 'Ore', metal: 'Metal', tooling: 'Tooling', arms: 'Arms', flax: 'Flax', linen: 'Linen', hemp: 'Hemp', cordage: 'Cordage', madder: 'Madder', dye: 'Dye', bloom: 'Bloom', attar: 'Attar', cores: 'Cores', instruments: 'Instruments' }
const TERRAIN_NAMES: Record<string, string> = { grassland: 'Grassland', plains: 'Plains', downs: 'Downs', marsh: 'Marsh', highland: 'Highland', mountain: 'Mountain', dry: 'Dry ground', water: 'Water' }
const FOREST_NAMES: Record<string, string> = { lightWoodland: 'light woodland', deepTimber: 'deep timber', highlandForest: 'highland forest', coastalScrub: 'coastal scrub' }
const PRIME_NAMES: Record<string, string> = { richSoil: 'rich soil', pasture: 'pasture', stand: 'a fine stand', lode: 'a lode', seam: 'a gold seam', flaxField: 'a flax field', hempField: 'a hemp field', madderBed: 'a madder bed', bloomMeadow: 'bloom meadow', shoal: 'a shoal' }
const PURPOSES: Purpose[] = ['food', 'timber', 'ore', 'gold', 'horses', 'flax', 'hemp', 'madder', 'bloom', 'industry', 'civic']

function header(app: App, title: (HTMLElement | string)[] | string, sub?: string): HTMLElement {
  return h('div', { class: 'sheet-head' },
    button('‹', () => app.back(), 'back'),
    h('div', { class: 'sheet-title' }, h('div', { class: 'h' }, title), sub ? muted(sub) : null),
  )
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
    case 'settlement': return settlementSheet(app, s, s.settlements[spec.id])
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
    case 'rivals': return rivalsSheet(app, s)
    case 'declaration': return declarationSheet(app, s)
    case 'menu': return menuSheet(app, s)
    case 'newgame': return newGameSheet(app, s)
    case 'intent': return intentSheet(app, s)
    case 'settings': return settingsSheet(app, s)
    case 'group': return groupSheet(app, spec.group)
    case 'fold': return foldSheet(app)
    default: return app.renderQueue()
  }
}

// ---- settlement ------------------------------------------------------------------------------------
function settlementSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  if (!st || st.owner !== 0) return h('div', { class: 'panel' }, header(app, 'Not yours'))
  const pop = st.colonists.length
  const prod = previewProduction(s, st)
  const fb = foodBalance(s, st)
  const cap = storageCapacity(st)
  const consignable = canConsign(s, st)
  const landing = landingSettlement(s)
  const clerksNeed = clerksRequired(pop)
  const goods = GOODS.filter(g => st.stock[g] > 0 || (prod[g] ?? 0) > 0)
  const panel = h('div', { class: 'panel' },
    header(app, [st.name, ' ', h('span', { class: 'muted small tappable', onClick: () => app.open({ kind: 'rename', settlement: st.id }) }, 'rename')], `${plural(pop, 'colonist')} · food ${signed(fb)} a turn · storage ${cap}`),
  )
  if (st.hunger > 0) panel.append(h('div', { class: 'crisis' }, `Short of food for ${plural(st.hunger, 'turn')}.`))
  // production
  const prodLines = Object.entries(prod).filter(([, v]) => (v ?? 0) > 0)
  panel.append(section('This turn', prodLines.length ? prodLines.map(([g, v]) => line([g === 'frame' ? T(app, 'frame') : g === 'grievance' ? T(app, 'grievance') : T(app, g, GOOD_NAMES[g as GoodId])], signed(v ?? 0))) : h('p', { class: 'muted' }, 'Nothing is being made. Assign the colonists below.')))
  // stock
  panel.append(section('In store' + (consignable.ok ? '' : ' (haul to the coast to consign)'),
    goods.length ? goods.map(g => {
      const traded = C.market.goods[g].traded
      const spoil = g !== 'food' && st.stock[g] > cap ? ' spoiling' : ''
      return line([T(app, g, GOOD_NAMES[g]), spoil ? h('span', { class: 'warn' }, spoil) : ''], [`${st.stock[g]}`, traded ? muted(` · ${sellPrice(s, g)}`) : ''], traded && consignable.ok ? () => app.open({ kind: 'consign', settlement: st.id, good: g }) : undefined)
    }) : h('p', { class: 'muted' }, 'Nothing in store.'),
    row(button('Market', () => app.open({ kind: 'market', settlement: st.id }), 'small'), consignable.ok ? null : muted(consignable.reason ?? '')),
  ))
  // colonists
  panel.append(section('Colonists',
    st.colonists.map((c, i) => line([h('b', {}, colonistLabel(c)), c.job.kind === 'idle' ? h('span', { class: 'warn' }, ' idle') : ''], jobLabel(s, c), () => app.open({ kind: 'workers', settlement: st.id, colonist: i }))),
    clerksNeed > 0 ? muted(`${plural(clerksNeed, 'clerk')} needed at this size; ${buildingWorkers(st, 'meeting') + buildingWorkers(st, 'press')} civic workers.`) : null,
    row(button('Assign all', () => app.dispatch({ t: 'autoAssign', settlement: st.id }, 'Assigned'), 'small'),
      button('Equip', () => app.open({ kind: 'equip', settlement: st.id }), 'small'),
      st.buildings.school > 0 ? button('School', () => app.open({ kind: 'educate', settlement: st.id }), 'small') : null,
      st.education ? muted(`schooling, ${st.education.turnsLeft} turns left`) : null),
  ))
  // buildings
  const held = BUILDING_LINES.filter(l => st.buildings[l] > 0)
  panel.append(section('Buildings',
    held.map(l => {
      const def = C.buildings.lines[l]
      const workers = buildingWorkers(st, l)
      const imported = st.imported[l]
      return line([buildingName({ line: l, tier: st.buildings[l] as 1 | 2 | 3 }), imported ? muted(imported.starved > 0 ? ' starved of instruments' : ' imported') : ''], def.output ? `${workers}/${C.labour.workersPerBuilding} workers` : '')
    }),
    st.building ? line(['Building ', buildingName(st.building.id)], `${st.building.frame}/${C.buildings.costs[st.building.id.tier]!.frame} frame, ${st.building.tooling}/${C.buildings.costs[st.building.id.tier]!.tooling} tooling`) : muted(st.buildQueue.length ? '' : 'Nothing in the build order.'),
    row(button('Build order' + (st.buildQueue.length ? ` (${st.buildQueue.length})` : ''), () => app.open({ kind: 'build', settlement: st.id }), 'small'), st.buildings.wharf > 0 ? button('Hulls', () => app.open({ kind: 'hulls', settlement: st.id }), 'small') : null),
  ))
  // orders
  const o = st.orders
  panel.append(section('Standing orders',
    line([T(app, 'purpose'), ': ', o.purpose === 'ask' ? 'not set' : o.purpose], undefined, () => app.open({ kind: 'orders', settlement: st.id })),
    line([T(app, 'surplus'), ': above ', String(o.surplus.threshold), ', ', o.surplus.destination.kind === 'ship' ? `ship to ${s.settlements[o.surplus.destination.settlement]?.name ?? '?'}` : o.surplus.destination.kind === 'offer' ? `offer to ${s.predecessors[o.surplus.destination.predecessor]?.name ?? '?'}` : o.surplus.destination.kind], undefined, () => app.open({ kind: 'orders', settlement: st.id })),
    line([T(app, 'growth'), ': ', o.growth.kind === 'send' ? `send to ${s.settlements[o.growth.settlement]?.name ?? '?'}` : o.growth.kind], undefined, () => app.open({ kind: 'orders', settlement: st.id })),
  ))
  // passages
  if (landing && landing.id === st.id) {
    const ch = s.charters[0]
    const wc = passageCost(s), gc = goldPassageCost(s)
    panel.append(section('Passages',
      muted(`${fmt(ch.word)} Word held. The next passage needs ${wc} Word or ${gc} gold. Word passages come by themselves when they can.`),
      row(button(`Buy a passage (${gc} gold)`, () => app.dispatch({ t: 'buyPassage' }, 'Passage bought'), 'small')),
    ))
  }
  if (st.grievance > 0 || st.buildings.meeting > 0) panel.append(section('Grievance', line([T(app, 'resolve')], `${Math.round(st.resolve * 100)} per cent`), line([T(app, 'grievance'), ' gathered here'], fmt(Math.round(st.grievance)))))
  return panel
}

function renameSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const input = h('input', { type: 'text', value: st.name, maxlength: 24 }) as HTMLInputElement
  return h('div', { class: 'panel' }, header(app, 'Name the settlement'), input,
    row(button('Keep', () => { if (app.dispatch({ t: 'renameSettlement', settlement: st.id, name: input.value.trim() || st.name }, 'Renamed')) app.back() }, 'primary')))
}

function workersSheet(app: App, s: GameState, st: Settlement, idx: number): HTMLElement {
  const c = st.colonists[idx]
  if (!c) return app.renderQueue()
  const w = s.world.width
  const panel = h('div', { class: 'panel' }, header(app, [`A ${colonistLabel(c)}`], `now: ${jobLabel(s, c)}`))
  const assign = (job: Colonist['job'], label: string) => { if (app.dispatch({ t: 'assignWorker', settlement: st.id, colonist: idx, job }, label)) app.back() }
  const tiles: HTMLElement[] = []
  for (const t of workableTiles(s, st)) {
    const tile = s.world.tiles[t]
    if (tile.terrain === 'water' && !(st.buildings.wharf > 0 || true)) continue
    const takenBy = st.colonists.findIndex((o, j) => j !== idx && o.job.kind === 'tile' && o.job.tile === t)
    const other = tile.worked !== null && tile.worked !== st.id
    for (const g of tileOffers(tile)) {
      const y = tileYield(s, t, g, c)
      if (y <= 0) continue
      const dx = (t % w) - (st.tile % w), dz = Math.floor(t / w) - Math.floor(st.tile / w)
      const dir = t === st.tile ? 'here' : `${dz < 0 ? 'N' : dz > 0 ? 'S' : ''}${dx < 0 ? 'W' : dx > 0 ? 'E' : ''}`
      const blocked = takenBy >= 0 || other
      tiles.push(line([`${GOOD_NAMES[g]} ${y}`, muted(` · ${TERRAIN_NAMES[tile.terrain]}${tile.forest ? ', ' + FOREST_NAMES[tile.forest] : ''} ${dir}`), blocked ? h('span', { class: 'warn' }, ' taken') : ''], undefined, blocked ? undefined : () => assign({ kind: 'tile', tile: t, good: g }, `Set to ${g}`)))
    }
  }
  tiles.sort((a, b) => Number((b.querySelector('.l') as HTMLElement).textContent!.split(' ')[1]) - Number((a.querySelector('.l') as HTMLElement).textContent!.split(' ')[1]))
  panel.append(section('On the land', ...tiles))
  const builds: HTMLElement[] = []
  for (const l of BUILDING_LINES) {
    if (st.buildings[l] === 0) continue
    const def = C.buildings.lines[l]
    const n = buildingWorkers(st, l) - (c.job.kind === 'building' && c.job.line === l ? 1 : 0)
    const full = n >= C.labour.workersPerBuilding
    const out = def.output ? `${workerOutput(c, l) * C.labour.tierMultiplier[st.buildings[l]]} ${def.output === 'frame' ? 'frame' : GOOD_NAMES[def.output as GoodId]} from ${def.input ? GOOD_NAMES[def.input] : ''}` : l === 'meeting' || l === 'press' ? 'gathers grievance' : l === 'school' ? 'teaches' : l === 'agentOffice' ? 'more Word per consignment' : 'no workers needed'
    if (!def.output && !['meeting', 'press', 'school', 'agentOffice'].includes(l)) continue
    builds.push(line([buildingName({ line: l, tier: st.buildings[l] as 1 | 2 | 3 }), muted(` · ${out}`), full ? h('span', { class: 'warn' }, ' full') : ''], `${n}/${C.labour.workersPerBuilding}`, full ? undefined : () => assign({ kind: 'building', line: l }, `Set to ${buildingName({ line: l, tier: 1 })}`)))
  }
  panel.append(section('In a building', ...(builds.length ? builds : [muted('No building here takes workers yet.')])))
  panel.append(row(button('Leave idle', () => assign({ kind: 'idle' }, 'Set idle'), 'small ghost')))
  return panel
}

function buildSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const panel = h('div', { class: 'panel' }, header(app, 'Build order', `${st.name} · ${st.frame} frame, ${st.stock.tooling} tooling in store`))
  if (st.building) {
    const cost = C.buildings.costs[st.building.id.tier]!
    panel.append(section('Under way', line([buildingName(st.building.id)], `${st.building.frame}/${cost.frame} frame, ${st.building.tooling}/${cost.tooling} tooling`)))
  }
  panel.append(section('Queued', ...(st.buildQueue.length ? st.buildQueue.map((b, i) => {
    const ok = canStart(st, b)
    return line([buildingName(b), ok.ok ? '' : h('span', { class: 'warn' }, ` ${ok.reason}`)], 'remove', () => app.dispatch({ t: 'setBuildOrder', settlement: st.id, queue: st.buildQueue.filter((_, j) => j !== i) }, 'Removed from the build order'))
  }) : [muted('Nothing queued. The carpenter keeps making frame regardless.')])))
  const options = buildable(s, st)
  panel.append(section('Can be built', ...(options.length ? options.map(b => {
    const cost = C.buildings.costs[b.tier]!
    const def = C.buildings.lines[b.line]
    const what = def.output ? `${def.output === 'frame' ? 'frame' : GOOD_NAMES[def.output as GoodId]} from ${GOOD_NAMES[def.input!]}` : describeLine(b.line)
    return line([buildingName(b), muted(` · ${what}`)], b.imported ? `${C.buildings.importedMachineGold} gold` : `${cost.frame} frame, ${cost.tooling} tooling`, () => {
      if (b.imported) app.dispatch({ t: 'buyImported', settlement: st.id, line: b.line }, 'Imported machine bought')
      else app.dispatch({ t: 'setBuildOrder', settlement: st.id, queue: [...st.buildQueue, { line: b.line, tier: b.tier }] }, `${buildingName(b)} queued`)
    })
  }) : [muted('Nothing new can be built at this size.')])))
  return panel
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
  panel.append(section('Purpose', h('div', { class: 'chips' }, PURPOSES.map(p => h('button', { class: 'chip' + (o.purpose === p ? ' on' : ''), type: 'button', onClick: () => set('purpose', p, `Purpose: ${p}`) }, p)))))
  const thresholds = [20, 40, 60, 100, 150]
  panel.append(section('Surplus',
    h('div', { class: 'chips' }, thresholds.map(t => h('button', { class: 'chip' + (o.surplus.threshold === t ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, threshold: t }, `Surplus above ${t}`) }, `above ${t}`))),
    h('div', { class: 'chips' },
      h('button', { class: 'chip' + (o.surplus.destination.kind === 'consign' ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, destination: { kind: 'consign' } }, 'Surplus: consign') }, 'consign'),
      h('button', { class: 'chip' + (o.surplus.destination.kind === 'hold' ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, destination: { kind: 'hold' } }, 'Surplus: hold') }, 'hold'),
      others.map(x => h('button', { class: 'chip' + (o.surplus.destination.kind === 'ship' && o.surplus.destination.settlement === x.id ? ' on' : ''), type: 'button', onClick: () => set('surplus', { ...o.surplus, destination: { kind: 'ship', settlement: x.id } }, `Surplus: ship to ${x.name}`) }, `ship to ${x.name}`)),
    ),
  ))
  panel.append(section('Growth', h('div', { class: 'chips' },
    h('button', { class: 'chip' + (o.growth.kind === 'keep' ? ' on' : ''), type: 'button', onClick: () => set('growth', { kind: 'keep' }, 'Growth: keep') }, 'keep'),
    others.map(x => h('button', { class: 'chip' + (o.growth.kind === 'send' && o.growth.settlement === x.id ? ' on' : ''), type: 'button', onClick: () => set('growth', { kind: 'send', settlement: x.id }, `Growth: send to ${x.name}`) }, `send to ${x.name}`)),
  )))
  if (!o.reviewed) panel.append(row(button('These are fine', () => { if (app.dispatch({ t: 'reviewOrders', settlement: st.id }, 'Orders reviewed')) app.back() }, 'primary')))
  return panel
}

// ---- market ------------------------------------------------------------------------------------
function marketSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const ok = canConsign(s, st)
  const loss = freightLoss(s, st)
  const panel = h('div', { class: 'panel' }, header(app, [T(app, 'company', 'The Company market')], `${st.name} · charge ${Math.round(s.company.charge * 100)} per cent${loss > 0 ? `, freight ${Math.round(loss * 100)} per cent` : ''}`))
  if (!ok.ok) panel.append(h('p', { class: 'warn' }, ok.reason ?? 'Cannot consign from here.'))
  if (s.company.embargoed.length) panel.append(h('p', { class: 'warn' }, `Embargoed: ${s.company.embargoed.join(', ')}.`))
  const due = s.company.payments.filter(p => p.due > s.turn)
  if (due.length) panel.append(muted(`${due.reduce((a, p) => a + p.gold, 0)} gold on the water, due over ${Math.max(...due.map(p => p.due - s.turn))} turns.`))
  const rows = GOODS.filter(g => C.market.goods[g].traded).map(g => {
    const emb = isEmbargoed(s, g)
    return h('div', { class: 'line' },
      h('span', { class: 'l' }, T(app, g, GOOD_NAMES[g]), emb ? h('span', { class: 'warn' }, ' embargo') : ''),
      h('span', { class: 'r' }, muted(`${st.stock[g]} held · `), `${sellPrice(s, g)} / ${buyPrice(s, g)}`,
        ' ', ok.ok && st.stock[g] > 0 && !emb ? button('Sell', () => app.open({ kind: 'consign', settlement: st.id, good: g }), 'tiny') : '',
        ' ', ok.ok ? button('Buy', () => app.open({ kind: 'buy', settlement: st.id, good: g }), 'tiny ghost') : ''),
    )
  })
  panel.append(section('Sells at / buys at', ...rows))
  return panel
}

function walkPreview(s: GameState, g: GoodId, amount: number): { first: number; last: number; gold: number } {
  const e = { ...s.market.tables[0][g] }
  const first = e.price
  let gold = 0, remaining = amount
  while (remaining > 0) {
    const lot = Math.min(C.market.lotSize, remaining)
    gold += e.price * lot
    e.pressure += lot
    recompute(e, g)
    remaining -= lot
  }
  return { first, last: e.price, gold }
}

function consignSheet(app: App, s: GameState, st: Settlement, g: GoodId): HTMLElement {
  const held = st.stock[g]
  let amount = Math.min(held, C.market.lotSize * 2)
  const smuggling = !!(s.declaration?.declared && !s.declaration.won)
  const rate = (1 - s.company.charge) * (1 - freightLoss(s, st)) * (smuggling ? C.market.smugglerRate : 1)
  const preview = h('div', { class: 'preview' })
  const slider = h('input', { type: 'range', min: 0, max: held, step: 1, value: amount }) as HTMLInputElement
  const render = () => {
    const p = walkPreview(s, g, amount)
    preview.replaceChildren(
      h('div', { class: 'big' }, `${amount} ${GOOD_NAMES[g]}`),
      h('div', {}, `Price ${p.first}${p.last !== p.first ? ` falling to ${p.last}` : ''} · ${Math.round(p.gold * rate)} gold after the charge, due in ${C.market.crossingTurns[s.settings.crossing]} turns`),
      p.last < p.first ? h('div', { class: 'warn' }, `Each lot of ${C.market.lotSize} moves the price. ${amount > C.market.lotSize * 3 ? 'Sending less now and more later would earn more.' : ''}`) : muted('Below the volume that moves the price.'),
    )
    slider.value = String(amount)
  }
  slider.addEventListener('input', () => { amount = Number(slider.value); render() })
  render()
  const chips = h('div', { class: 'chips' }, [25, 50, 100, held].filter((v, i, a) => v > 0 && v <= held && a.indexOf(v) === i).map(v => h('button', { class: 'chip', type: 'button', onClick: () => { amount = v; render() } }, v === held ? `all ${held}` : String(v))))
  return h('div', { class: 'panel' }, header(app, [T(app, 'consign'), ' ', GOOD_NAMES[g]], `${held} held at ${st.name}`), preview, slider, chips,
    row(button('Consign', () => { if (amount > 0 && app.dispatch({ t: 'consign', settlement: st.id, good: g, amount }, `${amount} ${g} consigned`)) app.back() }, 'primary')))
}

function buySheet(app: App, s: GameState, st: Settlement, g: GoodId): HTMLElement {
  const price = buyPrice(s, g)
  const gold = s.charters[0].gold
  const can = Math.floor(gold / Math.max(1, price))
  let amount = Math.min(can, 10)
  const preview = h('div', { class: 'preview' })
  const slider = h('input', { type: 'range', min: 0, max: Math.max(1, can), step: 1, value: amount }) as HTMLInputElement
  const render = () => { preview.replaceChildren(h('div', { class: 'big' }, `${amount} ${GOOD_NAMES[g]}`), h('div', {}, `${amount * price} gold of ${fmt(gold)}`)) }
  slider.addEventListener('input', () => { amount = Number(slider.value); render() })
  render()
  return h('div', { class: 'panel' }, header(app, ['Buy ', GOOD_NAMES[g]], `${price} each from the Company`), preview, slider,
    row(button('Buy', () => { if (amount > 0 && app.dispatch({ t: 'buy', settlement: st.id, good: g, amount }, `${amount} ${g} bought`)) app.back() }, 'primary')))
}

function equipSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const kinds: LandKind[] = ['militia', 'outrider', 'battery', 'improver', 'hauler']
  const panel = h('div', { class: 'panel' }, header(app, 'Equip a colonist', `${st.name} · arms ${st.stock.arms}, horses ${st.stock.horses}, tooling ${st.stock.tooling}`),
    h('p', { class: 'muted' }, 'Equipment makes the unit. Take it off and the colonist is a colonist again.'))
  if (!st.colonists.length) { panel.append(muted('No one here to equip.')); return panel }
  let chosen = 0
  const list = h('div', { class: 'chips' })
  const renderList = () => list.replaceChildren(...st.colonists.map((c, i) => h('button', { class: 'chip' + (i === chosen ? ' on' : ''), type: 'button', onClick: () => { chosen = i; renderList() } }, `${colonistLabel(c)} (${jobLabel(s, c)})`)))
  renderList()
  panel.append(section('Who', list))
  panel.append(section('As what', ...kinds.map(k => {
    const cost = equipCost(k)
    const parts = Object.entries(cost).map(([g, n]) => `${n} ${g}`).join(', ')
    const can = Object.entries(cost).every(([g, n]) => st.stock[g as GoodId] >= (n ?? 0))
    const u = C.military.units[k as keyof typeof C.military.units] as { attack?: number; defence?: number; moves: number }
    return line([T(app, k), muted(` · ${parts || 'nothing'}${u.attack !== undefined ? `, ${u.attack}/${u.defence}` : ''}, ${u.moves} moves`)], can ? 'equip' : h('span', { class: 'warn' }, 'short'), can ? () => { if (app.dispatch({ t: 'equip', settlement: st.id, colonist: chosen, as: k }, `${k} equipped`)) app.back() } : undefined)
  })))
  return panel
}

function educateSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const panel = h('div', { class: 'panel' }, header(app, 'School', `${st.name} · ${buildingName({ line: 'school', tier: st.buildings.school as 1 | 2 | 3 })}, ${C.labour.educationCycle[st.buildings.school]} turns a step`))
  if (st.education) { panel.append(muted(`A ${colonistLabel(st.colonists[st.education.colonist])} is being taught, ${st.education.turnsLeft} turns left.`)); return panel }
  panel.append(h('p', { class: 'muted' }, 'Schooling raises one colonist one standing. A master is made only from a colonist of free standing, by a master.'))
  panel.append(section('Who', ...st.colonists.map((c, i) => line([colonistLabel(c), muted(` · ${jobLabel(s, c)}`)], c.standing === 'master' ? muted('already a master') : 'teach', c.standing === 'master' ? undefined : () => { if (app.dispatch({ t: 'educate', settlement: st.id, colonist: i }, 'Schooling begun')) app.back() }))))
  return panel
}

function hullsSheet(app: App, s: GameState, st: Settlement): HTMLElement {
  const hulls: HullKind[] = ['lighter', 'trader', 'raider', 'cutter']
  return h('div', { class: 'panel' }, header(app, 'Hulls', `${st.name} · wharf tier ${st.buildings.wharf}`),
    C.flags.naval ? null : notYet(app, 'Shipbuilding'),
    section('Hulls', ...hulls.map(k => {
      const d = C.naval.hulls[k]
      const cost = Object.entries(d.cost).filter(([, n]) => n).map(([g, n]) => `${n} ${g}`).join(', ')
      return line([T(app, 'hull', k), muted(` · speed ${d.speed}, guns ${d.guns}, holds ${d.capacity}`)], `${cost} · wharf ${d.wharfTier}`, () => app.dispatch({ t: 'buildHull', settlement: st.id, hull: k }, `${k} laid down`))
    })))
}

// ---- units ------------------------------------------------------------------------------------
function unitSheet(app: App, s: GameState, u: Unit): HTMLElement {
  const w = s.world.width
  const here = s.settlements.find(x => x.tile === u.tile)
  const mine = u.owner === 0
  const panel = h('div', { class: 'panel' }, header(app, [T(app, u.kind, unitLabel(u.kind))], `${mine ? 'yours' : u.owner === -1 ? 'the Company' : s.charters[u.owner]?.name} · ${u.moves}/${maxMoves(u)} moves · ${u.quality}${u.colonist ? ` · ${colonistLabel(u.colonist)}` : ''}`))
  if (!mine) { panel.append(muted(`Attack ${unitAttack(u, 'open')}, defence ${unitDefence(u, !!here)}.`)); return panel }
  const path = app.pathPreview
  if (path && path.length) {
    const dest = path[path.length - 1]
    const ds = s.settlements.find(x => x.tile === dest)
    const enemy = s.units.find(x => x.tile === dest && x.owner !== 0)
    let cost = 0
    const moves = maxMoves(u)
    for (const t of path) cost += Math.max(0.5, t === u.tile ? 0 : 1)
    const turns = Math.max(1, Math.ceil(cost / Math.max(1, moves)))
    panel.append(h('div', { class: 'preview' },
      h('div', { class: 'big' }, ds ? `To ${ds.name}` : enemy ? `Toward ${unitLabel(enemy.kind)}` : `To ${TERRAIN_NAMES[s.world.tiles[dest].terrain]}`),
      h('div', {}, `${path.length} tiles, about ${plural(turns, 'turn')}. Hold the tile to go, or tap below.`),
      row(button('Go', () => app.commitMove(u.id), 'primary'), enemy ? button('Attack', () => app.commitAttack(u.id, dest), 'danger') : null, button('Clear', () => { app.pathPreview = null; app.paintPath(); app.scene.requestDraw(); app.renderSheet() }, 'ghost')),
    ))
  } else panel.append(h('p', { class: 'muted' }, 'Tap a tile to plan a move, then hold it to go.'))
  const actions: HTMLElement[] = []
  if (u.kind === 'colonist' && !here) {
    const t = s.world.tiles[u.tile]
    const near = s.settlements.some(x => Math.max(Math.abs((x.tile % w) - (u.tile % w)), Math.abs(Math.floor(x.tile / w) - Math.floor(u.tile / w))) < 2)
    const onPred = s.predecessors.some(p => p.territory.includes(u.tile))
    actions.push(button('Found a settlement here', () => app.dispatch({ t: 'found', unit: u.id }, 'Settlement founded'), 'primary'))
    if (near) actions.push(muted('Too close to another settlement.'))
    else if (onPred) actions.push(muted('This is predecessor ground.'))
    else if (t.terrain === 'water' || t.terrain === 'mountain') actions.push(muted('Not here.'))
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
  if (u.order && u.order.kind !== 'garrison') actions.push(button(`Stop ${u.order.kind}`, () => app.dispatch({ t: 'setUnitOrder', unit: u.id, order: null }, 'Order cleared'), 'small ghost'))
  if (u.kind === 'colonist' && !u.order) actions.push(button('Explore by itself', () => app.dispatch({ t: 'setUnitOrder', unit: u.id, order: { kind: 'explore' } }, 'Exploring'), 'small ghost'))
  if (Object.keys(u.cargo).length) actions.push(muted('Carrying ' + Object.entries(u.cargo).map(([g, n]) => `${n} ${g}`).join(', ')))
  panel.append(section('Do', ...actions))
  return panel
}

function stackSheet(app: App, s: GameState, tile: number): HTMLElement {
  const units = s.units.filter(u => u.tile === tile && u.owner === 0)
  if (units.length === 1) { app.scene.cam.view.activeUnit = units[0].id; return unitSheet(app, s, units[0]) }
  const here = s.settlements.find(x => x.tile === tile)
  return h('div', { class: 'panel' }, header(app, here ? `At ${here.name}` : 'On this tile', plural(units.length, 'unit')),
    ...units.map(u => line([h('b', {}, unitLabel(u.kind)), muted(` · ${u.quality}${u.colonist ? ', ' + colonistLabel(u.colonist) : ''}`)],
      u.order ? u.order.kind : `${u.moves}/${maxMoves(u)} moves`,
      () => { app.scene.cam.view.activeUnit = u.id; app.pathPreview = null; app.sheetHistory = []; app.open({ kind: 'unit', id: u.id }); app.scene.updateRings(s); app.scene.requestDraw() })))
}

function cargoSheet(app: App, s: GameState, u: Unit): HTMLElement {
  const here = s.settlements.find(x => x.tile === u.tile && x.owner === 0)
  const cap = cargoCapacity(u)
  const carried = Object.values(u.cargo).reduce((a, b) => a + (b ?? 0), 0)
  const panel = h('div', { class: 'panel' }, header(app, 'Cargo', `${unitLabel(u.kind)} · ${carried}/${cap}`))
  if (!here) { panel.append(muted('Load and unload at a settlement.')); return panel }
  panel.append(section('Unload', ...(Object.entries(u.cargo).filter(([, n]) => n).map(([g, n]) => line([GOOD_NAMES[g as GoodId]], `${n}`, () => app.dispatch({ t: 'unload', unit: u.id, good: g as GoodId, amount: n! }, `${n} ${g} unloaded`))))))
  panel.append(section('Load from ' + here.name, ...GOODS.filter(g => here.stock[g] > 0).map(g => line([GOOD_NAMES[g]], `${here.stock[g]}`, () => app.dispatch({ t: 'load', unit: u.id, good: g, amount: Math.min(here.stock[g], cap - carried) }, `${g} loaded`)))))
  return panel
}

// ---- tiles ------------------------------------------------------------------------------------
function tileSheet(app: App, s: GameState, tile: number): HTMLElement {
  const t = s.world.tiles[tile]
  const w = s.world.width
  const x = tile % w, z = Math.floor(tile / w)
  const title = t.forest ? `${TERRAIN_NAMES[t.terrain]}, ${FOREST_NAMES[t.forest]}` : TERRAIN_NAMES[t.terrain]
  const bits: string[] = []
  if (t.river === 2) bits.push('on a major river'); else if (t.river === 1) bits.push('by a river')
  if (t.road) bits.push('road')
  if (t.improved) bits.push('ploughed')
  if (t.prime && (t.prime !== 'seam' || t.goldReserve > 0)) bits.push(PRIME_NAMES[t.prime] ?? t.prime)
  if (t.workings) bits.push('old workings')
  const owner = t.owner !== null ? s.charters[t.owner] : null
  const pred = s.predecessors.find(p => p.territory.includes(tile))
  const panel = h('div', { class: 'panel' }, header(app, title, `${x}, ${z}${bits.length ? ' · ' + bits.join(', ') : ''}`))
  const yields = tileOffers(t).map(g => ({ g, y: tileYield(s, tile, g, null) })).filter(e => e.y > 0)
  panel.append(section('Yields', yields.length ? yields.map(e => line([T(app, e.g, GOOD_NAMES[e.g])], String(e.y))) : muted('Nothing to work here.')))
  if (owner) panel.append(muted(`${owner.player ? 'Your' : owner.name + "'s"} ground.`))
  if (pred) panel.append(line([T(app, 'predecessor', pred.name), muted(' ground')], 'open', () => app.open({ kind: 'predecessor', id: pred.id })))
  const st = s.settlements.find(x => x.tile === tile)
  if (st) panel.append(line([st.owner === 0 ? st.name : `${st.name} (${s.charters[st.owner]?.name})`], st.owner === 0 ? 'open' : `${st.abstractPop} people`, st.owner === 0 ? () => app.open({ kind: 'settlement', id: st.id }) : undefined))
  const units = s.units.filter(u => u.tile === tile)
  if (units.length) panel.append(section('Here', ...units.map(u => line([unitLabel(u.kind), muted(` · ${u.owner === 0 ? 'yours' : u.owner === -1 ? 'the Company' : s.charters[u.owner]?.name}`)], u.owner === 0 ? 'select' : `${unitAttack(u, 'open')}/${unitDefence(u, !!st)}`, u.owner === 0 ? () => { app.scene.cam.view.activeUnit = u.id; app.open({ kind: 'unit', id: u.id }); app.scene.updateRings(s); app.scene.requestDraw() } : undefined))))
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
  if (s.world.landingSites.includes(tile) && s.turn === 0) panel.append(row(button('Go ashore here', () => app.land(tile), 'primary')))
  return panel
}

// ---- company, glossary, dispatch ------------------------------------------------------------------
function demandSheet(app: App, s: GameState): HTMLElement {
  const d = s.company.demand
  if (!d) return h('div', { class: 'panel' }, header(app, 'No demand'), muted('The Company is not asking for anything at present.'))
  const left = d.turnOffered + C.market.demandDeadline - s.turn
  return h('div', { class: 'panel' }, header(app, [T(app, 'demand', 'A demand from the Company')], `${plural(Math.max(0, left), 'turn')} to answer; silence is acceptance`),
    h('p', {}, `The Company asks that the charge rise by ${Math.round(d.rise * 100)} points, to ${Math.round((s.company.charge + d.rise) * 100)} per cent of everything you consign.`),
    h('p', { class: 'muted' }, `Refuse and the Company will not buy ${GOOD_NAMES[d.good]} for a time, and the refusal is remembered as grievance.`),
    row(button('Accept', () => { if (app.dispatch({ t: 'answerDemand', accept: true }, 'Demand accepted')) app.back() }, 'small'), button('Refuse', () => { if (app.dispatch({ t: 'answerDemand', accept: false }, 'Demand refused')) app.back() }, 'danger')))
}

function glossarySheet(app: App, s: GameState, key: string): HTMLElement {
  const t = term(key)
  if (!t) return h('div', { class: 'panel' }, header(app, key), muted('No entry.'))
  const state = t.state ? t.state(s) : ''
  return h('div', { class: 'panel' }, header(app, t.title), h('p', {}, app.withTerms(t.text)), state ? h('p', { class: 'state' }, state) : null,
    h('div', { class: 'chips' }, Object.keys(TERMS).filter(k => k !== key).slice(0, 60).map(k => h('button', { class: 'chip small', type: 'button', onClick: () => app.open({ kind: 'glossary', key: k }) }, TERMS[k].title))))
}

function dispatchSheet(app: App, s: GameState): HTMLElement {
  const entries = s.dispatch.slice(-40).reverse()
  return h('div', { class: 'panel' }, header(app, [T(app, 'dispatch', 'The dispatch')], 'what moved, newest first'),
    entries.length ? entries.map(d => {
      const el = h('div', { class: 'card small-card ' + d.kind })
      el.append(h('div', { class: 'card-body' }, muted(`Turn ${d.turn} · `), app.withTerms(d.text)))
      if (d.why) { const why = h('div', { class: 'why' }, d.why); why.style.display = 'none'; el.append(button('Why', () => { why.style.display = why.style.display === 'none' ? 'block' : 'none' }, 'tiny ghost'), why) }
      if (d.settlement !== undefined && s.settlements[d.settlement]) el.append(button(s.settlements[d.settlement].name, () => { app.focus(s.settlements[d.settlement!].tile); if (s.settlements[d.settlement!].owner === 0) app.open({ kind: 'settlement', id: d.settlement! }) }, 'tiny ghost'))
      return el
    }) : muted('Nothing yet.'))
}

function signatoriesSheet(app: App, s: GameState): HTMLElement {
  const ch = s.charters[0]
  const list = signatoryList()
  const panel = h('div', { class: 'panel' }, header(app, [T(app, 'signatory', 'Signatories')], `${ch.signatories.length} of twelve · ${Math.round(ch.grievance)} grievance unspent`))
  if (!list.length) { panel.append(notYet(app, 'Recruiting signatories')); return panel }
  panel.append(section('Seeking', h('div', { class: 'chips' }, (['trade', 'land', 'arms', 'voice'] as const).map(c => h('button', { class: 'chip' + (ch.signatoryTarget === c ? ' on' : ''), type: 'button', onClick: () => app.dispatch({ t: 'setSignatoryTarget', category: c }, `Seeking ${c}`) }, c)))))
  panel.append(section('The twelve', ...list.map(e => line([h('b', {}, e.name), muted(` · ${e.category}`)], ch.signatories.includes(e.index) ? 'signed' : muted(e.effect)))))
  return panel
}

function predecessorSheet(app: App, s: GameState, id: number): HTMLElement {
  const p = s.predecessors[id]
  if (!p) return app.renderQueue()
  const u = s.units.find(x => x.id === app.scene.cam.view.activeUnit && x.owner === 0)
  const w = s.world.width
  const adjacent = u ? Math.abs((p.tile % w) - (u.tile % w)) <= 1 && Math.abs(Math.floor(p.tile / w) - Math.floor(u.tile / w)) <= 1 : false
  const panel = h('div', { class: 'panel' }, header(app, [T(app, 'predecessor', p.name)], `teaches ${p.teaches}${p.taught ? ' (taught)' : ''} · wants ${GOOD_NAMES[p.strong]} most, ${p.minor.map(g => GOOD_NAMES[g]).join(' and ')} too`))
  panel.append(line([T(app, 'alarm')], p.alarm > 0.66 ? 'high' : p.alarm > 0.33 ? 'rising' : 'low'))
  if (p.agent) panel.append(muted('An agent of yours is stationed here.'))
  if (!C.flags.predecessors) panel.append(notYet(app, 'Trading and learning with predecessor peoples'))
  if (u && adjacent) {
    const goods = Object.entries(u.cargo).filter(([, n]) => n) as [GoodId, number][]
    panel.append(section(`With your ${unitLabel(u.kind)}`,
      ...goods.map(([g, n]) => line([`Offer ${n} ${GOOD_NAMES[g]}`], 'offer', () => app.dispatch({ t: 'offer', unit: u.id, predecessor: p.id, good: g, amount: n, haggle: false }, 'Offered'))),
      u.kind === 'colonist' && !p.taught ? button(`Learn ${p.teaches}`, () => app.dispatch({ t: 'learn', unit: u.id, predecessor: p.id }, 'Learning'), 'small') : null,
      u.kind === 'colonist' && !p.agent ? button('Station as agent', () => app.dispatch({ t: 'stationAgent', unit: u.id, predecessor: p.id }, 'Stationed'), 'small ghost') : null,
    ))
  } else panel.append(muted('Bring a unit next to them to trade, learn or station an agent.'))
  return panel
}

function rivalsSheet(app: App, s: GameState): HTMLElement {
  return h('div', { class: 'panel' }, header(app, [T(app, 'rival', 'The other charters')]),
    ...s.charters.slice(1).map(c => line([h('span', { class: 'swatch', style: { background: c.colour } }), ' ', c.name], `${c.relation} · ${plural(s.settlements.filter(x => x.owner === c.id).length, 'settlement')}${c.fell ? ' · fell' : c.independent ? ' · independent' : ''}`)),
    C.flags.rivals ? null : notYet(app, 'Rival expansion and diplomacy'))
}

function declarationSheet(app: App, s: GameState): HTMLElement {
  const ch = s.charters[0]
  const mine = s.settlements.filter(x => x.owner === 0)
  const pop = mine.reduce((a, st) => a + st.colonists.length, 0)
  const resolve = pop ? mine.reduce((a, st) => a + st.resolve * st.colonists.length, 0) / pop : 0
  const d = s.declaration
  const panel = h('div', { class: 'panel' }, header(app, [T(app, 'declaration', 'The declaration')], d?.declared ? 'declared' : `resolve ${Math.round(resolve * 100)} per cent of ${Math.round(C.grievance.declarationGate * 100)} needed`))
  panel.append(line([T(app, 'fleet', 'The recall fleet')], `strength ${Math.round(s.company.fleetStrength)}`))
  if (d?.declared) {
    panel.append(section('The war', ...d.waves.map(wv => line([`Wave ${wv.id}, ${plural(wv.units.length, 'unit')}`], wv.landed ? 'landed' : `lands in ${wv.turnsToLand}`)), muted(`Intervention ${Math.round(d.interventionProgress)}`)))
  } else {
    panel.append(h('p', { class: 'muted' }, 'Tearing up the charter ends consignments at the full rate and brings the fleet. It is never forced, and it can wait until you are ready.'))
    if (C.flags.fleet) panel.append(row(button('Declare', () => app.dispatch({ t: 'declare' }, 'Declared'), 'danger')))
    else panel.append(notYet(app, 'The declaration and the recall fleet'))
  }
  panel.append(muted(`${ch.signatories.length} signatories, ${Math.round(ch.grievanceTotal)} grievance gathered in all.`))
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
      row(button('Overview', () => app.scene.glideTo(s.settlements[0]?.tile ?? s.charters[0].landing, C.feel.zoom.overview), 'small'), button('Home', () => app.scene.glideTo(s.settlements[0]?.tile ?? s.charters[0].landing, C.feel.zoom.working), 'small')),
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
      const card = h('div', { class: 'card small-card' }, h('div', { class: 'card-title' }, it.title), h('div', { class: 'card-body' }, app.withTerms(it.body)))
      const actions = h('div', { class: 'card-actions' })
      for (const c of it.choices) actions.append(button(c.label, () => app.dispatch(c.action as Action, c.label), 'small'))
      actions.append(button('Open', () => app.openItem(it), 'small ghost'))
      card.append(actions)
      return card
    }))
}

function foldSheet(app: App): HTMLElement {
  return h('div', { class: 'panel' }, header(app, [T(app, 'fold', 'Folded beneath')]), ...app.queue.folded.map(g => app.renderGroup(g)))
}
