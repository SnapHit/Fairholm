# Sid Meier's Colonization: what the game actually is

> ## ⚠ THIS IS NOT A SPECIFICATION FOR FAIRHOLM
>
> **This document describes a different game, made by other people in 1994. It is background research.**
>
> **Nothing in it may be implemented.** Every number here — sixteen goods, two hundred bells per
> colonist, three workers per building, silver opening at nineteen, the building costs, the unit
> strengths, the warehouse ladder — belongs to that game and is explicitly forbidden by section 8.3 of
> the legal distinguishability constraint, which states that individual numbers are facts but **a table
> of identical numbers is evidence**.
>
> Every vocabulary term here is on the prohibited list in section 8.1.
>
> **Fairholm's own numbers are in the constants block described in section 4 of the build
> specification, derived from Fairholm's own parameters. Use those.**
>
> This document exists for one purpose: to explain *why* Fairholm's systems are shaped as they are. Read
> it for understanding. Never for values.

Written 20 August 2026. Self-contained. Companion to the browser game architecture brief.

**Purpose: understand the 1994 design well enough to know which parts are load-bearing before
deciding what a mobile version could be.** Numbers below are from the game's own data tables as
published by the Civ wiki, from strategy guides written by people with hundreds of hours in it, and
from the FreeCol project, which reimplemented the rules. Where the community is unsure, this says so.

---

## 1. The shape of the game in one paragraph

Four European powers race to colonise a New World from 1492 to 1850. You start with one ship and two
colonists. You found colonies, put colonists on tiles to grow raw materials, put other colonists in
buildings to refine those materials into goods worth three or four times as much, ship the goods to
Europe, and use the money to buy more colonists and equipment. Meanwhile your Town Halls generate
Liberty Bells, which recruit Founding Fathers and raise rebel sentiment. When enough of your
population is rebel, you declare independence and fight off the King's expeditionary force. Winning
that war is the only way to win.

---

## 2. The design spine, and it is unusually clean

**Every mechanic in the game pushes the player along the same arc: dependent on Europe, then
self-sufficient, then in revolt.** The genius is that this arc is not scripted. It falls out of
economic parameters that all point the same direction.

Four separate ratchets, all turning the same way:

1. **Goods you export get cheaper the more you sell.** Prices fall with cumulative volume
2. **Goods you import drift more expensive over time.** Tools, muskets and trade goods have a
   positive drift built into the data table. The longer the game runs, the more it costs to buy the
   things you need
3. **Taxes only go up.** The King raises them repeatedly and the only way to refuse is a tea party,
   which gets that good boycotted
4. **Liberty Bells, which you need to win, simultaneously grow the King's army.** The more you
   prepare, the harder the final fight

So the profitable early strategy (dig silver, sell raw crops, buy tools from Europe) is guaranteed to
stop working, and the thing that replaces it is domestic manufacturing, which is also the thing that
lets you build cannon and muskets, which is the thing you need for the war. **The economy teaches the
politics.** Nobody has to explain to the player why the colonies rebelled. They feel it as an
optimisation problem.

That is the single best thing in the game and it is worth more than every individual mechanic below.

---

## 3. The map, and where replayability actually comes from

- Roughly 3,900 land and sea tiles, about 70 by 56. Either the historical Americas map or a randomly
  generated New World, and there was a scenario editor
- Around twenty terrain types, including eight distinct forest types, each of which clears to a
  specific open terrain and yields a one-off timber crop
- **Prime resource tiles are the real map variable.** Some multiply output (prime tobacco, cotton and
  sugar are 2x and are always the best tile of their type). Others add a flat amount (prime furs and
  prime ore are +3, and can actually be beaten by an ordinary forest tile with a major river and a
  road)
- Rivers matter as much as bonuses. A minor river is worth the same as a road, a major river is worth
  two, and plowing stacks on top of a river
- Colonies work only the eight tiles around them, plus the centre tile, which is auto-worked and can
  be cleared and plowed after founding

**The replayability is not "the map looks different". It is that the map decides which strategy is
available.** Ore next to hills means you can be a tool and musket power. Prime tobacco means cigars.
No silver means no early cash. Coastal means shipbuilding and vulnerability to the King's landings;
inland means safe custom houses and slow logistics. The opening thirty turns are a genuine read of
what this particular map will let you be, and that is why the same player replays it.

Worth noting for later: this is procedural content in the exact sense the architecture brief means.
The map is the content, and it costs nothing to ship.

---

## 4. Colonies are converters, and colonists are the scarce resource

Not gold. **Colonists.** Every colonist is a body that can be exactly one thing at a time:

- a worker on a map tile, growing food, sugar, tobacco, cotton, furs, lumber, ore or silver
- a worker in a building, converting raw material into a manufactured good
- a soldier, dragoon, scout, pioneer or missionary, in which case they leave the colony's population
- a teacher in a school, converting other colonists into specialists

You get more colonists from four sources: immigration driven by Crosses, a food surplus of 200 in a
colony producing one new colonist, training or conversion via native settlements, and capturing them
from rival Europeans. All four are slow. **That scarcity is what makes every assignment an actual
decision**, which is the Sid Meier test.

### The colonist ladder

Petty Criminal → Indentured Servant → Free Colonist → Specialist. Education moves a colonist one step
per cycle, and cycle length depends on the school level being taught, not the student: schoolhouse
professions take 4 turns, college 6, university 8. So the efficient play is to educate criminals and
servants in cheap schoolhouse subjects to promote them fast, and reserve the expensive university
slots for free colonists becoming Elder Statesmen.

Specialists double output in their speciality. Four specialities cannot be bought or taught in
Europe at all: Master Sugar Planter, Master Tobacco Planter, Master Cotton Planter, Expert Fur
Trapper. **They can only be learned by living among the natives**, one colonist per village, ever.
That single rule forces contact with the native economy even for a player who wants to ignore it, and
makes scouting villages to catalogue what each one teaches genuinely valuable.

---

## 5. Production, buildings and the upgrade ladder

Buildings cost Hammers (produced by carpenters from lumber) plus Tools (produced by blacksmiths from
ore). **This is the key structural fact about the build system: you cannot buy your way up the
ladder without an ore and tool industry, or without importing tools at a price that keeps rising.**

Each production building has three tiers. Using rum as the worked example:

| Tier | Building | Output per unskilled worker | Cost |
|---|---|---|---|
| 1 | Rum Distiller's House | 3 sugar to 3 rum | free, exists at founding |
| 2 | Rum Distillery | 6 sugar to 6 rum | 64 hammers, 20 tools |
| 3 | Rum Factory | 6 in, more than 6 out | 160 hammers, 100 tools, pop 8, needs Adam Smith |

A master doubles it. Sons of Liberty sentiment adds more on top. A master in a factory at 100% rebel
sentiment was measured by one long-time player at 24 output from 16 raw materials per turn.

The same three-tier pattern runs across the whole colony: Tobacconist's House / Shop / Cigar Factory,
Weaver's House / Shop / Textile Mill, Fur Trader's House / Post / Fur Factory, Blacksmith's House /
Shop / Iron Works, Armory / Magazine / Arsenal, Docks / Drydock / Shipyard, Schoolhouse / College /
University, Church / Cathedral, Printing Press / Newspaper, Stockade / Fort / Fortress, Warehouse /
Warehouse Expansion, plus Town Hall, Stable and Custom House.

Two hard limits shape everything: **three workers maximum per building**, and warehouse capacity of
100 per good, 200 with a warehouse, 300 with the expansion, with anything above capacity spoiling.
Three workers per building is why the game forces you into many specialised colonies rather than one
megacity, and it is the single most important constraint in the whole colony layer.

The **Iron Works** is the end state of the industrial chain: three expert ore miners feeding three
master blacksmiths can produce around 72 tools a turn, which then feed muskets, artillery, buildings
and pioneers. That colony is the war machine.

---

## 6. The European market, and how dumping works

The market is **supply driven and cumulative**. The more of a good has been sold into Europe, the
lower its price goes. If little is being sold, the price drifts back up. Markets across the four
European powers are loosely coupled, so cornering a good nobody else is trading is genuinely
profitable.

Each good has its own parameters in the game's data table: a starting price range, a floor and
ceiling for drift, a spread between what you sell for and what you buy at, a rise rate, a fall rate,
a per-turn attrition value that decides how the price behaves with no trade, and a volatility value.
The community has never fully reverse-engineered the exact arithmetic, but the direction of each
parameter is clear and the resulting behaviour is well documented.

The shape that matters:

| Good | Typical opening sell price | Drift ceiling | Behaviour with no trade |
|---|---|---|---|
| Silver | 19 | 20 | collapses fast under volume and, in practice, does not recover |
| Raw crops (sugar, tobacco, cotton, furs) | 2 to 6 | 5 to 7 | recovers slowly |
| Processed (rum, cigars, cloth, coats) | 11 to 13 | 20 | recovers well |
| Ore | 3 to 6 | 6 | recovers |
| Tools | 2 | 9 | **drifts up** |
| Muskets | 3 | 20 | **drifts up** |
| Trade goods | 2 | 12 | **drifts up** |

Three consequences that a designer should notice:

1. **Refining roughly triples unit value and, more importantly, raises the ceiling.** Raw crops cap
   out around 5 to 7. Processed goods can reach 20. Value-add is not a small optimisation, it is the
   whole mid-game
2. **Silver is a designed trap.** It is the most lucrative thing on the map, the tile depletes, and
   the price crashes and stays crashed. Players who lean on it get a wonderful first forty turns and
   a broken economy afterwards. That is deliberate and it is good design
3. **The goods you buy get more expensive as the game runs.** Combined with rising taxes, this is the
   mechanical argument for independence

### Dumping in practice

Selling a large stock at once does not get you the headline price. Cargo unloads in lots of 100 and
the price is recalculated between lots, so a big shipment walks its own price down and the last lot
sells for meaningfully less than the first. Experienced players hold stock until a price peaks, sell
into it, then switch that colony's output to something else while the price recovers. One player
reports that three or four specialist manufacturers running at full output is roughly the point where
you saturate the European market for a single good.

### Taxes, boycotts and the Custom House

The King periodically demands a tax rise. Accept and your margin shrinks permanently. Refuse and you
hold a tea party, dumping a good into the sea, which boycotts that good: you can no longer trade it
at all. Over a long game most goods end up boycotted.

The **Custom House** (160 hammers, 50 tools, needs the Founding Father Peter Stuyvesant) breaks this
open. It automatically sells any surplus above 100 down to 50 each turn, at the going Europe price,
**including goods under boycott**, and it removes the need to physically ship anything. Built inland
it cannot be blockaded. It even works after independence, at a smuggling tax rate.

This is the game's biggest single power spike and it is essentially a logistics abstraction: the
moment you have it, the entire shipping minigame collapses into a number that arrives each turn.
Worth flagging, because on mobile that abstraction is arguably where you would want to start rather
than end.

---

## 7. The native economy, which is a different shape entirely

This is the part most people misremember, and it is mechanically the most interesting trading system
in the game.

- Villages buy manufactured goods, trade goods, muskets, horses and tobacco. They will not buy food
  or most raw materials, and will not even accept them as gifts
- **At any moment each settlement has one good it pays a strong premium for and two it pays a small
  premium for.** A scout learns these, and what skill the village teaches, and often hands over gold
- **A village will not buy the same good twice in a row.** You must sell or gift something else in
  between, which forces you to carry a mixed cargo and rotate between villages
- Transactions cap out around 1000 gold, and **no tax is paid on them**
- You can haggle, but typically only once before they take offence and refuse that item
- Wagon trains get better terms than ships, and a wagon train can buy back roughly as much as it sold
  where a ship is offered a quarter of that
- Prices depend on the tribe's wealth, which you increase by trading with them, and on the random
  number generator
- Selling muskets and horses is the most profitable trade and it arms the people you may later fight.
  The standard exploit is to arm a distant tribe that borders a rival European power

**The design contrast is the point.** Europe is one deep pool with a slow price that responds to
cumulative national volume, and it rewards scale and specialisation. The natives are dozens of shallow
pools with individual preferences, a per-transaction cap and an anti-repetition rule, and they reward
routing, variety and knowledge of the map. One is a spreadsheet, the other is a travelling salesman
problem. Having both is why the trading never feels like one solved system.

Opinions differ sharply on whether native trade is worth the time. Some strong players say the
micromanagement is not worth it and Europe pays better per unit of attention. Others build entire
early games on buying trade goods cheap in Europe and selling them village by village. That
disagreement is itself evidence the balance is roughly right.

Relations degrade as your colonies expand and take land. Missionaries slow that and produce converts.
Attacking villages produces treasure, which needs a galleon to move or the King will ship it for you
and take a cut of up to 70%.

---

## 8. Liberty Bells: the clock, the tech tree and the score

Bells are produced by colonists working in the Town Hall, boosted by Printing Press and Newspaper.
They do three things at once:

1. **Accumulate nationally to recruit Founding Fathers**, who are the game's substitute for a
   technology tree. There is no research in Colonization. Fathers unlock the Custom House, factories
   (Adam Smith), free stockades, better immigration, and so on. The bell cost of each successive
   Father rises on a fixed schedule, and any excess bells the turn a Father joins are discarded
2. **Accumulate per colony to set Sons of Liberty percentage.** Roughly 200 bells per unit of
   population for full support. Crossing 50% raises productivity, crossing 100% raises it again
3. **Gate the revolution.** You need 50% rebel sentiment nationally before you can declare

There is a nasty counter-pressure. If a colony contains too many Tories in absolute numbers, not
percentage terms, everything it produces takes a flat penalty. The threshold is 10 colonists at the
easiest difficulty and 6 at the hardest. **This is what stops the player building one enormous city**,
because a big colony needs a high percentage just to avoid the penalty, and it is the main reason
experienced players run many medium colonies. It is an elegant anti-snowball device.

And the sting: the King's expeditionary force grows in proportion to the bells you have produced. The
resource you need to win is the resource that arms your opponent.

---

## 9. Military: few units, sharp rules

Land unit attack values, from the game's data:

| Unit | Attack | Moves |
|---|---|---|
| Braves | 1 | 1 |
| Armed Braves / Mounted Braves | 2 | 1 / 4 |
| Mounted Warriors | 3 | 4 |
| Soldier | 2 | 1 |
| Dragoon | 3 | 4 |
| Veteran Soldier | 3 | 1 |
| Veteran Dragoon | 4 | 4 |
| Continental Army | 4 | 1 |
| Continental Cavalry | 5 | 4 |
| King's Regular | 5 | 1 |
| King's Cavalry | 6 | 4 |
| Artillery | 5 | 1 |

Ships run from Caravel at 2 up to Frigate at 16 and the King's Man-O-War at 24.

Equipment, not unit type, defines the soldier. Any colonist plus 50 muskets is a Soldier. Add 50
horses and they are a Dragoon. Take the horses away and they are a Soldier again. This means military
strength is a direct function of your musket and horse production, which is a direct function of ore,
tools and food. **There is no separate military tech tree because the economy is the military tech
tree.**

### The four rules that decide every battle

1. **Artillery in the open suffers a 75% penalty.** It is so bad it can lose to unarmed colonists.
   The penalty does not apply when it defends a colony, or when it attacks a colony or a native
   settlement. Artillery is a siege and garrison weapon, full stop
2. **Fortifications multiply the defender.** A fort is around +150% and a fortress around +200%, so a
   single artillery piece behind a fort defends at about 12.5 against a veteran dragoon's 4
3. **Losing units degrade rather than die.** Dragoon becomes Soldier becomes unarmed colonist becomes
   captured. Artillery becomes damaged, permanently, for the rest of the game
4. **Field promotion.** Win a battle and a unit can promote up the ladder. Colonist to veteran
   happens throughout; veteran to Continental only after independence is declared

### Why cannon and cavalry work in tandem, precisely

It is not a synergy of bonuses. It is a difference in economics.

- **Artillery is the only thing that can crack a fortified colony**, because it is the only unit
  exempt from the open-field penalty while attacking a settlement, and 5 attack is the highest on
  land. But it moves 1, it is helpless if caught in the field, and once damaged it never recovers
- **Dragoons move 4.** They screen the artillery column, they seal the approaches so the defender
  cannot feed fresh units in, they kill anything that comes out, and they exploit afterwards
- **Dragoons are renewable and artillery is consumable.** A routed dragoon walks home and is
  re-horsed for 50 horses, which your breeding colony makes for free. A damaged cannon is a permanent
  write-off

So the correct doctrine is: dragoons do all fighting in the open and absorb the losses because their
losses are refundable, artillery is spent only on walls, and you isolate a target before you commit
the guns. Experienced players go further and stop garrisoning colonies with soldiers at all in the
late game, using artillery inside and keeping every dragoon outside so they get the ambush bonus.

**Ambush** is the fourth piece. When you attack Crown troops or natives fight Europeans in open
terrain, the terrain's normal defensive bonus flips into a bonus for the attacker. So attacking the
King's regulars on a mountain is better than attacking them on flat ground, which is exactly backwards
from every other strategy game and is a lovely bit of thematic mechanics: the militia fights in the
woods, the redcoats want an open field.

### The battle engine is bad, and knowing why matters

Combat is a single roll, roughly attack over attack plus defence, with no hit points and no attrition
across rounds. Veteran dragoons lose to militia with unpleasant regularity, damaged artillery beats
fresh dragoons, caravels sink frigates. The universal community advice is "bring numbers and expect
absurdities". Whatever else gets carried forward, this is the part that has aged worst and should not
be reproduced faithfully.

---

## 10. The revolution

Declaring flips the game. Before declaring, get every veteran into a colony at high rebel sentiment,
because those units convert to Continental Army and Continental Cavalry for free, once. Non-veterans
do not convert but can still promote by winning.

The King lands a Royal Expeditionary Force on your coast. Units standing on coastal tiles when it
arrives are simply captured, so the coast has to be cleared first. Man-O-Wars provide a bombardment
bonus to their landings, and coastal fortresses fire on adjacent enemy ships automatically, which is
the practical answer to them. Producing enough bells during the war brings a foreign power in on your
side with ships and troops.

The consensus is that with a mature industrial base the war is a formality: roughly 30 veteran
dragoons and 20 artillery, fortresses on the coast and 100% sentiment everywhere, and it is over. That
is a genuine design flaw, and it is the same flaw as Civilization's endgame. **The game peaks in the
middle.** Its climax is the last mechanic to receive attention and the first to become a chore.

---

## 11. What the game gets wrong

Worth being blunt about, because a remake inherits these unless it chooses not to.

- **Micromanagement scales badly.** By 1700 a good player is managing twenty colonies, three or four
  university queues, wagon routes and dozens of units, and most turns are bookkeeping
- **The AI is weak.** Both the colonial AI and the combat AI. Players describe extermination of rivals
  as routine
- **Battle results are noisy to the point of feeling unfair**
- **Hard caps exist and are visible.** A limit of 38 colonies, and a total unit cap after which new
  units silently fail to appear
- **The endgame is a formality once the economy is built**
- **The subject matter.** The game is about colonisation, presents natives as a trade resource, a
  training resource and a conquest target, and deliberately omits slavery entirely. That omission was
  criticised on release in 1994 and reads far worse now. Any modern version has to make a deliberate,
  defensible decision here rather than inherit the 1994 framing by default. This is not a tone
  problem, it is a design problem: the native layer is one of the best systems in the game and it is
  built on the least defensible premise

---

## 12. Why the cult following persists

- **The arc.** Fragile to impregnable to independent, and it is felt rather than narrated
- **Depth from few parts.** Sixteen tradeable goods, about twenty buildings, about ten military units.
  Everything interacts. Nothing needs a wiki to understand, only to master
- **The map is the content**, so replays differ structurally rather than cosmetically
- **It has no real successor.** The 2008 Civ IV remake is divisive. FreeCol, an open source reimplementation
  started in 2003, only reached 1.0 in January 2023 and remains the way many people play. The
  We The People mod for the 2008 remake is still in active development. There is an active Discord,
  subreddit and a 30th anniversary thread on CivFanatics
- **Nobody has done it on a phone.** That gap is real, and it is the strongest argument for the idea

---

## 13. What is load-bearing, and what is decoration

My reading, for the conversation about what a mobile version could be.

**Load-bearing. Remove these and it stops being this game:**

- The four ratchets in section 2. Falling export prices, rising import prices, rising taxes, and bells
  that arm the enemy
- Refining raw into manufactured, with a much higher price ceiling on the manufactured good
- Colonists as the scarce resource, each assignable to exactly one job
- The map deciding which strategy is available
- The three-workers-per-building and Tory-penalty limits that force many colonies instead of one
- Artillery as siege-only, dragoons as the renewable field force
- The revolution as the win condition

**Decoration, or at least negotiable:**

- Sixteen goods. The structure survives at eight or even six
- Twenty buildings with three tiers each
- Physically sailing goods to Europe. The Custom House proves the game works without it
- Pioneers, roads and plowing as a separate unit and activity
- Founding Fathers as a long list. The function is a tech tree with flavour, and the list could be a
  quarter the length
- Naval combat entirely
- Four playable nations

**Actively harmful to reproduce:**

- The battle engine's variance
- Turn-by-turn micromanagement of every colonist
- Colony and unit caps
- The 1994 treatment of native peoples

---

## 14. Confidence and gaps

High confidence: building costs and tiers, unit attack values, market table parameters, the native
trade rules, the Sons of Liberty and Liberty Bell mechanics, the artillery and fortification rules.
These come from the game's own data or from multiple independent guides that agree.

Medium confidence: the exact arithmetic converting cumulative sales volume into a price change, which
the community has documented directionally but never fully solved; the precise Sons of Liberty
production bonus at 50% and 100%; the exact fortification multipliers, which are inferred from worked
examples rather than read from the code.

Not covered here: naval combat detail, the scoring system, difficulty level differences beyond the
Tory threshold and immigration quality, and the AI's colonial behaviour.

If anything above is wrong, say so rather than working around it. Several of these claims come from
enthusiastic guide authors rather than from disassembly, and a player with hundreds of hours in the
game will spot errors faster than another round of searching will.
