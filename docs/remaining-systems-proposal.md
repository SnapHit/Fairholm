# Remaining systems proposal

Written 21 August 2026. Covers the six systems still undesigned: grievance, signatories, the Company
market, buildings, the predecessor market, and terrain. Companion to all existing briefs.

**Method, per instruction.** The 1994 design is the baseline. Structures are adopted whole wherever
they hold, adapted where our own constraints make something else better, and replaced only where the
legal constraint requires it. **Every departure is marked and justified.** Every number is derived from
this game's parameters rather than transcribed, per section 8.3.

**Nothing here is a feel constant.** All numbers are starting values.

---

## 1. Grievance, which is the spine

### Adopted whole from the original

The structure is exceptional and it is taken unchanged: **one resource does four jobs at once, and one
of them arms your enemy.**

- Produced by colonists in civic work, multiplied by a press
- Accumulates **nationally**, spending on signatories
- Accumulates **per settlement**, setting that settlement's resolve
- **Gates the declaration** at a national threshold
- **Scales the recall fleet** in proportion to cumulative national production

The player cannot prepare to win without making winning harder. That is the fourth ratchet and it is
the best single idea in the original.

### Vocabulary

Section 8.1 forbids the original's terms. Working names:

- **Grievance**, the produced resource
- **Resolve**, the per-settlement percentage
- **The meeting house**, where it is produced, and **the press** and **the bulletin**, which multiply
  it

### Production

| | |
|---|---|
| Meeting house | 2 workers, 3 grievance each |
| Press | ×1.5 |
| Bulletin | ×2 |
| Maximum per settlement | 12 per turn |

### Resolve

**250 accumulated grievance per point of population** gives that settlement full resolve.

*Derivation:* a settlement of 8 needs 2,000, which at 12 a turn is about 167 turns, roughly a third of a
standard game. The original spends a similar fraction of its length on this and the pacing is right.

- Crossing **50 per cent** resolve raises production in that settlement
- Crossing **100 per cent** raises it again
- Resolve decays slowly if grievance production stops

### The unresolved penalty, which is the anti-megacity device

**Adopted, with the mechanism intact and the number changed.** If a settlement contains more than **6
unresolved colonists in absolute terms**, not as a percentage, everything it produces takes a flat
penalty. Threshold 8 at the easiest difficulty, 4 at the hardest.

This is what actually stops one enormous city in the original, because a large settlement needs a high
percentage merely to avoid the penalty. It sits inside the rebellion-percentage pressure already listed
in section 5 of the economy brief rather than being a fourth pressure.

### The declaration gate

**60 per cent national resolve**, measured as a share of total population.

*Departure:* the original uses 50. Sixty makes it a clear supermajority rather than a bare one, which
suits repudiating a debt rather than winning an election, and it is not their number.

### The four sinks

Grievance production feeds the national and settlement counters simultaneously. It is *spent* only on
signatories.

1. Settlement resolve
2. The national declaration gate
3. Signatories, which consume from the national pool
4. Wartime intervention, per section 12 of the military brief

---

## 2. Signatories, which are the tech tree

### Adopted

There is no research. **Progress is people, recruited with grievance, each bringing a permanent
capability.** The cost of each successive one rises on a fixed schedule, and grievance in excess of the
cost on the turn one joins is discarded, which creates a small timing optimisation.

**One candidate is offered per category at a time and the player chooses which to work toward.** That
choice is the tech decision.

### Departures

- **Twelve, not twenty-five.** The mechanics brief judged the list could be a quarter the length and
  serve the same function. Twelve keeps every one memorable and keeps the sheet readable on a phone
- **Four categories, not five**, matching our systems rather than theirs: **Trade, Land, Arms, Voice**
- **Entirely our own list**, since the original's names are explicitly forbidden

### The twelve

**Trade**

1. Enables the **consignment office**. The largest single power spike in the game
2. Narrows the Company's spread between what it pays and what it charges, permanently
3. Lifts all standing embargoes and blocks the next two

**Land**

4. Improvers work at double rate; roads cost nothing to lay
5. New settlements are founded with a palisade already standing
6. Reveals the terrain of the whole map, though not what is on it

**Arms**

7. Batteries cost less to raise, and a damaged battery may be recovered once
8. Promotion comes faster, and militia may reach sworn rank
9. Coastal batteries fire twice per turn

**Voice**

10. Enables the **bulletin**
11. Grievance production rises by half, nationally
12. Passage costs fall and immigration accelerates

### Cost schedule

**First at 300 national grievance, each subsequent one 250 more than the last.** The twelfth costs
3,050 and the full set costs about 20,000.

*Derivation:* a mature empire produces upward of 100 a turn nationally, so a full set is reachable but
only for a player who has invested in civic work across many settlements. Most games should end with
eight or nine of them, which makes the choice of which to pursue matter.

---

## 3. The Company market

**The most load-bearing system in the game.** Structure adopted almost entirely; the parameters are
ours.

### The model

Every good carries:

| Parameter | Meaning |
|---|---|
| `price` | What the Company pays you now |
| `spread` | It sells to you at `price + spread` |
| `floor`, `ceiling` | The bounds of drift |
| `volumeToShift` | Cumulative units sold that move the price down by one |
| `recovery` | Per-turn movement back toward baseline when little is sold |
| `secularDrift` | Per-turn movement of the baseline itself, signed |

**Prices fall with cumulative volume and recover when supply stops.** That is ratchet one.
**Three goods have a positive secular drift**, so their baseline climbs all game regardless of what
anyone does. That is ratchet two.

### Opening parameters

| Good | Opens at | Floor | Ceiling | Volume to shift | Note |
|---|---|---|---|---|---|
| Gold | 22 | 2 | 24 | 40 | Collapses fastest, never recovers. **The trap** |
| Food | 2 | 1 | 3 | 250 | Barely worth freight |
| Timber | 2 | 1 | 4 | 200 | Barely worth freight |
| Ore | 3 | 1 | 6 | 150 | |
| Metal | 7 | 2 | 12 | 110 | |
| Crops A, B, C | 3 to 5 | 1 | 7 | 120 | Slow recovery |
| Grown export | 6 | 2 | 9 | 110 | |
| Goods A, B, C | 9 to 14 | 3 | 22 | 90 | Good recovery |
| Essence | 15 | 5 | 26 | 80 | |
| Finished | 18 | 6 | 34 | 70 | Highest ceiling. **The money** |
| Horses | 6 | 2 | 14 | 90 | |
| Tooling | 4 | 2 | 14 | — | **Drifts up** |
| Arms | 5 | 3 | 24 | — | **Drifts up** |
| Instruments | 12 | 8 | 40 | — | **Drifts up steeply** |

**Refining roughly triples unit value and, more importantly, raises the ceiling.** Raw caps around 7,
finished reaches 34. Value-add is the whole mid-game, exactly as in the original.

### Dumping

**Adopted, with a smaller lot.** A consignment is processed in lots and the price recalculates between
them, so a large shipment walks its own price down and the last lot fetches noticeably less than the
first.

*Departure:* lots of **25** rather than the original's hundred, per section 8.3, and because finer lots
make the price walk visible within a single sale, which teaches the lesson faster.

### Demands and embargoes

**Adopted.** The Company periodically demands a rise in its charge on consignments.

- **Accept** and the charge rises permanently
- **Refuse** and the Company **strikes that good from your charter**. You cannot consign it at all.
  Refusing is a public act and produces a burst of grievance

Starting charge **5 per cent**, rising 2 to 4 points per accepted demand, arriving every 30 to 50 turns
and accelerating. By the endgame a compliant player is paying 40 per cent or more, which is the
mechanical argument for independence.

*Departure in fiction only:* it is a charter charge rather than a royal tax, and refusal is a
repudiation rather than a specific historical act.

### The consignment office

**Adopted almost whole, because it is the best building in the original.** Unlocked by a signatory.

- Automatically sells surplus above a threshold each turn at the going price
- **Including goods under embargo**
- Requires no shipping at all
- **Built inland it cannot be blockaded**, which now matters twice over per section 8 of the rival
  charters brief
- Continues to work after the declaration at a smuggler's rate

### Rival coupling

Per section 4 of the rival charters brief: your own volume moves your price fully, a rival's moves it by
0.3 of that.

---

## 4. Buildings and tiers

### Adopted

- Three tiers for most production lines, each multiplying output
- Construction consumes **Frame**, the internal accumulator, plus **Tooling**
- Higher tiers gate on population and sometimes on a signatory
- Storage capacity is a building, and anything above capacity spoils

### Departures

- **Two workers per building at every tier**, per the colonists brief. Tiers multiply output rather than
  adding slots
- **Storage ladder of 80 / 200 / 400**, per section 8.3
- **Not every line gets three tiers**, which varies the shape and is also cheaper to build

### The list

| Line | Tiers | Converts |
|---|---|---|
| Carpenter's shop → Sawmill | 2 | Timber → Frame |
| Smelter → Foundry → Ironworks | 3 | Ore → Metal |
| Toolworks → Manufactory | 2 | Metal → Tooling |
| Armoury → Magazine → Arsenal | 3 | Metal → Arms |
| Three refineries, one per export chain | 3 each | Crop → Good |
| Still → Distillery → Works | 3 | Grown → Essence |
| Finishing house → Finishing works | 2 | Essence + Metal → Finished |
| Meeting house | 1 | Civic, grievance |
| Press → Bulletin | 2 | Grievance multiplier |
| School → Academy → Institute | 3 | Education, per the colonists brief |
| Granary → Warehouse → Depot | 3 | Storage 80 / 200 / 400 |
| Stable | 1 | Horses breed faster |
| Wharf → Drydock → Shipyard | 3 | Build and repair hulls |
| Palisade → Redoubt → Bastion | 3 | Per section 7 of the military brief |
| Agent's office | 1 | Multiplies Word, per section 6 |
| Consignment office | 1 | Signatory-gated |

### Cost schedule

| Tier | Frame | Tooling | Gate |
|---|---|---|---|
| 1 | 30 | 0 | — |
| 2 | 80 | 25 | population 5 |
| 3 | 180 | 90 | population 9, sometimes a signatory |

**Every settlement begins with a meeting house and the tier-one production building for whatever its
terrain suggests**, so a new settlement is immediately useful, which is what makes founding worth one
tap.

### Buy or build, made concrete

Per section 6 of the economy brief, tier three has two paths:

| | Built locally | Imported machine |
|---|---|---|
| Cost | 180 Frame, 90 Tooling | Gold now |
| Time | Slow | Immediate |
| Running cost | None | **Consumes Instruments every turn** |
| Failure | Never | **Rising chance each year. On failure it drops to tier two until replaced** |
| Ratchet | Reduces dependence | Deepens it |

---

## 5. The predecessor market

**Adopted almost entirely**, because the mechanics brief judges it the most interesting trading system
in the original and its shape is what makes trading never feel solved.

### Taken unchanged

- They buy **manufactured goods only**. Not food, not raw materials, and they will not take them as
  gifts
- **Each settlement pays a strong premium for one good and a small premium for two others**, and these
  rotate
- **A settlement will not buy the same good twice in succession.** You must offer something else in
  between, which forces mixed cargo and rotation between settlements
- **A transaction cap**, and **no charge is paid on it**, which makes them a genuine alternative to the
  Company
- **One haggle**, then they take offence
- **Haulers get better terms than boats**
- **Their wealth rises as you trade with them**, improving prices
- **Arms and Horses are the most profitable things to sell, and they arm people you may later fight**
- **One skill per settlement, ever**, and those four skills exist nowhere else
- **A scout learns preferences and skills and is sometimes given gifts**
- **Alarm rises as you take ground near them**

### Departures

- **Transaction cap of 600**, derived rather than copied
- **They trade in kind as well as coin.** Per the setting brief they will not deal with the Company at
  all, so barter is native to them. This makes them a way to obtain goods without gold, which is a
  genuinely different proposition from the Company market and it matters early
- **Missionaries are replaced by agents.** A colonist stationed in a predecessor settlement improves
  your terms there and slows alarm. Same mechanical shape, no religious layer, and nothing archaic
  about the word
- **No conquest layer.** Alarm produces refusal to trade, raids on outlying improvements, and
  eventually closure to you entirely. It never produces a settlement you can take, per section 9 of the
  setting brief

### The contrast, which is the whole point

The Company is one deep pool with a slow price responding to cumulative national volume, rewarding
scale and specialisation. The predecessors are dozens of shallow pools with individual preferences, a
per-transaction cap and an anti-repetition rule, rewarding routing, variety and map knowledge.

One is a spreadsheet. The other is a travelling salesman problem. Having both is why the trading never
resolves into a single solved system.

---

## 6. Terrain and yields

### Adopted

- A base terrain set, plus **forested variants that clear to a specific base terrain and yield a one-off
  timber crop**
- **Rivers matter as much as resources.** A minor river is worth about what a road is worth; a major
  river is worth more and carries boats
- **Prime resources are deliberately mixed in kind:** some multiply, some add a flat amount. This is
  what creates the excellent case where an ordinary tile with a river and a road beats a prime tile
- **The settlement's own tile is worked for free** and can be improved after founding

### The set

Twelve types. Enough for the map to be worth reading, few enough to render distinctly at 44 pixels.

**Base, eight:**

| Terrain | Yields |
|---|---|
| Grassland | Food, horses graze |
| Plains | Food and one export crop |
| Downs | Export crop, horses graze well |
| Marsh | Poor, occasional ore |
| Highland | Ore, little food |
| Mountain | Ore, no food, slow to cross |
| Dry country | Very little, occasional gold |
| Water | Fish for food, carries boats |

**Forested, four**, each clearing to a stated base terrain:

| Forest | Clears to |
|---|---|
| Light woodland | Plains |
| Deep timber | Grassland |
| Highland forest | Highland |
| Coastal scrub | Downs |

### Yields and improvements

Base yields run **2 to 4**, so the numbers stay legible on a phone.

| Modifier | Effect |
|---|---|
| Road | Movement, and reduces freight distance cost |
| Clearing | Forest becomes its base terrain, one-off timber |
| Drainage or ploughing | +1 to the primary yield on cleared land |
| Minor river | +1 and free movement along it |
| Major river | +2, carries boats inland |
| Prime resource, multiplying | ×2 |
| Prime resource, flat | +2 |
| Specialist working it | ×2 |

**Old workings** appear where the map was inhabited before, per section 10 of the setting brief, and
where the player has exhausted gold. They are visual history and a small ore bonus, nothing more.

---

## 7. A correction to the colonists brief

The colonists brief has **Word** produced by civic work, competing with grievance for the same bodies.
That is the original's structure, where crosses and bells come from different buildings.

**Proposal: Word should accrue from consigned value instead.** The colony's reputation travels home
with the freight, so successful trade attracts settlers.

Three reasons:

1. It removes a whole civic production line and the colonists that staff it, which the queue budget and
   the phone both benefit from
2. It is better fiction. People emigrate toward money, and the Company's own ships carry the news
3. It ties immigration to trade, so the early game has one clear engine rather than two competing ones

The player keeps a lever: the **agent's office** multiplies Word, so investing in immigration is still a
choice, but it is a multiplier on trade rather than a parallel activity.

---

## 8. What this changes in existing briefs

- **Colonists brief.** Word now derives from consigned value, per section 7 above. Section 3 needs
  rewriting
- **Economy brief.** Storage ladder, the buy-or-build failure mechanic, and the terrain list are new
  detail rather than contradiction
- **Architecture brief section 20 is stale** and should be rewritten around the keyword findings: search
  is not the primary channel, itch.io is, and the name is the only search decision that matters
- **Persistence brief** still needs the world-versus-play randomness split from section 10 of the
  military brief

---

## 9. What must be tuned by playing

Everything numeric above, and these first:

- **The grievance-to-fleet curve**, which now carries most of the endgame difficulty
- **250 grievance per population** for resolve, which sets the pace of the whole second half
- **The volume-to-shift figures**, which decide whether dumping feels punishing or trivial
- **The secular drift on Tooling, Arms and Instruments**, which is ratchet two and is currently a guess
- **The signatory cost schedule**, which decides how many a normal game sees
- **Predecessor premiums and the transaction cap**, which decide whether their market is worth the
  attention. The original's community disagrees about this, which suggests the balance point is narrow

---

## 10. If something here is wrong

Say so rather than working around it.

The weakest section is 3, the market, because it is the most important and the least verifiable on
paper. The original's exact price arithmetic was never fully reverse-engineered by its community, so
this is a model built to produce the same observable behaviour rather than a reconstruction. It will
need more tuning than anything else in the project.

The second weakest is section 2. Twelve signatories with twelve distinct effects is a lot of individual
balance surface for a solo build, and the honest fallback is to ship six and add the rest later.
