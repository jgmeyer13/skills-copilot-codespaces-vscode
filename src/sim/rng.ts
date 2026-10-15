/**
 * Deterministic pseudo-random number generation.
 *
 * The whole simulation must be reproducible from a seed, so nothing in `src/sim`
 * is allowed to call `Math.random()` (an ESLint rule enforces this). Every random
 * draw goes through an `Rng` instance whose state is part of the world and is
 * advanced in a fixed order by the tick loop.
 */

/** sfc32 — small, fast, passes PractRand, and trivially serialisable (4 × uint32). */
export interface RngState {
  a: number
  b: number
  c: number
  d: number
}

export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(seed: number) {
    // Expand a single 32-bit seed into four well-mixed words via splitmix32.
    let x = seed >>> 0
    const next = (): number => {
      x = (x + 0x9e3779b9) >>> 0
      let z = x
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
      return (z ^ (z >>> 15)) >>> 0
    }
    this.a = next()
    this.b = next()
    this.c = next()
    this.d = next()
    // Discard the first few outputs so low-entropy seeds (0, 1, 2…) decorrelate.
    for (let i = 0; i < 12; i++) this.next()
  }

  /** Raw uint32. */
  next(): number {
    const t = (this.a + this.b) >>> 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) >>> 0
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0
    this.d = (this.d + 1) >>> 0
    const r = (t + this.d) >>> 0
    this.c = (this.c + r) >>> 0
    return r
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.next() / 4294967296
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min)
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) return min
    return min + Math.floor(this.float() * (max - min + 1))
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.float() < p
  }

  /** Uniform choice from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array')
    return items[Math.floor(this.float() * items.length)] as T
  }

  /**
   * Weighted choice. `weights` must be the same length as `items` and sum > 0.
   * Used for SKU mix and carrier allocation, where a flat distribution looks fake.
   */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0
    for (let i = 0; i < items.length; i++) total += weights[i] ?? 0
    let roll = this.float() * total
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] ?? 0
      if (roll <= 0) return items[i] as T
    }
    return items[items.length - 1] as T
  }

  /** Approximately normal via the mean of four uniforms (Irwin–Hall), clamped to ±1. */
  gaussian(mean: number, stdDev: number): number {
    const u = (this.float() + this.float() + this.float() + this.float()) / 4
    return mean + (u - 0.5) * 3.4641 * stdDev
  }

  /** In-place Fisher–Yates. Deterministic given the stream position. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1))
      const a = items[i] as T
      const b = items[j] as T
      items[i] = b
      items[j] = a
    }
    return items
  }

  /** Snapshot the generator so a world can be saved and resumed bit-for-bit. */
  getState(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d }
  }

  setState(s: RngState): void {
    this.a = s.a >>> 0
    this.b = s.b >>> 0
    this.c = s.c >>> 0
    this.d = s.d >>> 0
  }

  /**
   * A child generator derived from this one plus a label. Lets a subsystem draw
   * numbers without shifting the parent stream — important because it means
   * adding a random draw in one system can't silently change every other system.
   */
  fork(label: string): Rng {
    let h = 2166136261 >>> 0
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return new Rng((this.next() ^ h) >>> 0)
  }
}

/** Parse a user-supplied seed string into a uint32. Accepts digits or any text. */
export function parseSeed(input: string): number {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0
  let h = 2166136261 >>> 0
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}
