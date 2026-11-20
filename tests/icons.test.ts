import { describe, it, expect } from 'vitest'
import { GOODS } from '../src/sim/state'
import { ICON_NAMES } from '../src/ui/icons'
import sprite from '../src/ui/icons.svg?raw'

// The icon set, art direction brief section 11a: every good and every name the interface draws by
// has its drawing in the sprite, read as text, so a good added to the game without an icon fails
// here rather than drawing nothing.
const symbols = [...sprite.matchAll(/<symbol id="ic-([a-zA-Z]+)"/g)].map(m => m[1])

describe('the icon set', () => {
  it('has a symbol for every good', () => {
    for (const g of GOODS) expect(symbols, `no symbol for the good ${g}`).toContain(g)
  })

  it('has a symbol for every icon name, and no symbol without a name', () => {
    for (const name of ICON_NAMES) expect(symbols, `no symbol for ${name}`).toContain(name)
    for (const s of symbols) expect(ICON_NAMES as readonly string[], `a symbol nothing names: ${s}`).toContain(s)
    expect(new Set(symbols).size).toBe(symbols.length)
  })

  it('draws every symbol on the one 64 unit square', () => {
    for (const m of sprite.matchAll(/<symbol id="ic-([a-zA-Z]+)" viewBox="([^"]+)"/g)) expect(m[2], m[1]).toBe('0 0 64 64')
  })
})
