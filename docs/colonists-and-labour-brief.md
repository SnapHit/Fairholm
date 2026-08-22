# Colonists and labour brief

Written 21 August 2026. Self-contained. Companion to the session, map and economy brief, the turn,
queue and standing orders brief, the setting and fiction brief and the legal distinguishability
constraint.

**Purpose: specify the labour system, which every other system consumes.** Colonists are the scarce
resource, the settlement soft cap is denominated in them, buildings need them as well as materials,
and the buy-or-build fork is ultimately a question of whether you spend gold or people.

**Method.** The structural rules are taken from the 1994 game, because they are systems, they are safe
under section 7 of the legal constraint, and they are the part that actually works. **Every number is
derived from this game's own parameters and none is transcribed**, per section 8.3. The derivation is
shown for each so it can be argued with rather than inherited.

**Every number below is a starting value.** Scarcity is a feel problem and cannot be settled on paper.

---

## 1. The clock problem, stated once

The 1994 game runs about 300 turns where a turn is a year. This game runs 480 turns where a turn is a
month, and up to 900 on a massive map.

**Every rate constant in that game is denominated in a turn length this game does not use.** A food
threshold calibrated against annual harvests is either twelve times too fast or needs dividing, at
which point it is a derived number anyway. This is why transcription would play worse, not better,
independently of the legal argument.

---

## 2. Target population, which anchors everything else

Working backwards from the design.

| | |
|---|---|
| Start | 3 colonists |
| Endgame, expansionist player | about 330 |
| Endgame, moderate player | about 120 |

The 330 breaks down as roughly 30 settlements averaging 8 population, 50 military bodies, and 30 in
haulage, scouting and improvement. Everything in section 3 is tuned to land near that over 480 turns.

---

## 3. Where colonists come from

Four sources, three of which are slow. That slowness is the point.

### Birth

A settlement accumulates surplus food. At the threshold it converts to a colonist and resets.

- **Threshold: 160 surplus food**
- **Derivation:** a healthy settlement should add a person every two to three years. At 5 to 6 surplus
  a turn that is 27 to 32 turns

### Passage

The Company brings settlers. Word of the colony's prosperity travels home with the freight and
attracts them.

**Word accrues from consigned value, not from civic work.** Section 7 of the remaining systems proposal
corrects an earlier position that had Word produced by colonists in a building, competing with
grievance for the same bodies. Three reasons it is better this way: it removes an entire civic
production line and the colonists who staffed it, which both the queue budget and the phone benefit
from; people emigrate toward money, and the Company's own ships carry the news, so it is better fiction;
and it gives the early game one clear engine instead of two competing ones.

- **1 Word per 10 units of value consigned.** Nothing else produces it
- The **agent's office** multiplies Word by 1.5, so investing in immigration remains a real choice, but
  it is a multiplier on trade rather than a parallel activity
- **First passage at 30 Word, each subsequent one costing 8 more than the last**
- **Derivation:** immigration must carry the first fifty turns almost entirely, because no settlement
  reaches the food threshold that early. Consigning 30 value a turn early on gives 3 Word a turn, which
  is a settler every ten turns at the start, decelerating as the requirement climbs
- **Gold buys passage directly at any time**, at a price that rises with the number already brought.
  This is the main thing gold is for, per section 9 of the economy brief

**Two consequences worth noticing.** The passage is financed, so the debt is the tax and immigration
feeds the extraction ratchet directly. And because Word comes from freight, **a blockade stops
immigration**, which means the recall fleet cuts off reinforcement as well as income the moment it
arrives.

### The predecessors

They train, one person per settlement, ever. See section 6.

### Capture

Colonists taken from rival charters. Settled in section 11. In practice this is a late-game source,
because it requires a military capable of taking a settlement, and it is the only source that scales
with aggression rather than with patience.

---

## 4. The bond ladder

Four rungs. **Debtor, contracted, free, master.**

**Corrected 21 August 2026.** The earlier ladder ran transportee, bondsman, freeholder, master, which
was an eighteenth century legal structure imported wholesale. It was wrong on register, per section 12
of the setting brief, and worse, "transportee" meant penal exile, which quietly smuggled convict
settlement into the fiction as a decision nobody had made.

The replacement is better on both counts. **Your standing is how much you still owe**, which is what
this entire game is about, and it needs no explanation to anyone.

The structural rule is taken: education walks a colonist up one rung per cycle, and specialists double
output in one speciality.

**The penalty structure is deliberately different from the original**, which uses fractions. This uses
a flat subtraction:

| Rung | Tile work | Building work |
|---|---|---|
| Debtor | full | base minus 2 |
| Contracted | full | base minus 1 |
| Free | full | base |
| Master | full, doubled in speciality | doubled in speciality |

Two reasons this is better than fractions. Unskilled labour makes sense on a tile and not in a still,
which the rationale should reflect. And a flat penalty means unskilled labour becomes proportionally
more useful in a higher-tier building, so investment in buildings rewards you twice.

---

## 5. Jobs: one body, one job

The rule that makes every assignment a real decision. A colonist is exactly one of:

- **A tile worker.** Food, timber, ore, gold, one of the three export crops, the headline grown export,
  or livestock
- **A building worker.** One of the production trades
- **Civic.** Producing Word, or teaching
- **Off-roster**, meaning they leave the settlement's population entirely: soldier, outrider, improver,
  scout, or haulage crew

Off-roster is the important one. Arming a colonist costs you a producer, which is what makes the
military a direct function of the economy rather than a parallel track.

---

## 6. Specialists and the predecessors

- A master **doubles** output in their speciality. This is a ratio rather than a transcribed constant
  and it is the natural one
- **Four specialities can only be learned from the predecessors**: the three parallel export crops and
  the headline grown export
- **One colonist per predecessor settlement, ever**

This forces contact with the second economy even for a player who would rather ignore it, and it makes
scouting predecessor settlements to catalogue what each one teaches genuinely valuable. It is also the
mechanic that makes their competence legible, per section 9 of the setting brief.

---

## 7. Education

The structural rule is taken: **cycle length depends on the tier of the school, not on the student.**
That is what creates the interesting play of promoting the unskilled cheaply while reserving expensive
capacity for masters.

| Tier | Cycle |
|---|---|
| Hall | 12 turns |
| Academy | 20 turns |
| Institute | 30 turns |

**Derivation:** teaching a trade should take one to three years. At twelve turns to the year that is 12
to 36 turns.

---

## 8. Workers per building

**Two per production building, at every tier.**

Three is on the explicit avoid list in section 8.3 and is the single most recognisable constant in the
1994 game. Two is also a stronger forcing function toward many settlements, which suits a design with
no hard settlement cap.

Building tiers give **output multipliers only**, not more slots. A tier-two building doubles per-worker
output, a tier-three building does better again and gates on the buy-or-build decision in section 6 of
the economy brief.

**Consequence to watch:** the anti-megacity pressure now rests entirely on the three soft pressures in
section 5 of the economy brief rather than partly on the building cap. If megacities turn out to be
optimal in play, this is the first place to look.

---

## 9. Administrative overhead

The first of the three soft pressures, and the one denominated in colonists.

- **The first clerk is required at population 8, and one more every 6 population thereafter**, so 8,
  14, 20, 26
- A clerk occupies a body and produces nothing
- **Derivation:** a settlement of 8 is roughly 4 on tiles and 2 in buildings plus growth, which is the
  point where a place stops being an outpost. The 6 interval means a settlement of 20 pays three
  bodies, which is a real bite without being a wall

---

## 10. Where this departs from the original, and why

Recorded so it is not mistaken for carelessness.

1. **Flat penalties instead of fractional ones** on the lower rungs. Better curve, and unskilled labour
   scales properly into better buildings
2. **Two workers per building, not three.** Section 8.3, and a stronger expansion incentive
3. **Building tiers multiply output rather than adding slots.** Keeps the forcing function intact while
   still rewarding investment
4. **Administrative overhead is a colonist cost.** The original has no equivalent, because it has a
   hard colony cap instead. This design has no hard cap, so it needs a soft one

---

## 11. Rival charters, settled

**There are competing colonial powers, and the dynamic carries across from the original.** They are
other chartered companies with their own settlers on the same world, which fits the fiction without
inventing nations.

What this changes in this document: nothing except that capture in section 3 is real.

What it changes elsewhere, recorded here because it was decided here:

- **Map generation.** Rival landing sites, land competition, and a new invariant that no charter starts
  unable to reach anything
- **Military.** A second opponent class besides the recall fleet, and one that exists from early on
- **The market.** Whether rivals sell into the same market is economically significant, because
  cornering a good nobody else trades is one of the better decisions in the original
- **The queue budget.** Rival actions generate items, and the eight-item fold has to absorb them
- **The predecessors.** Rivals trading with and arming them is what makes that layer politically live

**And the AI, which is the expensive one.** A rival at full fidelity is a second implementation of the
entire player decision space, and it is the part a single build run is most likely to do badly. It is
also the part the 1994 game did worst.

**Proposal: rivals are simulated only to the depth the player can observe.** Real settlements in real
positions holding real tiles. A strength value with units instantiated when they matter rather than
tracked every turn. A market footprint that moves prices. An expansion schedule modulated by
difficulty and by how well they are doing. Reactions to being attacked, crowded or undercut.

What they do not need is per-colonist assignment, building queues or logistics simulation, because the
player never sees inside a rival settlement. Fidelity only has to match what is observable, and this
saves a large fraction of the build.

---

## 12. What must be tuned by playing

- Every number in this document
- Whether the target population in section 2 is right, which is really a question about how much a turn
  should ask
- Whether birth or passage should dominate, and when the crossover happens
- Whether two workers per building makes settlements feel too thin
- Whether the clerk cost is felt as a meaningful pressure or as an annoyance

All of them belong in a single named constants block, per section 18 of the architecture brief.

---

## 13. If something here is wrong

Say so rather than working around it. The weakest part is section 2, because the target population is
an estimate built on an estimate of average settlement size. Everything downstream inherits that error,
so it is the first thing to check against a real playthrough.
