// The queue is derived, never stored. Turn, queue and standing orders brief.
// Events go to the dispatch; only decisions come here. Identical conditions across many settlements
// collapse into one item (section 6). Eight are shown by default and the rest are folded, not
// filtered (section 7). Types 1 and 2 never fold. Persistence adds an escalating rank boost.

import { C } from './constants'
import type { GameState, QueueItem, QueueGroup, DerivedQueue } from './state'
import type { System } from './turn'
import { collectQueueItems } from './turn'
import { foundingProblem } from './settlement'
import { unseenLandNear, bestSites, nearbyFrontier } from './autopilot'
import { isHull } from './units'
import { dist } from './worldgen'

/** Plural titles for grouped conditions. The group key is the condition, not the settlement. Each
 *  fits the queue bar on a phone beside End turn, about thirty characters (decision 196). */
const GROUP_TITLES: Record<string, (n: number) => string> = {
  hunger: n => `Short of food at ${n} places`,
  spoilage: n => `Losing goods at ${n} places`,
  purposeLost: n => `Purpose lost at ${n} places`,
  buildBlocked: n => `${n} build orders cannot start`,
  buildEmpty: n => `${n} empty build orders`,
  idle: n => `People idle at ${n} places`,
  reviewOrders: n => `${n} sets of orders to review`,
  growthAsk: n => `New colonists at ${n} places`,
  unitIdle: n => `${n} units are awaiting orders`,
  blockade: n => `${n} settlements blockaded`,
  unitContact: n => `${n} units made contact`,
  routeUnviable: n => `${n} haulage routes unviable`,
  threatened: n => `${n} settlements threatened`,
  breach: n => `Works breached at ${n} places`,
  predecessorWants: n => `${n} peoples want what you make`,
  rivalFounded: n => `${n} rivals settled your ground`,
  buildingUnlocked: n => `${n} new buildings available`,
  // what is not working, and what is going to waste: src/sim/problems.ts
  buildStalled: n => `${n} buildings not rising`,
  inputWasted: n => `Needed timber sold at ${n} places`,
  workerWasted: n => `Working for nothing at ${n} places`,
  masterMisplaced: n => `${n} masters away from their trade`,
  schoolStalled: n => `${n} schools stopped teaching`,
  schoolFutile: n => `${n} schools teaching in vain`,
  schoolIdle: n => `${n} schools with no pupil`,
  machineStarved: n => `${n} machines need instruments`,
  orderUnsat: n => `Orders failing at ${n} places`,
  orderBlocked: n => `Orders held up at ${n} places`,
  dumping: n => `Your orders dump ${n} goods`,
  exploreDone: n => `${n} explorers have seen it all`,
  haulEmpty: n => `${n} circuits carry nothing`,
}

/** Queue items that come from units rather than systems. */
function unitItems(s: GameState): QueueItem[] {
  const out: QueueItem[] = []
  for (const u of s.units) {
    if (u.owner !== 0) continue
    const contact = u.since['contact']
    if (contact !== undefined) {
      out.push({ key: `contact:${u.id}`, group: 'unitContact', type: 1, title: `${unitLabel(u.kind)} made contact`, body: 'It has reverted to your control. Hold where you want it to go and let go, or let it wait where it is.', unit: u.id, tile: u.tile, magnitude: 5, since: contact, choices: [{ label: 'Wait where it is', action: { t: 'setUnitOrder', unit: u.id, order: { kind: 'reserve' } } }], opens: 'unit' })
      continue
    }
    if (!u.order && u.kind !== 'companyShip') {
      const atSettlement = s.settlements.some(st => st.tile === u.tile && st.owner === 0)
      if (atSettlement && (u.kind === 'militia' || u.kind === 'battery' || u.kind === 'damagedBattery')) continue
      const since = u.since['idle'] ?? s.turn
      const lander = u.kind === 'lander'
      // a colonist standing where it may found is offered Found here; elsewhere the card says where
      // the marked ground is, which shows on the map while it is chosen (DECISIONS.md 195)
      const canFound = u.kind === 'colonist' && s.settlements.some(x => x.owner === 0) && !s.settlements.some(x => x.tile === u.tile) && foundingProblem(s, u.tile) === null
      const colonistBody = canFound ? 'It stands on ground it can found a settlement on. Found here, or hold where you want it to go and let go to set off.'
        : 'Tap it, and the best ground for a settlement within a walk is marked. Hold a marked place and let go to walk there, then found; or walk it home to rejoin.'
      // or it goes on looking by itself, and stops when it sees ground fit for a settlement
      // only while no good ground has been seen within reach: with some seen, it is marked when the
      // colonist is chosen, and the hold is the way there
      const look = u.kind === 'colonist' && !canFound && s.settlements.some(x => x.owner === 0) && unseenLandNear(s, u.tile, C.autopilot.settleRange.max) && !bestSites(s, { tile: u.tile }, 1, { seen: true }).length
      // anything else can be told to wait, which it does until it is moved or given an order: in port
      // where a ship lies beside a settlement of the player's (decision 197)
      const inPort = isHull(u.kind) && s.settlements.some(x => x.owner === 0 && (x.tile === u.tile || dist(s.world.width, x.tile, u.tile) <= 1))
      const waits = lander || u.kind === 'colonist' ? null : inPort ? 'Wait in port' : 'Wait here'
      // a ship can explore the water near home by itself, while any of it is unseen (decision 200)
      const sweep = isHull(u.kind) && !lander && nearbyFrontier(s, u).length > 0
      out.push({ key: `unitIdle:${u.id}`, group: lander && !u.path.length ? 'lander' : 'unitIdle', type: lander ? 2 : 4, title: lander ? 'The lander is at sea' : `${unitLabel(u.kind)} is awaiting orders`, body: lander ? `${u.aboard.length} aboard. Hold where you want to go and let go to sail toward land, then beach it on the shore of your choosing to found the first settlement.` : u.kind === 'colonist' ? colonistBody : u.kind === 'lighter' ? 'The boat the lander carried, afloat beside your settlement. Let it explore the coast nearby, or hold where you want it to go and let go to sail.' : 'Give it a standing order, or hold where you want it to go and let go to set off.', unit: u.id, tile: u.tile, magnitude: 1, since, choices: canFound ? [{ label: 'Found here', action: { t: 'found', unit: u.id } }] : look ? [{ label: 'Look for ground', action: { t: 'setUnitOrder', unit: u.id, order: { kind: 'explore', until: 'site' } } }] : [...(sweep ? [{ label: 'Explore nearby', action: { t: 'setUnitOrder', unit: u.id, order: { kind: 'explore' } } }] : []), ...(waits ? [{ label: waits, action: { t: 'setUnitOrder', unit: u.id, order: { kind: 'reserve' } } }] : [])], opens: 'unit',
        explain: lander ? `Tap the lander, then press and hold where you want to go. The course shows while you hold, and nothing moves yet; let go to sail. It goes up to ${C.lander.moves} tiles a turn and stops at any coast it meets. When land is beside it, hold the shore and let go: nothing moves, and the card offers Found here.` : u.kind === 'colonist' ? 'Tap the unit, then press and hold where you want it to go. The way shows while you hold; let go to walk. A colonist in open country can found a settlement.' : undefined })
    }
  }
  return out
}

export function unitLabel(kind: string): string {
  const names: Record<string, string> = {
    colonist: 'A colonist', militia: 'Militia', outrider: 'An outrider', battery: 'A battery', damagedBattery: 'A damaged battery',
    improver: 'An improver', hauler: 'A hauler', lighter: 'A lighter', trader: 'A trader', raider: 'A raider', cutter: 'A cutter',
    regulars: 'Company regulars', horse: 'Company horse', siegeTrain: 'A Company siege train', damagedSiegeTrain: 'A damaged siege train', companyShip: 'A Company landing craft',
    lander: 'The lander',
  }
  return names[kind] ?? kind
}

/** What one tap can do across a group, which the brief lets be resolved in bulk or one at a time
 *  (section 6): the first fix of every card that has one, each read afresh after the one before.
 *  Never a founding, which is a choice of ground made card by card. Where every card offers the same
 *  fix the button says it, "Wait in port, all 4"; where they differ it says "Fix all 4", and only for
 *  what is wrong (a loss, something stuck or idle), never for a chance or a Company card. Null where
 *  fewer than two cards would be done. DECISIONS.md 198. */
export function bulkFix(g: QueueGroup): { label: string; keys: string[]; same: string | null } | null {
  const fixable = g.items.filter(it => it.choices.length > 0 && (it.choices[0].action as { t?: string }).t !== 'found')
  if (fixable.length < 2) return null
  const labels = new Set(fixable.map(it => it.choices[0].label))
  const same = labels.size === 1 ? fixable[0].choices[0].label : null
  if (!same && g.type !== 1 && g.type !== 3 && g.type !== 4) return null
  return { label: same ? `${same}, all ${fixable.length}` : `Fix all ${fixable.length}`, keys: fixable.map(it => it.key), same }
}

export function deriveQueue(s: GameState, systems: System[]): DerivedQueue {
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
      g.body = bulkFix(g) ? 'Do them all in one tap, or open the list to take them one at a time.' : 'Opens a list that can be resolved one at a time.'
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
