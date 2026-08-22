# Naming and vocabulary brief

Written 21 August 2026. Self-contained. Companion to the legal distinguishability constraint, whose
section 8.1 lists what may never be used, and the setting and fiction brief, which proposed most of the
directions confirmed here.

**Purpose: settle the vocabulary so that nothing is invented arbitrarily during the build.** Section 18
of the architecture brief warns that anything left undecided will be decided by whoever writes the code.

---

## 1. The three jobs a name has to do

1. **Be findable.** The keyword research found that every comparable game earns most of its traffic
   from people typing its name. It is the only search decision that matters
2. **Be legally clean.** Section 8.5 forbids "col", "colony" or "colonization" anywhere in the title,
   domain, repository or handle, and forbids naming the original or its rights holders
3. **Read in a thumbnail**, on a listing page, next to a hundred others

### The test for the game's name

- Distinctive enough that its results page is not already owned
- Spellable after hearing it once
- Available as a domain and an itch.io slug
- **Verified before committing**, not assumed

---

## 2. The game's name: Fairholm

**Settled 21 August 2026. The country and the game share the name**, per section 3.

### Verification, done rather than assumed

Searched on the date written. **Nothing in entertainment owns the term.** No video game, no board game,
no tabletop property, no film. The results page carries a campground in Washington, a boutique inn in
Charlottetown, a farm in Connecticut, several historic houses, and a family of Canadian footballers.

None of that is an incumbent a game would have to displace, and none of it is an IP that could ever be
confused with this one.

### The one real caveat

**Fairholme is the commoner spelling of the same name** and carries most of the encyclopaedic weight.
People who hear the name will sometimes type the -e.

**Mitigation, to be done on day one:** register both spellings and redirect, and take both itch.io slugs
if they are free. Cheap now, expensive after somebody else notices.

### Still to check before it is truly committed

- Domain availability for both spellings
- The itch.io slug for both spellings

Neither can be checked from a search engine and both take two minutes.

### What was rejected, and why, so it is not relitigated

| Candidate | Outcome |
|---|---|
| **Farshore** | Dead. Everdell Farshore is a 2023 standalone board game and owns the entire results page |
| **Westering** | Clear of games, but Diablo 4 has a zone called Westering Lowlands which would dominate any pairing with "game". Also a well-known surname |
| **Arrears** | Thematically the most honest name for this design and probably the most searchable of the three. Rejected on tone: the fiction's emotional core is hope, and the name should not open on the debt |
| **Quitrent** | Certainly clean, and not spellable after one hearing |

**The general lesson, worth keeping:** plain English compounds are saturated by fantasy titles, board
games and tabletop locations. The clean space is period commerce, colonial law and real but uncommon
place names, because games do not use that register.

---

## 3. The world and its places

**The planet barely has a name, and that is deliberate.**

The Company knows it by a survey designation, dull and bureaucratic. **The settlers named their own
stretch of coast**, and that is the name that appears everywhere in play. This is both truer to how
colonial naming actually worked and one fewer invented proper noun for the player to learn.

- **The country is Fairholm**, and the game takes its name
- **The Landing** is both the offshore splashdown zone where landers come down and the shore facility
  that receives what comes off them. A two-way bottleneck, per section 7 of the setting brief
- Settlements are named by the player, with a generated default drawn from a period-plausible list

---

## 4. The eighteen goods

Section 8.4 forbids the original's four signature chains. None of sugar, tobacco, cotton or furs
appears, and neither do rum, cigars, cloth or coats.

### Brought and local

| Good | Note |
|---|---|
| **Food** | Untraded |
| **Timber** | Feeds Frame |
| **Frame** | **Not one of the eighteen.** An internal construction accumulator. Neither shipped nor sold |
| **Gold** | Extraction only. The trap |
| **Horses** | Breed. Mount the field unit and pull the haulers |

### The industrial branch

| Good | Note |
|---|---|
| **Ore** | |
| **Metal** | The contested intermediate |
| **Tooling** | Builds. Also the import you are trying to replace |
| **Arms** | Fights. Tradeable, and dangerous to sell |

### The three parallel export chains

Crops the settlers brought, which behave differently here. **The seed is familiar; the knowledge is
not**, which is why all three are among the four skills only the predecessors can teach.

| Raw | Refined |
|---|---|
| **Flax** | **Linen** |
| **Hemp** | **Cordage** |
| **Madder** | **Dye** |

Hemp into cordage carries a quiet bonus: rope is what ships need, so one export chain feeds the
shipping system directly.

### The headline chain, which is native

| Stage | Name |
|---|---|
| Grown | **Bloom** |
| Refined | **Attar** |
| Finished | **Cores**, from Attar and Metal |

**Bloom** is plain, works as a harvest noun, and carries a useful second meaning: a bloom is also a
mass of worked iron, which is a quiet echo of the chain converging with Metal.

**Attar** is the correct chemical term for an oil distilled from flowers, so it survives the register
test in section 10 on its own merits rather than as flavour.

**Cores** is what these components are. Plain, modern, technical, and it names the thing by where it
sits: inside the drive that carries a ship across.

### What cores are for

**Cores are what makes the crossing possible, and they are consumed by it.**

Four consequences, and they are the reason this is settled rather than left as flavour:

1. **The Company's reason to tolerate a colony it cannot control.** They need what only this place
   produces, which is why an expedition that costs more than the colony earns is still worth mounting
2. **Earth's demand is structural rather than commercial**, so unlike gold it never saturates. This is
   the finite-versus-growing demand distinction in section 8 of the setting brief, made concrete, and
   it is why cores carry the highest ceiling in the market table
3. **The colonial loop is exact.** Fairholm manufactures the means of its own extraction
4. **It gives the endgame its stakes.** A colony that stops shipping cores is not merely withholding
   revenue

### The import

| Good | Note |
|---|---|
| **Instruments** | Precision goods. Not makeable locally until very late. Price climbs every year |

---

## 5. People and rank

Per the setting brief, and clean of section 8.1.

- The standing ladder: **debtor, contracted, free, master**. Standing is how much a person still
  owes, which is what the whole game is about
- Civic: **clerk** for administrative overhead, **agent** for the resident trader in a predecessor
  settlement
- **The predecessors** as a collective term in the interface. In fiction they are the earlier wave, and
  the player learns their own name for themselves through contact

---

## 6. Institutions, events and abstractions

| Term | Meaning |
|---|---|
| **The Company** | The chartered employer |
| **The charter** | The instrument, and the difficulty setting |
| **The passage** | Immigration, and the debt |
| **Word** | Reputation travelling home with the freight. Drives passage |
| **Grievance** | The produced resource |
| **Resolve** | The per-settlement percentage |
| **Signatories** | The twelve, who are the tech tree |
| **A demand** | The Company's request for a higher charge |
| **An embargo** | The consequence of refusing one |
| **Consignment** | Selling to the Company |
| **A lander** | The capsule that splashes down offshore. Never recovered; broken up for its metal |
| **The recall fleet** | What arrives after the declaration |
| **The dispatch** | The log of everything that happened |
| **An anchorage** | Where a fleet can land |

---

## 7. Buildings

Meeting house, press, bulletin. Carpenter's shop, sawmill. Smelter, foundry, ironworks. Toolworks,
manufactory. Armoury, magazine, arsenal. Still, distillery, works. Finishing house, finishing works.
School, academy, institute. Granary, warehouse, depot. Stable. Wharf, drydock, shipyard. Palisade,
redoubt, bastion. Agent's office. Consignment office.

The three export refineries take the name of what they make: **linen works**, **rope works**,
**dye works**, each with shop and larger works tiers above.

---

## 8. Units and hulls

- Land: **colonist, militia, outrider, battery, improver**, with quality tiers **raw, hardened, sworn**
- Hulls: **lighter, trader, raider, cutter**
- The Company's own: **regulars, horse, siege train**
- Haulage: **hauler**

---

## 9. Terrain

Grassland, plains, downs, marsh, highland, mountain, dry country, water. Forested: light woodland, deep
timber, highland forest, coastal scrub. Features: minor river, major river, road, anchorage, old
workings.

---

## 10. The register, corrected

**Corrected 21 August 2026.** The earlier version of this section set the test as whether a clerk in
1790 could have written the word in a ledger. That was wrong, and it was the same error running through
several documents.

**These people come from a civilisation that crosses between worlds.** They know what a transistor is.
They would not talk like Georgian colonists, and dressing them that way was costume rather than design.

**The corrected test: would a modern person, living in a place built of timber and iron, say this?**

An old word survives only where it is still the correct technical term for a thing these people
actually have:

| Survives | Because |
|---|---|
| Attar | What a chemist calls a distilled floral oil |
| Cordage | What the rope trade calls rope |
| Bastion, redoubt, palisade | What a military engineer calls those shapes |
| Consignment, embargo, charter | Current commercial and legal terms |

| Removed | Replaced by |
|---|---|
| Dray | Hauler |
| Factor | Agent |
| Ropewalk | Rope works |
| Broadsheet | Bulletin |
| Transportee, bondsman, freeholder | Debtor, contracted, free |

**What survives the correction is the things, not the language.** Rope, sail, timber, iron, horses and
gunpowder are present because an industrial base cannot be shipped, per section 6 of the setting brief,
not because of any century. That argument is untouched.

---

## 11. Still open

- **Domain and itch.io slug availability** for both spellings of Fairholm, per section 2
- Settlement default names, which need a generated list of thirty or so
- The predecessors' own name for themselves

---

## 12. If something here is wrong

Say so rather than working around it.

The name is settled and verified against search, but two checks remain that no search engine can
answer, and both are in section 11. If either domain or slug is taken, the shortlist in section 2
records what was already ruled out and why, so the decision does not have to be made from scratch.

The weakest remaining part is section 4's claim that cores enable the crossing. It is elegant and it
justifies the whole backstory, but it is a large piece of fiction resting on one idea. If it ever fails
scrutiny the fallback is duller and still works: a precision component Earth cannot manufacture, with
no significance beyond its price.

Section 10 records a correction that ran through several documents at once. If any archaic term
resurfaces in a later draft, the test there is the one that settles it.
