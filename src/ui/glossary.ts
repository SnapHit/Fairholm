// The glossary. Onboarding brief section 5: every noun in the interface is a tappable term that
// opens two sentences and the current state. Nothing is taught in advance; the glossary is where
// the player goes when a word in the queue is unfamiliar.

import type { GameState, GoodId } from '../sim/state'
import { C } from '../sim/constants'
import { sellPrice, buyPrice } from '../sim/market'
import { passageCost, population } from '../sim/labour'
import { SEASON_NAMES, season, year } from '../sim/turn'

export interface Term { title: string; text: string; state?: (s: GameState) => string }

const GOODS: Record<GoodId, [string, string]> = {
  food: ['Food', 'Everyone eats two a turn and surplus banks toward a new colonist. It is never worth sending across the sea.'],
  timber: ['Timber', 'Cut from forest and turned into frame by the carpenter, which every building needs. Sells for little.'],
  gold: ['Gold', 'Dug from seams that run out. It sells high, then the seam is gone and the tile is old workings.'],
  horses: ['Horses', 'Grazed on grassland and bred in a stable. They mount outriders and pull haulers.'],
  ore: ['Ore', 'Mined from hills and highland. The smelter turns it into metal.'],
  metal: ['Metal', 'Refined ore. It branches into tooling at the toolworks and arms at the armoury, and cores need it too.'],
  tooling: ['Tooling', 'Tools, needed by every building and by improvers. The Company raises its price a little every year.'],
  arms: ['Arms', 'What makes a colonist a militia, or a battery. The price climbs every year whether you buy or not.'],
  flax: ['Flax', 'A crop a predecessor people can teach. Linen works turn it into linen.'],
  linen: ['Linen', 'Finished flax. A steady export that the Company pays well for.'],
  hemp: ['Hemp', 'A crop a predecessor people can teach. The rope works turns it into cordage.'],
  cordage: ['Cordage', 'Rope from hemp. The Company buys it for its own ships.'],
  madder: ['Madder', 'A dye crop a predecessor people can teach. The dye works turns it into dye.'],
  dye: ['Dye', 'Finished madder. Worth more than the crop by a wide margin.'],
  bloom: ['Bloom', 'A flowering crop found only on bloom meadow, taught by predecessors. The still turns it into attar.'],
  attar: ['Attar', 'Distilled bloom. Finishing turns attar and metal into cores.'],
  cores: ['Cores', 'The thing the whole crossing runs on, made from attar and metal. The Company wants them above all else.'],
  instruments: ['Instruments', 'Made only across the sea. Imported machines eat one a turn and the price only climbs.'],
}

export const TERMS: Record<string, Term> = {
  turn: { title: 'Turn', text: 'A turn is a month. Twelve make a year and every three the season turns.', state: s => `Turn ${s.turn} of ${s.settings.turns}, year ${year(s.turn)}, ${SEASON_NAMES[season(s.turn)]}.` },
  queue: { title: 'The queue', text: 'The queue is everything that needs a decision this turn, ranked. Losses first, then what the Company wants, then what is stuck, then what is idle, then chances.', state: s => `Pace is ${s.settings.pace}.` },
  fold: { title: 'The fold', text: 'When more needs attention than fits, the rest folds beneath. Losses and Company matters never fold.' },
  charter: { title: 'The charter', text: 'The charter is the Company paper that financed your crossing. It sets the charge on everything you send home, and it is what you will one day tear up.', state: s => `The charge is ${Math.round(s.company.charge * 100)} per cent.` },
  company: { title: 'The Company', text: 'The Company sent you, buys what you consign, and sells what you cannot make. It also sends demands, and a recall fleet when you declare.', state: s => `Fleet strength ${Math.round(s.company.fleetStrength)}. ${s.company.embargoed.length ? 'Embargoed: ' + s.company.embargoed.join(', ') + '.' : 'No embargoes.'}` },
  charge: { title: 'The charge', text: 'The Company keeps a share of every consignment. Each demand you accept raises it.', state: s => `${Math.round(s.company.charge * 100)} per cent.` },
  consign: { title: 'Consign', text: 'Consigning sends goods to the Company market in lots of twenty-five. Each lot moves the price, so a dump walks it down while you watch.', state: s => `Payment arrives ${C.market.crossingTurns[s.settings.crossing]} turns after the ship leaves.` },
  word: { title: 'Word', text: 'Word is reputation at home. Consigning earns it, and when enough has gathered a colonist takes passage to join you.', state: s => `${s.charters[0].word} Word held; next passage needs ${passageCost(s)}.` },
  passage: { title: 'Passage', text: 'A passage brings one colonist across. Each costs more Word than the last; gold can buy one outright.', state: s => `${s.charters[0].passages} passages so far.` },
  landing: { title: 'The landing', text: 'Your first settlement, where the Company ships call. Inland settlements haul here to consign, or build a consignment office.', state: s => s.settlements[0] ? `${s.settlements[0].name}.` : 'Not yet ashore.' },
  settlement: { title: 'Settlement', text: 'A settlement works the nine tiles around it and the buildings within. Every colonist in it has one job.', state: s => `${s.settlements.filter(x => x.owner === 0).length} of yours.` },
  colonist: { title: 'Colonist', text: 'A person. Each works one tile or one building, or stands idle, and each eats two food a turn.', state: s => `${s.settlements.filter(x => x.owner === 0).reduce((a, st) => a + population(st), 0)} across your settlements.` },
  debtor: { title: 'Debtor', text: 'A colonist working off the passage the Company paid. Debtors produce two less in buildings and cannot be taught.', state: s => `${countStanding(s, 'debtor')} at present.` },
  contracted: { title: 'Contracted', text: 'A colonist under contract, one less in buildings. Contracts run out with time and schooling.', state: s => `${countStanding(s, 'contracted')} at present.` },
  free: { title: 'Free', text: 'A colonist free of obligation, working at full output and able to learn a trade.', state: s => `${countStanding(s, 'free')} at present.` },
  master: { title: 'Master', text: 'A colonist who has mastered a trade, doubling output at it. Only masters can teach masters.', state: s => `${countStanding(s, 'master')} at present.` },
  school: { title: 'School', text: 'Schooling raises a colonist one standing. Tier one takes a long time, tier three much less.' },
  frame: { title: 'Frame', text: 'Frame is timber the carpenter has worked, counted toward the building under way. It is never traded.' },
  tier: { title: 'Tier', text: 'Each building line has three tiers. Each tier multiplies what its two workers can make.' },
  workers: { title: 'Workers', text: 'Two colonists fit in any building. Their standing sets their output, and the tier multiplies it.' },
  standingOrders: { title: 'Standing orders', text: 'Four rules a settlement follows by itself: what it is for, what to do with surplus, what to do with growth, and what to build. They never fight you.' },
  purpose: { title: 'Purpose', text: 'What a settlement is for. New arrivals take jobs that serve it, after feeding themselves.' },
  surplus: { title: 'Surplus rule', text: 'What a settlement does with stock above a threshold: consign, hold, ship to another settlement, or offer to a predecessor people.' },
  growth: { title: 'Growth rule', text: 'What happens when food banks a new colonist: keep them, or send them to another settlement.' },
  grievance: { title: 'Grievance', text: 'Grievance is the settled anger at the Company, gathered at the meeting house and spread by the press. It buys signatories and, at sixty per cent resolve across your settlements, a declaration.', state: s => `${Math.round(s.charters[0].grievance)} unspent, ${Math.round(s.charters[0].grievanceTotal)} gathered in all.` },
  resolve: { title: 'Resolve', text: 'How settled a settlement is against the Company, from the grievance gathered per head. Above half it works harder; left unresolved it works worse.' },
  signatory: { title: 'Signatory', text: 'Twelve people of standing who will put their name to your cause for grievance. Each brings something real, and the first is the consignment office.', state: s => `${s.charters[0].signatories.length} of twelve.` },
  declaration: { title: 'The declaration', text: 'Tearing up the charter. The Company then sends a recall fleet, and the game is won when the fleet is spent.', state: s => s.declaration?.declared ? 'Declared.' : 'Not yet.' },
  fleet: { title: 'The recall fleet', text: 'The fleet the Company will send when you declare. It grows with every grievance you gather, so you know its size before you choose.', state: s => `Strength ${Math.round(s.company.fleetStrength)}.` },
  demand: { title: 'Demand', text: 'The Company asks for a rise in the charge. Accept and it rises; refuse and the Company embargoes a good, which gathers grievance.' },
  embargo: { title: 'Embargo', text: 'The Company will not buy an embargoed good. Three signatories lift the embargoes and block the next two.' },
  predecessor: { title: 'Predecessor people', text: 'The people who were here before. They buy manufactured goods in kind, teach the four crops, and never sell their land.', state: s => `${s.predecessors.length} settlements on the map.` },
  agent: { title: 'Agent', text: 'A colonist stationed with a predecessor people. Better terms, slower alarm, and a say in who they trade with.' },
  alarm: { title: 'Alarm', text: 'How far a predecessor people have been pushed. Taking their ground raises it; an agent slows it.' },
  rival: { title: 'Rival charter', text: 'Three other charters landed on the same coast. They sell into the same market, and they can be fought or left alone.', state: s => s.charters.slice(1).map(c => `${c.name}: ${c.relation}`).join('. ') + '.' },
  militia: { title: 'Militia', text: 'A colonist with fifteen arms. Attack three, defence three, one move. Beaten, they lose the arms and are a colonist again.' },
  outrider: { title: 'Outrider', text: 'A militia with ten horses. Attack five, defence five, three moves. Beaten, they lose the horses and are militia.' },
  battery: { title: 'Battery', text: 'Thirty arms on wheels. Strong against settlements, weak in the open. Damaged, it stays damaged.' },
  improver: { title: 'Improver', text: 'A colonist with ten tooling. Roads, clearing, ploughing. Signatory four doubles the pace.' },
  hauler: { title: 'Hauler', text: 'Four horses and a wagon. Carries a hundred and twenty between settlements, two moves, needs a road or open ground.' },
  quality: { title: 'Quality', text: 'Raw, hardened, sworn. Each step adds two to attack and defence. Fighting hardens; signatory eight swears militia in.' },
  works: { title: 'Works', text: 'Palisade, redoubt, bastion. Each multiplies the defence of the garrison, caps its size, and adds battery slots.' },
  hull: { title: 'Hull', text: 'A ship built at a wharf. Lighter, trader, raider, cutter. Speed decides who can catch whom.' },
  storage: { title: 'Storage', text: 'Each good spoils above the cap, except food. A storehouse raises the cap.' },
  spoilage: { title: 'Spoilage', text: 'Goods above the storage cap are lost at the end of the turn. Consign or haul first.' },
  imported: { title: 'Imported machine', text: 'A tier-three machine bought from across the sea for gold. It eats an instrument a turn and fails with age; starved, it works as tier two.' },
  dispatch: { title: 'The dispatch', text: 'What happened last turn, and why. Tap an entry for the cause.' },
  intent: { title: 'Objective', text: 'One line at the top saying what you are working toward. You can change it.' },
  season: { title: 'Season', text: 'Four a year, recolouring the map. Nothing else changes with the season.', state: s => SEASON_NAMES[season(s.turn)] + '.' },
  anchorage: { title: 'Anchorage', text: 'A stretch of coast ships can land on. The recall fleet chooses one at random and narrows over three turns.' },
  garrison: { title: 'Garrison', text: 'Units inside a settlement. The works multiply their defence; the works also cap how many fit.' },
  blockade: { title: 'Blockade', text: 'Company ships off your landing stop passages and consignments until they are driven off.' },
  difficulty: { title: 'The charter terms', text: 'Generous, standard, hard, punitive. They set the starting party, the charge and the fleet. They can be eased any time, never tightened.', state: s => `${s.settings.difficulty}.` },
}

for (const [g, [title, text]] of Object.entries(GOODS) as [GoodId, [string, string]][]) {
  TERMS[g] = {
    title, text,
    state: s => {
      const traded = C.market.goods[g].traded
      const held = s.settlements.filter(x => x.owner === 0).reduce((a, st) => a + st.stock[g], 0)
      return `${held} held. ${traded ? `Sells at ${sellPrice(s, g)}, buys at ${buyPrice(s, g)}.` : 'Not traded with the Company.'}`
    },
  }
}

function countStanding(s: GameState, st: string): number {
  let n = 0
  for (const x of s.settlements) if (x.owner === 0) for (const c of x.colonists) if (c.standing === st) n++
  for (const u of s.units) if (u.owner === 0 && u.colonist && u.colonist.standing === st) n++
  return n
}

export function term(key: string): Term | null { return TERMS[key] ?? null }
