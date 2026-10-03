# Tuning: symptom to constant

The lookup table for a tuning pass. Each entry is: the symptom you would observe while playing, the
likely cause, the constant to change, which direction, and what else that constant touches. All
constants are in `src/sim/constants.ts` under `C` unless a file is named; a few values that should be
in `C` are still literals in code and are called out as such.

Change one load-bearing constant at a time and play at least forty turns before the next. The last
section says which ones are load-bearing.

---

## The game feels too fast or too slow

The reachability tables in `DECISIONS.md` 158 are the reference: three machine policies
(`src/sim/policy.ts`) play whole games and `tests/pace.test.ts` prints where each milestone fell.
Run it after any change in this section, before and after, and read the table rather than guessing.
`PACE_SIZES=small PACE_POLICIES=competent PACE_SEEDS=3 npx vitest run tests/pace.test.ts` is one
map in a few seconds.

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| The turn count runs out with the story half told | Too few turns for the rates | `C.session.sizes[size].turns` | Raise | Nothing else; the fleet and drift are per turn, so a longer game faces a bigger fleet and dearer tooling |
| The declaration comes at the right time on one size and not another | The per-size pace factor | `C.session.pace[size]` | Raise for later, lower for sooner, that size only | The fleet's growth with grievance on that size, which is divided by the same factor |
| Generous and punitive reach the declaration on the same turn | Terms do not touch resolve | `C.difficulty.*.resolveNeed` | Spread them | Nothing else |
| Nothing changes for twenty turns at a time | Growth and Word too slow (see the next two sections) | `C.labour.granaryThreshold` | Lower | Births per turn, therefore resolve denominators, food demand, and the size gates at 5 and 9 |
| Everything happens at once in the first fifty turns | Unlock backstops too early | `C.onboarding.unlockBackstop.*` | Raise | Which cards appear when; nothing mechanical |
| Payments feel disconnected from the sale | Crossing lag | `C.market.crossingTurns[crossing]` | Lower | Word arrives with the gold, so immigration lags by the same amount |
| A busy turn takes more than a minute | Too many cards | `C.queue.paces.normal` | Lower | Only what is shown; the fold keeps the rest |

## The voyage is too long, too short, or lands on someone else

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| Land is in sight from the splashdown, or on the first tile of the first move | Splashdown too near | `C.lander.splashdown.near` | Raise | Keep it at the sight and two or more; the generator's nothing in sight rule reads the sight |
| Two moves toward land and still nothing | Splashdown too far for the speed and sight | `C.lander.splashdown.far` | Lower | Keep it at the moves and the sight less one or less; validation refuses worlds that fail it |
| The coast is reached before any ground has been compared | Lander too fast | `C.lander.moves` | Lower | The band (both edges follow from it), the autopilot's reach, the rivals' speed, every pin |
| Each move shows too little ground | Sight too short | `C.lander.sight` | Raise | The band's near edge, the nothing in sight rule, what the opening shot shows |
| A move is over before the eye has followed it, or drags | Move drawn too fast or too slow | `MOVE.tileMs` in `src/render/look.ts` | Raise or lower | Every unit's drawn move, not only the lander's |
| A rival comes ashore on the coast the player was heading for | Rival berth too narrow | `C.rivals.playerLanderClearance` | Raise | Small maps run out of sites sooner and fall back to `landingClearance` |
| Small maps often fail to place four charters | Placement too strict | `C.worldgen.rivalSplashdownGive`, `maxAttempts` | Raise | Generation time on a failed seed |
| The recall fleet arrives too suddenly or too slowly | Approach length | `C.military.approachTurns`, `approachMoves` | Raise or lower | Not the lander: the fleet's landers have their own constant |

## Moving a unit feels slow, fiddly, or easy to get wrong

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| The ring takes too long to fill before a route appears | Hold too long | `HOLD_MS` in `src/ui/theme.ts` | Lower | Pans that linger start to plot; feel brief section 8 says shorten this before anything else |
| Routes appear when the player meant to pan | Hold too short, or the pan threshold too wide | `HOLD_MS`, `C.feel.holdCancelPx` | Raise, lower | The same trade from the other side |
| A far tile cannot be held without zooming in | Hold floor too high | `C.feel.routeHoldFloor` | Lower | Below about 16 a slow unit's numbered turn ends overlap |
| A tap meant for the map commits the route | The end's hit area too wide at wide zoom | `C.feel.routeEndHitPx` | Lower, not below 22 | Below 22 the end is under the 44 point floor |
| The route is hard to see on light ground | Line or halo too thin | `--route-width`, `--route-halo-width` in `src/ui/theme.ts` | Raise | Nothing else |

## Choosing a unit misses, or the chosen one is hard to see

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| A small figure is hard to hit | Target too small | `TAP_MIN_PX` in `src/ui/theme.ts` | Raise | Every control's floor; next to a building behind it, more of the building chooses the unit |
| A tap on a faint edge of a picture goes through it | Too much of the picture counted as clear | `TAP.solid` in `src/render/look.ts` | Lower | A clear corner over a unit behind starts to hide it |
| The chosen unit is lost on pale ground or in haze | Outline too thin, or its dark band too faint | `SELECTION.outlinePx`, `outlineHaloPx`, `outlineHaloAlpha` | Raise | Thick outlines merge in a stack |
| The ring under a chosen hull is too big or too small | Ring sized from the picture's width | `SELECTION.ringShare`, `ringMin`, `ringMax` | Lower or raise | Every unit's ring |
| The frame loop runs too long after the opening | Steam rises too long | `ARRIVAL.steamSeconds`, `steamFadeSeconds` | Lower | The opening shot is still while the lines read |

## Immigration stalls

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| Word sits near zero for forty turns | Not enough consigned value per Word point | `C.difficulty.*.wordPerValue` | Lower (fewer units of value per point) | Word from the consignment office too; the agent's office multiplies this |
| First immigrant takes too long | First passage too dear | `C.labour.firstPassageWord` | Lower | Nothing else |
| Later immigrants stop arriving | Step too steep | `C.labour.passageWordStep` | Lower | Signatory twelve halves both costs |
| Immigrants come too fast to house | The reverse of the above | Same three, raise | | Storage pressure, food demand |
| Nobody ever buys a passage with gold | Gold price too high against gold income | `C.labour.goldPassageBase`, `goldPassageStep` | Lower | Gold sinks; see gold below |
| Immigration stops during the war | Blockade | `fleet.ts` `blockaded`, `labour.ts` | Intended; scope in `DECISIONS.md` 12 | |

## Food is the permanent bottleneck

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| Every settlement runs a deficit with half its people on food | Yields too low for the eating rate | `C.terrain.yields[terrain].food` | Raise grassland and plains by one | The own-tile free food (decision 9), which uses the same table |
| | or the eating rate too high | `C.labour.eats` | It is 1 now (decision 152); at 2 a settlement of eight needed six on food | Every settlement's balance; the hunger card threshold; the copy reads the constant |
| Forested coast starves | Forest food cap | `C.terrain.forestFoodCap` | Raise to 2 | Makes clearing less urgent |
| Food never banks a birth | Surplus too small against the threshold | `C.labour.granaryThreshold` | Lower | See pace |
| Colonists die before the player understands food | Starvation too quick | `C.labour.starvationTurns` | Raise | Nothing else |
| Rivers and ploughing do not feel worth it | Bonuses small | `C.terrain.minorRiverBonus`, `majorRiverBonus`, `ploughBonus` | Raise | Worldgen's landing-site scoring weights rivers; improvers become worth equipping |
| Rich soil does nothing visible | Prime multiply | `C.terrain.primeMultiply` | Raise | All multiplying primes (soil, lode, flax field, madder bed) |

## Gold is too strong, or irrelevant

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| A gold seam funds everything for the whole game | Reserves large, price high, no recovery | `C.terrain.goldReserve` (min and max), `C.market.goods.gold.open` | Lower either | The gold good never recovers its price (`recovery: 0` is deliberate: the Company pays less for gold the more it has had) |
| Gold runs out in ten turns and the seam is pointless | Reserves small or `goldYield` too high | `C.terrain.goldYield` | Lower (slower, longer) | Seam depletion time only |
| Nothing to spend gold on | Sinks too cheap or absent | `C.labour.goldPassageBase`, `C.buildings.importedMachineGold`, `C.market.goods.*.spread` | Raise or lower to taste | Spread changes every buy price; imported machines are the late sink |
| Buying tooling is always better than making it | Spread too small against the toolworks | `C.market.goods.tooling.spread` | Raise | Signatory two halves it |
| Gold price at the floor all game | Dumping gold | `C.market.goods.gold.volumeToShift` | Raise (slower fall) | The gold card's "falling to" text |

## Dumping is not punished enough to teach the lesson

The lesson is: a large consignment walks its own price down, and the Company pays less the more it
has been sent. The player should feel it on the first big sale.

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| A dump of 200 barely moves the price | `volumeToShift` too high for that good | `C.market.goods[good].volumeToShift` | Lower | The consignment office sells automatically above a threshold and will now crash the price by itself; the surplus rule too |
| The price moves but recovers next turn | Recovery too fast | `C.market.goods[good].recovery`, `C.difficulty.*.recoveryRate` | Lower | Every good's rebound; the "quiet turn" test (`soldThisTurn < recovery * 2`) |
| The walk is invisible because lots are too big | Lot size | `C.market.lotSize` | Lower (finer walk, more text) | The consign sheet's chips and the dispatch sentence |
| The price hits the floor and the lesson is "nothing matters below here" | Floor too high or too low | `C.market.goods[good].floor` | Set the floor so a dump of four lots lands above it | |
| The dispatch does not say why | The `why` text only appears when the price fell | `market.ts` `consign` | | |
| The office dumps on the player's behalf | Office threshold | `C.market.consignmentOfficeThreshold` | Raise | The office's keep-back for building inputs is twice the threshold |
| New settlements sell everything, or nothing | The inferred threshold | `C.market.defaultSurplusThreshold` | Raise or lower; keep it under the base storage | Horses and inputs are kept at twice it; a good's own rule (decision 159) overrides both |
| The dispatch is full of one-unit sales | The full store sale | `C.market.fullStoreMinSale` | Raise | Spoilage takes what is not sold |
| A steady seller's price walks to the floor by itself | Recovery too slow for the output | `C.market.goods[good].recovery` | Raise; it is twice the proposal's now (decision 157) | The quiet turn test is twice the recovery |
| The dumping card nags a settlement that sells a little | The card's thresholds | `C.market.dumpingAlertShare`, `dumpingAlertDrop` | Raise | Nothing else |

## The queue asks too much, or too little

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| Eight cards every turn, most of them idle units | Pace | `C.queue.paces.normal` | Lower, or change the default pace | The fold |
| The same card every turn that cannot be acted on | A type-three condition with no remedy | Fix the condition's `opens` or `choices` in the system that makes it | | |
| Opportunities never come back | Lapse after one return | `C.queue.opportunityReturns` | Raise | Only type five |
| "Review orders" arrives before the settlement has done anything | | `C.queue.reviewOrdersAfter` | Raise | |
| Losses are buried under Company cards | Type weights | `C.queue.typeWeight` | Keep the order; widen the gaps if magnitude overlaps them | `persistenceBoost` never crosses a gap of 100 |
| Old problems do not rise | Persistence | `C.queue.persistenceBoost` | Raise to about 20 if persistence should cross a type | |
| Spoilage cards on every settlement | Storage too small | `C.buildings.storage` (40, 80, 200, 400) | Raise the base | Spoilage amounts; the build order's value of storage |
| Build-empty cards are noise | | Consider setting `buildEmpty` only after the carpenter exists, in `settlement.ts` | | |
| Quiet turns never happen | Too many standing conditions | The thresholds above; `C.onboarding.unlockBackstop` | | |

## Rivals are invisible, or overwhelming

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| Rivals never leave peace | War needs suspicion 1.0 from raiders caught | `C.rivals.suspicionPerRaid`, `warAt`, `C.naval.rivalRaidChancePerTurn` | Raise the first, lower the second, raise the third | Raiders off the coast; the naval cards |
| Rivals never even go tense | Nothing crowds and nothing undercuts | `C.rivals.crowdingRadius`, `undercutBelow`, `suspicionPerUndercut` | Raise the first and third, raise the second toward 1 | Undercutting stops at tense by rule (decision 156) |
| Rivals go tense the moment you settle | Crowding | `C.rivals.crowdingRadius`, `crowdingRelationPerTurn` | Lower | |
| Rival settlements everywhere by turn 200 | Cap binds | `C.rivals.settlementCap`, `expansionBase`, `expansionPerSettlement` | See `DECISIONS.md` 15; lower the base and raise the per-settlement drag before touching the cap | The measured table in that decision |
| Rivals never found a second settlement | | `C.difficulty.*.rivalExpansion`, `expansionBase` | Raise | |
| Prices fall for no reason | Rival footprint | `C.market.rivalCoupling`, `C.rivals.marketFootprintPerPop` | Lower | The rivals' own tables too |
| At war, one militia arrives every fifteen turns | War-party chance | `0.08` and `strength / 4` in `src/sim/rivals.ts` (move to `C.rivals`) | Raise | |
| Rival war parties are hardened and unbeatable | Strength growth | `C.rivals.strengthPerTurn` | Lower | The hardened threshold is `strength > 12` in `rivals.ts` |
| Every rival declares and wins by turn 480 on hard | Declaration chance | `0.004` a turn after turn 150 in `rivals.ts` (move to `C.rivals`) | Lower | `difficulty.*.rivalsMayDeclare` turns it off |

## Haul routes stop too often, or walk into trouble

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| A hauler under avoid waits for a hostile three tiles off that never comes | The radius | `C.orders.hostileRadius` | Lower | Escort uses the same radius |
| Routes under run are raided every time | That is the posture; the player chose it | | Choose avoid or escort in the circuit's detail (decision 161) | |

## The predecessors are not worth the attention

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| They buy ten units and stop | Purse | `(wealth + 200) / price` and `+3` a turn in `src/sim/predecessors.ts` (move to `C.predecessors`) | Raise the 200, raise the refill | Their prices rise with wealth (`wealthPerTrade`, `wealthPriceCap`) |
| Trade pays less than the Company | Base fraction and premiums | `C.predecessors.basePriceFraction`, `strongPremium`, `minorPremium` | Raise | No charge is paid, so compare after the Company's charge |
| Nobody bothers to learn a crop | Master yield | `C.terrain.masterMultiply` | Raise | School-made masters of buildings use `C.labour.masterMultiplier`, a different constant |
| The crops are not on the map near the landing | Worldgen | `C.worldgen.minPredecessorsReachable`, `predecessorsPerThousandTiles` | Raise | Landing-site validation requires bloom to be reachable |
| Alarm closes them before trade starts | Alarm rates | `C.predecessors.alarmPerTileTaken`, `alarmDecay`, `alarmRefuse`, `alarmClose`, `C.difficulty.*.alarmSensitivity` | Lower the first, raise the decay | An agent halves the rise |
| Gifts never come | | `C.predecessors.giftChance`, `giftAmount` | Raise | |
| Barter is always better than gold, or never worth it | The bonus | `C.predecessors.barterBonus` | Lower or raise | Decision 160 |
| They never have anything to give | The store | `C.predecessors.storePerTurn`, `storeCap` | Raise | |
| A surplus rule cannot reach them | Reach | `C.predecessors.offerReach` | Raise | The chips offered in the orders sheet |
| Haggling is free | No limit on haggles | `C.predecessors.haggleSuccess`, `haggleGain`; one-haggle memory is a code change | | |

## The recall fleet is trivial, or impossible

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| The fleet is five units and the war is one wave | Fleet scale | `C.military.fleetBase`, `fleetPerGrievance`, `C.difficulty.*.fleetMultiplier` | Raise | The declaration card shows the size; raising it raises the stakes of every grievance point |
| The fleet is sixty and the landing falls on the first wave | The same, or `fleetMaxUnits` | Lower; check `fortMultipliers` and garrison | |
| The player cannot muster in six turns | Window | `C.military.declarationWindow` | Raise | The first wave's timing |
| Waves land where nobody is | Anchorage choice | `candidateAnchorages` in `fleet.ts` prefers within ten tiles of a settlement | Lower the ten | |
| The narrowing is meaningless | `approachTurns` | Raise to four | The wave card text |
| Works do nothing | Multipliers | `C.military.fortMultipliers` | Raise tiers two and three | Rival settlements use the same table to resist |
| A siege train breaches in two turns | | `C.military.breachThreshold` | Raise; it is per settlement now, however many trains (decision 154) | |
| Outposts are sacked every turn by every unit beside them | The sack cooldown | `C.military.sackCooldown`, `sackFraction` | Raise the first | |
| Batteries are useless | Table | `C.military.units.battery.attackSettlement`, `defenceSettlement` | Raise | Signatory nine doubles coastal batteries |
| Militia are useless against regulars | Regulars table | `C.military.company.regulars`, `horse` | Lower to 6 and 8 | Ambush odds in cover |
| Nobody promotes | | `C.military.promotionChance` | Raise | Signatory eight multiplies it by 1.6 |

## The war drags

| Symptom | Likely cause | Constant | Direction | Also affects |
|---|---|---|---|---|
| Ten turns between waves | Interval and launch chance | `C.military.waveInterval`; `0.6` in `fleet.ts` (move to `C.military`) | Lower, raise | |
| Waves are too small to threaten | | `C.military.waveSize` | Raise | Fewer waves from the same pool |
| Company units wander sacking outposts forever | Sack rule | `takeSettlement` in `military.ts` (decision 20) | Make the Company hold ground, or march only on the landing | |
| Company units sit beside a settlement without attacking | They attack only what is adjacent at the start of their move | `moveHostiles` in `military.ts` | | |
| The blockade ship never leaves | It leaves when the pool is empty and nothing is at sea | `fleet.ts` | | |
| Intervention never comes | Accrual | `C.military.interventionGrievance`; `3` per meeting house in `fleet.ts` | Lower, raise | Decision 22 |
| The war is won without a fight | Win check | `fleet.ts` requires every Company land unit gone; a unit stuck on an island keeps the war open | | |

---

## Load-bearing constants: change one at a time

These sit under several systems at once. Change one, play forty turns, look at the dispatch and the
queue, then change the next.

- `C.labour.eats` and `C.terrain.yields` food values: every settlement's balance, hunger, growth.
- `C.labour.granaryThreshold`: birth rate, therefore pop, therefore resolve denominators and the
  size gates.
- `C.difficulty.*.wordPerValue`, `C.labour.firstPassageWord`, `passageWordStep`: immigration, which
  is the other half of population.
- `C.market.goods[*].volumeToShift` and `recovery`: the whole price model, the office, the surplus
  rule, the dumping lesson, and rival coupling all run through them.
- `C.market.lotSize`: the walk, the sheet, the dispatch text.
- `C.grievance.perWorker`, `maxPerSettlement`, `perPopulationForResolve`, `declarationGate`: when
  the declaration becomes possible, the signatory rate, and the fleet size (through `grievanceTotal`).
- `C.military.fleetBase`, `fleetPerGrievance`, `difficulty.*.fleetMultiplier`: the endgame.
- `C.military.exchanges` and the unit tables: every fight, pinned by sampling in `tests/pins.test.ts`;
  changing them changes the pins.
- `C.military.fortMultipliers`: defence of every settlement, including rival resistance.
- `C.buildings.costs`, `popGate`, `C.labour.workersPerBuilding`, `tierMultiplier`: the build economy.
- `C.queue.typeWeight`: the order of everything the player sees.
- `C.rivals.expansionBase`, `expansionPerSettlement`, `expansionPerPop`, `expansionPerTile`: how
  crowded the coast is; `settlementCap` is a backstop only (decision 149).
- `C.session.pace[size]`: when the declaration comes and how big the fleet is, by size (decision
  153). Change it for one size at a time and rerun `tests/pace.test.ts` for that size.
- `C.autopilot.*`: the machine's play, not the game's. Changing a knob changes what the tables
  measure, never what a player can do; say so in the decision when a table is re-recorded.

## Safe to adjust freely

Cosmetic, local, or bounded by a hard rule elsewhere.

- Names and colours: `C.rivals.names`, `colours`, `C.art.palette`, settlement and predecessor name
  lists in `worldgen.ts`, signatory names in `grievance.ts`.
- `C.art.*` jitter, subdivisions, cloud scale and strength, season hue and saturation arrays (keep
  four entries).
- `C.feel.*` zoom levels (keep `working` at or above `tileTapFloor`), hold and tap timings, LOD
  thresholds (keep `lodRestore` above `lodCull`), DPR values, audio volumes and fade times.
- `C.session.dispatchCap`, `intentDefault`.
- `C.market.priceJitter`, `C.predecessors.giftChance`, `giftAmount`, `preferenceRotateEvery`.
- `C.onboarding.unlockBackstop.*`, `marketUnlockValue`, `refiningUnlockCrop`, `grievanceUnlockPop`:
  they change when cards appear, never what the game does.
- `C.queue.opportunityReturns`, `reviewOrdersAfter`, `paces`.
- `C.naval.repairPerTurn`, `damagePerLostRound`, `raidCargoFraction`.
- `C.military.approachTurns`, `declarationWindow` (keep the window longer than `approachTurns`).
- Storage tiers `C.buildings.storage` (raising them only removes spoilage).

## Literals that should be constants

Found while writing this table. Each is a number a tuner will look for in `C` and not find.

| Where | Literal | What it does |
|---|---|---|
| `src/sim/rivals.ts` | `0.08`, `strength / 4`, `0.3`, `> 12`, `0.02`, `0.01`, `0.015`, `0.004`, `turn > 150`, `pop > 20`, `0.02`, `/ 30` | War-party chance and cap, outrider share, hardened threshold, rival building chances, declaration chance and gates, war resolution odds |
| `src/sim/fleet.ts` | `0.6`, `3`, `0.4`, `+= 2`, `<= 10` | Launch chance, intervention accrual, intervention cut, blockade ship damage, anchorage preference radius |
| `src/sim/orders.ts` | `2`, `4`, `>= 10` | Transit speeds without and with roads, minimum surplus to ship (the hostile radius is `C.orders.hostileRadius` now) |
| `src/sim/predecessors.ts` | `200`, `0.35`, `0.1`, `3`, `0.5` | Purse base, purse drawdown, purse gain, refill, haggle loss fraction |
| `src/sim/military.ts` | `0.5`, `1.6`, `<= 12` | Sack fraction, signatory eight promotion bonus, the Company's landing preference radius |
| `src/sim/naval.ts` | `0.5`, `>= 2`, `6`, `5` | Coin toss for a slower raider, go-home damage, raider path length, the sail card radius |
| `src/sim/settlement.ts` | `2` in `fb * 2` | How far ahead the hunger card looks |
| `src/ui/app.ts` | `0.58`, `0.75`, `8`, `5000` | Layout split, arrival zoom, undo depth, toast time |
| `src/ui/sheets.ts` | `[20, 40, 60, 100, 150]`, `lotSize * 2` | Surplus threshold chips, default consignment |
| `src/render/picking.ts` | `18`, `34`, `0.55`, `0.8` | Marker hit radii |
