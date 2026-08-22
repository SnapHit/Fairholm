import { describe, it, expect } from 'vitest'
import { createGame } from '../src/sim/actions'

describe('worldgen', () => {
  it('offers three landing sites and four charters across seeds and sizes', () => {
    const sizes = ['small', 'standard', 'large'] as const
    const shapes = ['continent', 'coast', 'archipelago'] as const
    let worst = 0
    for (const size of sizes) for (const shape of shapes) for (let i = 0; i < 3; i++) {
      const t0 = Date.now()
      const s = createGame(`seed${i}`, { size, shape }, 1)
      worst = Math.max(worst, Date.now() - t0)
      expect(s.world.landingSites.length, `${size} ${shape} seed${i}`).toBe(3)
      expect(s.charters.length).toBe(4)
      expect(s.flags.worldgenProblem).toBeUndefined()
    }
    console.log('worst generation ms', worst)
  })
  it('is deterministic from the seed', () => {
    const a = createGame('same', { size: 'small' }, 1)
    const b = createGame('same', { size: 'small' }, 2)
    expect(a.world.tiles.map(t => t.terrain + (t.forest ?? '') + t.river + (t.prime ?? '')).join('')).toBe(b.world.tiles.map(t => t.terrain + (t.forest ?? '') + t.river + (t.prime ?? '')).join(''))
    expect(a.world.anchorages).toEqual(b.world.anchorages)
  })
})
