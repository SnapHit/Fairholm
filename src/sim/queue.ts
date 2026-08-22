// The queue is derived, never stored. Turn, queue and standing orders brief.
// Events go to the dispatch; only decisions come here. Identical conditions across many settlements
// collapse into one item (section 6). Eight are shown by default and the rest are folded, not
// filtered (section 7). Types 1 and 2 never fold. Persistence adds an escalating rank boost.

import { C } from './constants'
import type { GameState, QueueItem, QueueGroup, DerivedQueue } from './state'
import type { System } from './turn'
import { collectQueueItems } from './turn'

/** Plural titles for grouped conditions. The group key is the condition, not the settlement. */
const GROUP_TITLES: Record<string, (n: number) => string> = {
  hunger: n => `${n} settlements are running short of food`,
  spoilage: n => `${n} settlements are losing goods`,
  purposeLost: n => `${n} settlements cannot pursue their purpose`,
  buildBlocked: n => `${n} settlements cannot start their next building`,
  buildEmpty: n => `${n} settlements have empty build orders`,
  idle: n => `${n} settlements have people with nothing to do`,
  reviewOrders: n => `${n} settlements need their standing orders reviewed`,
  growthAsk: n => `${n} settlements have new colonists to place`,
  unitIdle: n => `${n} units are awaiting orders`,
  unitContact: n => `${n} units have made contact and await you`,
  routeUnviable: n => `${n} haulage routes have become unviable`,
  threatened: n => `${n} settlements are threatened`,
  breach: n => `${n} settlements have had their works breached`,
  predecessorWants: n => `${n} predecessor settlements want something you make`,
  rivalFounded: n => `${n} rival settlements were founded on your ground`,
  buildingUnlocked: n => `${n} new buildings are available`,
}

/** Queue items that come from units rather than systems. */
function unitItems(s: GameState): QueueItem[] {
  const out: QueueItem[] = []
  for (const u of s.units) {
    if (u.owner !== 0) continue
    const contact = u.since['contact']
    if (contact !== undefined) {
      out.push({ key: `contact:${u.id}`, group: 'unitContact', type: 1, title: `${unitLabel(u.kind)} made contact`, body: 'It has reverted to your control.', unit: u.id, tile: u.tile, magnitude: 5, since: contact, choices: [], opens: 'unit' })
      continue
    }
    if (!u.order && u.kind !== 'companyShip') {
      const atSettlement = s.settlements.some(st => st.tile === u.tile && st.owner === 0)
      if (atSettlement && (u.kind === 'militia' || u.kind === 'battery' || u.kind === 'damagedBattery')) continue
      const since = u.since['idle'] ?? s.turn
      out.push({ key: `unitIdle:${u.id}`, group: 'unitIdle', type: 4, title: `${unitLabel(u.kind)} is awaiting orders`, body: u.kind === 'colonist' ? 'Move it, found a settlement with it, or send it home.' : 'Give it a standing order or move it.', unit: u.id, tile: u.tile, magnitude: 1, since, choices: [], opens: 'unit',
        explain: u.kind === 'colonist' ? 'Tap the unit, then tap and hold a tile to walk there. A colonist in open country can found a settlement.' : undefined })
    }
  }
  return out
}

export function unitLabel(kind: string): string {
  const names: Record<string, string> = {
    colonist: 'A colonist', militia: 'Militia', outrider: 'An outrider', battery: 'A battery', damagedBattery: 'A damaged battery',
    improver: 'An improver', hauler: 'A hauler', lighter: 'A lighter', trader: 'A trader', raider: 'A raider', cutter: 'A cutter',
    regulars: 'Company regulars', horse: 'Company horse', siegeTrain: 'A Company siege train', damagedSiegeTrain: 'A damaged siege train', companyShip: 'A Company landing craft',
  }
  return names[kind] ?? kind
}

export function deriveQueue(s: GameState, systems: System[]): DerivedQueue {
  if (s.turn === 0) return { shown: [], folded: [], crisis: false }
  const items = [...collectQueueItems(s, systems), ...unitItems(s)]
    // opportunities that have appeared twice lapse, section 8
    .filter(it => it.type !== 5 || (s.opportunitiesShown[it.key] ?? 0) <= C.queue.opportunityReturns)
  const groups = new Map<string, QueueGroup>()
  for (const it of items) {
    let g = groups.get(it.group)
    if (!g) {
      g = { group: it.group, type: it.type, title: it.title, body: it.body, explain: it.explain, items: [], rank: 0, since: it.since }
      groups.set(it.group, g)
    }
    g.items.push(it)
    g.since = Math.min(g.since, it.since)
    if (it.type < g.type) g.type = it.type
  }
  const out: QueueGroup[] = []
  for (const g of groups.values()) {
    if (g.items.length > 1) {
      const t = GROUP_TITLES[g.group]
      g.title = t ? t(g.items.length) : `${g.items.length} items: ${g.items[0].title}`
      g.body = 'Opens a list that can be resolved one at a time.'
    }
    // one sentence, once, onboarding brief section 4.3
    if (g.explain && s.charters[0].explained[g.group]) g.explain = undefined
    let magnitude = 0
    for (const it of g.items) magnitude += it.magnitude
    const persisted = Math.max(0, s.turn - g.since)
    g.rank = C.queue.typeWeight[g.type] + magnitude + persisted * C.queue.persistenceBoost * (g.type >= 3 ? 1 : 0)
    out.push(g)
  }
  out.sort((a, b) => b.rank - a.rank)
  const cap = C.queue.paces[s.settings.pace]
  const shown: QueueGroup[] = []
  const folded: QueueGroup[] = []
  let crisis = false
  for (const g of out) {
    if (g.type <= 2 || shown.length < cap) shown.push(g)
    else folded.push(g)
  }
  if (shown.filter(g => g.type === 1).length > C.queue.shown) crisis = true
  return { shown, folded, crisis }
}

/** Called when a turn ends: opportunities that were present count an appearance, and anything
 * unresolved is written to the dispatch per section 8. */
export function noteUnresolved(s: GameState, q: DerivedQueue, log: (text: string) => void) {
  for (const g of [...q.shown, ...q.folded]) {
    for (const it of g.items) {
      if (it.type === 5) s.opportunitiesShown[it.key] = (s.opportunitiesShown[it.key] ?? 0) + 1
    }
  }
  if (q.folded.length) {
    const n = q.folded.reduce((a, g) => a + g.items.length, 0)
    log(`Turn ended with ${n} item${n === 1 ? '' : 's'} folded. ${q.folded.map(g => g.title).join('; ')}.`)
  }
}
