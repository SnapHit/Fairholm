// The ordered system list. Turn loop order per build specification section 6.
import type { System } from './turn'
import { settlementSystem, spoilageSystem } from './settlement'
import { ordersSystem } from './orders'
import { marketSystem } from './market'
import { labourSystem } from './labour'
import { grievanceSystem } from './grievance'
import { rivalsSystem } from './rivals'
import { predecessorsSystem } from './predecessors'
import { fleetSystem } from './fleet'
import { militarySystem } from './military'
import { navalSystem } from './naval'

export const SYSTEMS: System[] = [
  settlementSystem,     // 2 production, 3 consumption, 4 growth, 5 construction
  ordersSystem,         // 6 orders
  marketSystem,         // 7 market
  labourSystem,         // 8 word and passage
  grievanceSystem,      // 9 grievance
  rivalsSystem,         // 10 rivals
  predecessorsSystem,   // 11 predecessors
  fleetSystem,          // 12 fleet
  navalSystem,          // 13a naval contact
  militarySystem,       // 13 combat
  spoilageSystem,       // 14 spoilage
]
