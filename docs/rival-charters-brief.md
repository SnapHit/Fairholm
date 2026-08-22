# Rival charters brief

Written 21 August 2026. Self-contained. Companion to the colonists and labour brief, the session, map
and economy brief, the turn, queue and standing orders brief and the setting and fiction brief.

**Purpose: specify the competing colonial powers, which touch the map generator, the market, the
military and the queue budget.** The dynamic carries across from the original because it is one of the
things that makes the map worth reading.

---

## 1. What they are

**Three rival charters**, so four powers on the world including the player. Other chartered companies
with their own settlers, their own freight monopolies, their own debts. This fits the fiction without
inventing nations and it means every rival is under the same pressures the player is.

Fixed at three regardless of map size. See section 3 for why that is a feature.

---

## 2. Simulated only to the depth the player can observe

**This is the most important decision in this document and it is a build-cost decision.**

A rival at full fidelity is a second complete implementation of the player's decision space. It is the
largest hidden cost in having rivals at all, it is the part a single build run is most likely to do
badly, and it is what the 1994 game did worst.

The player never sees inside a rival settlement. So fidelity only has to match what is observable.

**What a rival needs:**

- Real settlements in real positions, holding real tiles, visible on the map
- A strength value, with units instantiated when they matter rather than tracked every turn
- A market footprint that moves prices, per section 4
- An expansion schedule, modulated by difficulty and by how well the rival is doing
- Reactions to being attacked, crowded, or undercut
- A relationship state with the player and with each predecessor settlement

**What a rival does not need:**

- Per-colonist job assignment
- Building queues and construction simulation
- Logistics, haulage routes or warehouse management
- An internal economy that balances

If the observable behaviour is right, the absence of the rest is undetectable.

---

## 3. Map size is the aggression dial

Three rivals at every size means the character of the game changes with the map, not just its length.

| Size | Land tiles | Roughly per charter | Character |
|---|---|---|---|
| Small | about 420 | 8 settlements | Contested from turn thirty. A knife fight |
| Standard | about 900 | 18 settlements | Competition for the good ground, room to avoid it |
| Large | about 1,550 | 30 settlements | Contact is a choice |
| Massive | about 2,480 | 50 settlements | Largely parallel development until late |

Those figures are before predecessor territory and before terrain nobody wants, so treat them as a
ceiling.

**Generator invariants this adds:**

- Every charter starts with a viable landing site: food, timber and fresh water within reach
- No charter starts unable to reach at least two refining chains
- Starting separation is enforced, and it scales with map size rather than being a fixed distance
- No charter is placed on a landmass it cannot leave before shipping is available

---

## 4. Markets: separate but loosely coupled

Each charter's Company holds its own price table.

- **Your own cumulative volume moves your price fully**, per section 6 of the mechanics brief
- **A rival's volume moves your price partially.** Starting coupling coefficient **0.3**, meaning a
  rival's sales have about a third of the effect on your prices that your own do

This is what makes cornering a good nobody else trades genuinely profitable, which is one of the
better strategic decisions available in the original.

**Two consequences that must be built rather than assumed:**

- **The coupling must be observable or it feels arbitrary.** The price movement itself is visible.
  *Why* it moved becomes visible if you scout rival settlements and see what they produce. That makes
  scouting pay in a second way and it makes market intelligence a real thing
- **A rival dumping a good you depend on is a threat you can answer**, by switching production, by
  outproducing them, or by attacking their capacity. That is a strategic situation the original only
  half delivers, and it is cheap here because the market model already exists

---

## 5. Diplomacy stays thin, deliberately

The queue budget will not carry a negotiation system, and the original's diplomacy is thin anyway.

Three relationship states with each rival: **at peace, tense, at war.**

- The state changes through actions rather than through a negotiation screen. Crowding their land,
  undercutting their trade, arming predecessors near them, and attacking all move it
- Offers and demands arrive as queue items of type 2, global with a deadline, and are answered with a
  single choice
- No treaty screens, no trade agreements to negotiate, no alliance management

**Privateering sits deliberately outside this.** A raider under no flag is an act of war that has not
been admitted to, which is why it is the most useful tool in the whole rivalry. See section 8.

If diplomacy needs more depth later it can be added. Starting thin is recoverable; starting thick and
discovering it eats the turn budget is not.

---

## 6. Rival independence, at higher difficulty

**At standard difficulty only the player revolts.** The endgame is the player against their own
Company's recall fleet, with rivals as a live background threat.

**At higher difficulty a rival may declare**, which creates a race and three outcomes worth having:

- **While they fight**, their Company's attention is elsewhere, which is an opening for the player
- **If they win**, they become an independent power on the world. Potentially an ally against a shared
  enemy, potentially a competitor for the whole continent with no Company restraining them
- **If they lose**, their settlements revert to their Company, which puts a Company-held military
  presence on the map near the player. This is the most threatening outcome and it should feel like it

This is cheap to implement because it is mostly state changes rather than new systems, and it gives
higher difficulty a genuine reason to be replayed rather than just bigger numbers.

---

## 7. What rivals put in the queue

Most rival activity is an **event**, not a decision, and belongs in the dispatch: they founded a
settlement, they met the predecessors, their prices moved, they are at war with each other.

Only these are queue items:

- A demand or an offer, with a deadline. Type 2
- A declaration of war against the player. Type 2
- A rival settlement founded inside the player's claimed ground. Type 5, opportunity or provocation
- Contact with a rival unit by a player unit under standing orders. Type 1, per the automation never
  fights rule
- **A shipping route that has become unviable through raiding.** Type 3. Note that this is the route,
  not the individual interception. See section 8

Three rivals must not generate three times the interruption. Group them, per section 6 of the queue
brief.

---

## 8. Privateering and ship to ship combat, settled as essential

**This supersedes the mechanics brief**, which lists naval combat as decoration and cuttable. That
judgement was made before three things were decided: archipelago maps make shipping mandatory, rivals
exist, and markets are loosely coupled so interdicting a rival's trade is strategically meaningful.
The premises changed, so the conclusion changes.

### Why privateering is the best thing in the rivalry

A raider under no flag is **an act of war that has not been admitted to**. That single property does
more work than any diplomacy system could:

- Rivalry escalates gradually instead of flipping between peace and war
- The player can hurt a rival without committing to a war they are not ready for, and so can the rivals
- Suspicion is a real state, distinct from knowledge
- It gives the ocean tactical meaning instead of being empty space between islands

### Attribution, which is the mechanic that makes it work

- An unflagged raider is **unattributed**. You know you were raided. You do not know by whom
- Suspicion moves the relationship state toward tense on its own
- **Proof** requires defeating a raider and taking the crew, or scouting the port it sails from
- Proof converts suspicion into grounds for war, which changes what the rival's own Company will
  tolerate

The same applies in reverse. Your raiders are deniable until one is caught.

### The hull ladder, kept deliberately short

Four hulls, per section 12 of the architecture brief on unique assets. All are on-planet vessels. The
Company's crossing vessel is never fought and never rendered closely, per section 7 of the setting
brief.

| Hull | Speed | Guns | Capacity | Role |
|---|---|---|---|---|
| Lighter | slow | none | small | Coastal and river haulage. Cheap, early, unarmed |
| Trader | moderate | light | large | The workhorse. Can defend badly |
| Raider | fast | moderate | small | The privateer. Built to catch traders and outrun warships |
| Cutter | moderate | heavy | small | Escort and hunter. Built to catch raiders |

The triangle is deliberate: raiders beat traders, cutters beat raiders, traders carry the cargo that
pays for both. Nothing dominates.

### Combat is a chase and an exchange, not a coin flip

The mechanics brief is explicit that the original's single-roll combat is the part that has aged worst
and should not be reproduced. So:

- **Speed decides whether an engagement happens at all.** A faster ship can decline. This is what makes
  the hull ladder mean something
- **Guns decide the exchange**, over several rounds rather than one roll
- **Ships degrade, they do not die.** Damage costs speed and capacity and is repaired at a shipyard.
  This matches the land rule that units degrade rather than vanish
- **Cargo is captured, not destroyed.** A successful raid transfers goods, which is why raiding pays
  and why it hurts twice

### Blockade

A rival at war can blockade a port, cutting consignment to the Company entirely.

This has an important consequence that is already in the design: it makes an **inland** consignment
office genuinely valuable, because it cannot be blockaded. That was flagged in section 6 of the
mechanics brief as the original's biggest single power spike, and it now has a second reason to exist.

**Coastal batteries fire on adjacent hostile ships automatically**, which is the practical answer to
blockade and makes coastal settlements worth fortifying.

### The queue problem, and how it is solved

Automated haulage plus raiders plus three rivals could generate an interception every turn, which
would break the eight-item ceiling on its own.

**The rule: the queue item is about the route, not the encounter.**

- Haulage standing orders carry a **risk posture**: avoid waters where raiding is known, run anyway,
  or hold for escort. The player pre-decides once per route rather than once per encounter
- An engagement whose outcome is not in doubt resolves itself and goes to the dispatch
- Only a contested engagement, or a route that has become unviable, surfaces
- Interceptions group: "three of your vessels were taken in the strait" is one item that opens a list

This keeps naval pressure bounded no matter how many hulls are at sea, and it turns raiding into a
strategic problem about routes rather than a tactical interruption.

### What rivals need for this, under observable-depth simulation

Raiders are real units on the map because the player can see them. Their behaviour is schedule-driven
from the rival's aggression state and their known trade routes. No naval logistics simulation is
required.

---

## 9. What must be tuned by playing

- The market coupling coefficient, currently a guess at 0.3
- Rival expansion rate, which is the main difficulty lever
- How aggressively relationship state degrades from crowding, which decides whether small maps are
  exciting or miserable
- Whether three rivals on a small map is a knife fight or a mess
- **The speed gaps between the four hulls**, which are what make the chase mean anything. Too small and
  every engagement happens; too large and raiders are either useless or unstoppable
- **Raid frequency**, which decides whether escorting is a real choice or a permanent tax
- **How much cargo a successful raid transfers**, which sets whether privateering pays for itself

---

## 10. If something here is wrong

Say so rather than working around it.

The weakest claim is section 2, that observable-depth simulation is undetectable. It holds as long as
rivals are never inspected closely and never need to behave sensibly under scrutiny. If the design
later gives the player a way to see inside a rival settlement, this decision has to be revisited.

The second weakest is the route-level queue rule in section 8. It is the right shape, but whether it
actually holds the ceiling when three rivals are raiding a large archipelago has not been played, and
it should be stress-tested alongside the artificial late-game state described in the queue brief.

Section 8 also supersedes the mechanics brief's judgement that naval combat is cuttable decoration.
That earlier judgement was correct given what was known at the time and is wrong now, which is worth
recording rather than quietly overwriting.
