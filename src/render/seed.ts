// A stable integer from the seed string, for the renderer's deterministic jitter. The renderer
// never touches the sim's RNG streams.
export function seedNumber(seed: string): number {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h >>> 0) % 1000003
}
