// The slim card that takes the queue bar's place while something on the map is chosen. Settlement
// screen and layout brief section 1, as changed on 2 October 2026: the map is the hero, and every
// panel opens at the smallest size that answers the question and grows only when the player asks.
//
// Two lines, what it is and the one thing worth knowing now, and at most three actions that fit
// the moment: Found here when it can, Save and Cancel while a circuit is planned. Movement has no
// control here: a hold aims the route, the line says what it is, and letting go moves (DECISIONS.md
// 163). Everything else is behind More, which opens the full sheet. End turn stays where it is.

import type { GameState, Unit, UnitOrder } from '../sim/state'
import type { NoRoute } from '../sim/route'
import { unitLabel } from '../sim/queue'
import { maxMoves, unitAttack, unitDefence, isHull } from '../sim/units'
import { neighbours8, isLand } from '../sim/worldgen'
import { foundingProblem } from '../sim/settlement'
import { tileOffers, tileYield } from '../sim/labour'
import { sightMask, unitVisible, settlementKnown } from '../sim/fog'
import { C } from '../sim/constants'
import { tileLook, tileWords } from '../render/tiles'
import { GOOD_WORDS, standingWords } from './selectors'
import { oddsWords } from './route'
import { button, plural } from './dom'
import type { App, UiRoute, Authoring } from './app'

/** What the card shows: a title with a short tag beside it (the moves left), one line, the actions
 *  that fit, and what More opens, or null where there is nothing more to say. */
export interface Card {
  title: string
  tag: string | null
  /** What a tap on the tag does, where it does anything: the lander's aboard count chooses the next
   *  one off, so a hold on the shore and a release sends them ashore. */
  tagAction?: () => void
  line: string
  warn: boolean
  actions: HTMLElement[]
  more: (() => void) | null
}

/** Which way from one tile to another, in a word. */
export function bearing(w: number, from: number, to: number): string {
  const dx = (to % w) - (from % w), dz = Math.floor(to / w) - Math.floor(from / w)
  const ns = dz < 0 ? 'north' : dz > 0 ? 'south' : ''
  const ew = dx < 0 ? 'west' : dx > 0 ? 'east' : ''
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'here'
}

const ORDER_WORDS: Record<UnitOrder['kind'], string> = {
  explore: 'exploring by itself',
  goto: 'on its way',
  garrison: 'garrisoned',
  patrol: 'on patrol',
  haul: 'on a haul route',
  improve: 'at work on the ground',
  reserve: 'in reserve',
  screen: 'screening',
}

function cargoWords(u: Unit): string | null {
  const held = Object.entries(u.cargo).filter(([, n]) => n)
  return held.length ? 'carrying ' + held.map(([g, n]) => `${n} ${(GOOD_WORDS[g as keyof typeof GOOD_WORDS] ?? g).toLowerCase()}`).join(', ') : null
}

/** The plotted route in one line: "4 tiles, 1 turn", or "Attack Company regulars, 2 in 10". */
export function routeLine(s: GameState, u: Unit, r: UiRoute): string {
  if (!r.ok) return noRouteWords(s, u, r)
  if ('ashore' in r) {
    const ground = tileWords(tileLook(s, r.end)).toLowerCase()
    return u.aboard.length <= 1
      ? `Ashore onto ${ground}. The last one aboard: the lander cannot found until someone is back.`
      : `Ashore onto ${ground}, this turn.`
  }
  const turns = plural(Math.max(1, r.arrives), 'turn')
  const later = r.startsNextTurn ? ', starting next turn' : ''
  if (r.kind === 'attack') {
    const odds = r.odds === null ? 'odds unknown until in sight' : oddsWords(r.odds).toLowerCase()
    return `Attack ${r.target}, ${odds}${r.arrives > 1 ? `, in ${turns}` : ''}${later}${r.declares !== null ? `. A declaration of war on ${s.charters[r.declares].name}` : ''}`
  }
  if (r.kind === 'board') return r.arrives <= 1 ? 'Back aboard the lander, this turn' : `Back aboard the lander in ${turns}${later}`
  return `${plural(r.path.length, 'tile')}, ${turns}${r.unseen.some(Boolean) ? ', through fog' : ''}${later}`
}

/** Why there is no route, in the card's words. For the lander holding the shore beside it the card
 *  says what the shore is and that Found here beaches it; letting go there moves nothing, because
 *  the lander cannot go ashore. A passenger is sent ashore by choosing them from the aboard count. */
function noRouteWords(s: GameState, u: Unit, r: NoRoute): string {
  if (r.problem === 'landerAshore') {
    if (r.shore === null) return 'The lander goes ashore by founding. Sail in beside that shore first.'
    const problem = foundingProblem(s, r.shore)
    const who = u.aboard.length > 0 ? ` Tap the aboard count to send one of them to look about.` : ''
    return problem ? `Not here: ${problem}.${who}` : `${cap(tileWords(tileLook(s, r.shore)).toLowerCase())}. Found here beaches the lander.${who}`
  }
  return r.words
}

/** A unit of the player's, chosen. */
export function unitCard(app: App, s: GameState, u: Unit): Card {
  const w = s.world.width, h = s.world.height
  const r = app.route && app.route.unit === u.id && !('ashore' in app.route) ? app.route : null
  const actions: HTMLElement[] = []
  const lander = u.kind === 'lander'
  const card: Card = {
    title: unitLabel(u.kind),
    // the lander's tag is its aboard count, and a tap on it chooses the next one off; everything
    // else wears its moves
    tag: lander ? `${u.aboard.length} aboard` : `${u.moves}/${maxMoves(u)} moves`,
    tagAction: lander && u.aboard.length > 0 ? () => app.choosePassenger(u.id) : undefined,
    line: '',
    warn: false,
    actions,
    more: () => app.openMore({ kind: 'unit', id: u.id }, u.tile),
  }
  // the shore Found here is looking at, and whether it may be founded on
  const target = lander && app.foundTarget !== null && neighbours8(w, h, u.tile).includes(app.foundTarget) ? app.foundTarget : null
  const canFound = target !== null && foundingProblem(s, target) === null && u.aboard.length > 0
  const found = () => button('Found here', () => { void app.found(u.id, target!) }, 'go')

  if (r) {
    // the route under the finger, or why there is none after a release that moved nothing: the
    // release is the only thing that commits, so there is nothing here to press
    card.line = routeLine(s, u, r)
    if (!r.ok) {
      const shore = r.shore
      card.warn = shore === null || !canFound
      if (shore !== null && canFound) actions.push(found())
    }
    return card
  }
  if (app.aimNotice) {
    card.line = app.aimNotice
    card.warn = true
    return card
  }

  const bits: string[] = []
  if (lander) {
    bits.push(`${u.moves}/${maxMoves(u)} moves`)
    if (target !== null) {
      const problem = foundingProblem(s, target)
      bits.push(problem ? `the shore ${bearing(w, u.tile, target)} is ${problem}` : `shore ${bearing(w, u.tile, target)}: ${tileWords(tileLook(s, target)).toLowerCase()}`)
      if (canFound) actions.push(found())
    } else if (neighbours8(w, h, u.tile).some(n => isLand(s.world.tiles[n]) && s.world.tiles[n].explored)) {
      bits.push('no shore here to found on')
    } else bits.push('hold where to go, and let go to sail')
  } else {
    if (u.colonist) bits.push(standingWords(u.colonist))
    else if (!isHull(u.kind)) bits.push(u.quality)
    if (u.order) bits.push(ORDER_WORDS[u.order.kind])
    const cargo = cargoWords(u)
    if (cargo) bits.push(cargo)
    if (!u.order && !cargo) bits.push(u.moves > 0 ? 'hold where to go, and let go to set off' : 'hold where to go: it sets off next turn')
    // a colonist founds where it stands, once the lander has founded the first settlement
    if (u.kind === 'colonist' && s.settlements.some(x => x.owner === 0) && !s.settlements.some(x => x.tile === u.tile) && foundingProblem(s, u.tile) === null) {
      actions.push(button('Found here', () => { void app.found(u.id, u.tile) }, 'go'))
    }
  }
  // the lander's stores are in its detail: they go ashore with the founding and are not news
  card.line = cap(bits.join(' · '))
  return card
}

/** A passenger chosen from the lander's aboard count or its detail: the next one off, whom a hold
 *  on the shore beside the lander and a release sends ashore. */
export function passengerCard(app: App, s: GameState, lander: Unit): Card {
  const which = app.passenger?.aboard ?? lander.aboard.length - 1
  const next = lander.aboard[which] ?? lander.aboard[lander.aboard.length - 1]
  const r = app.route && app.route.unit === lander.id && ('ashore' in app.route || !app.route.ok) ? app.route : null
  const actions: HTMLElement[] = []
  const card: Card = {
    title: next ? `A ${standingWords(next)} colonist, aboard` : 'No one aboard',
    tag: null,
    line: 'Hold the shore beside the lander, and let go to send them ashore.',
    warn: false,
    actions,
    more: () => app.openMore({ kind: 'unit', id: lander.id }, lander.tile),
  }
  if (r) {
    card.line = routeLine(s, lander, r)
    card.warn = !r.ok
  }
  actions.push(button('Stay aboard', () => app.select(lander.id), 'ghost'))
  return card
}

/** A tile looked at with a tap: what is on it as far as the player can see, or the ground itself. */
export function tileCard(app: App, s: GameState, tile: number): Card {
  const t = s.world.tiles[tile]
  const fog = C.flags.fogOfWar
  const card: Card = { title: '', tag: null, line: '', warn: false, actions: [], more: () => app.openMore({ kind: 'tile', tile }, tile) }
  if (fog && !t.explored) {
    card.title = 'Unexplored'
    card.line = 'Nothing is known of this ground yet. Go toward it and it will show itself.'
    card.more = null
    return card
  }
  const mask = fog ? sightMask(s) : null
  const foe = s.units.find(o => o.tile === tile && o.owner !== 0 && (!mask || unitVisible(s, o, mask)))
  const st = s.settlements.find(x => x.tile === tile && x.owner !== 0 && (!fog || settlementKnown(x)))
  const whose = (owner: number) => owner === -1 ? 'the Company' : s.charters[owner]?.name ?? 'a rival'
  if (foe) {
    card.title = foe.owner > 0 ? `${s.charters[foe.owner]?.name ?? 'A rival'}'s ${unitLabel(foe.kind).replace(/^(A|An|The) /, '').toLowerCase()}` : unitLabel(foe.kind)
    card.line = cap(`${whose(foe.owner)} · attack ${unitAttack(foe, 'open')}, defence ${unitDefence(foe, !!st)}`)
    return card
  }
  if (st) {
    card.title = st.name
    card.line = cap(`${whose(st.owner)} · ${plural(st.abstractPop, 'person', 'people')}`)
    return card
  }
  card.title = cap(tileWords(tileLook(s, tile)))
  const yields = tileOffers(t).map(g => ({ g, y: tileYield(s, tile, g, null) })).filter(e => e.y > 0).sort((a, b) => b.y - a.y)
  const owner = t.owner !== null ? s.charters[t.owner] : null
  const bits = [yields.length ? yields.slice(0, 4).map(e => `${GOOD_WORDS[e.g]} ${e.y}`).join(', ') : 'nothing to work here']
  if (owner) bits.push(owner.player ? 'your ground' : `${owner.name}'s ground`)
  card.line = cap(bits.join(' · '))
  return card
}

/** The card while a circuit or a patrol is being planned: what has been tapped so far, and Save and
 *  Cancel. More opens the stops' detail, where each stop's load and unload and the risk posture
 *  are set. */
export function authoringCard(app: App, s: GameState, a: Authoring): Card {
  const u = s.units.find(x => x.id === a.unit)
  const haul = a.kind === 'haul'
  const names = haul ? a.stops.map(st => s.settlements[st.settlement]?.name ?? '?') : a.tiles.map(t => tileWords(tileLook(s, t)).toLowerCase())
  const n = names.length
  const enough = n >= 2
  const line = n === 0
    ? (haul ? 'Tap your settlements in the order to visit them.' : 'Tap the tiles the patrol should walk between.')
    : `${names.map((x, i) => `${i + 1} ${x}`).join(', ')}${enough ? `, and back to ${names[0]}` : haul ? '. Tap the next settlement.' : '. Tap the next tile.'}`
  const actions: HTMLElement[] = []
  if (enough) actions.push(button('Save', () => { app.saveAuthoring() }, 'go'))
  actions.push(button('Cancel', () => app.cancelAuthoring(), 'ghost'))
  return {
    title: haul ? `Planning a haul circuit${u ? ` for ${unitLabel(u.kind).toLowerCase()}` : ''}` : `Planning a patrol${u ? ` for ${unitLabel(u.kind).toLowerCase()}` : ''}`,
    tag: n ? plural(n, haul ? 'stop' : 'point') : null,
    line,
    warn: false,
    actions,
    more: haul && n > 0 ? () => app.open({ kind: 'authoring' }) : null,
  }
}

function cap(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}
