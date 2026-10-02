// Saves from an earlier build are turned away, not read. Persistence brief section 4: during
// development a schema change invalidates the save, and the boot says so in plain words and begins
// a new game (src/main.ts). The schema and the worldgen version are checked separately.

import { describe, it, expect } from 'vitest'
import { toSave, fromSave } from '../src/io/save'
import { SCHEMA_VERSION, WORLDGEN_VERSION } from '../src/sim/constants'
import { arrived } from './helpers'

describe('old saves', () => {
  it('a save of an earlier schema or an earlier worldgen is refused with a message that names the versions', () => {
    const s = arrived('old-save', { size: 'small' }, 1)
    const save = toSave(s)
    expect(save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(save.worldgenVersion).toBe(WORLDGEN_VERSION)
    expect(() => fromSave({ ...save, schemaVersion: SCHEMA_VERSION - 1 }, 2)).toThrow(/schema/)
    expect(() => fromSave({ ...save, worldgenVersion: WORLDGEN_VERSION - 1 }, 2)).toThrow(/worldgen/)
    // and the save as written comes back
    const back = fromSave(JSON.parse(JSON.stringify(save)), 2)
    expect(back.turn).toBe(s.turn)
    expect(back.settlements.find(x => x.owner === 0)?.name).toBe('The Landing')
  })
})
