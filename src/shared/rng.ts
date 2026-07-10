/**
 * Deterministic seeded PRNG for procedural task generation.
 *
 * Every scenario in the app is produced from a pure, seeded generator so that
 * sessions are reproducible and unit-testable. Never use Math.random() in
 * task logic — always pass an Rng instance through.
 */

/** xmur3 string hash — turns an arbitrary string seed into a 32-bit int. */
export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

/** mulberry32 — tiny, fast, deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Rng {
  private readonly gen: () => number
  readonly seed: string

  constructor(seed: string | number) {
    this.seed = String(seed)
    this.gen = mulberry32(typeof seed === 'number' ? seed >>> 0 : hashSeed(seed))
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.gen()
  }

  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max (${max}) < min (${min})`)
    return min + Math.floor(this.gen() * (max - min + 1))
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.gen() * (max - min)
  }

  bool(p = 0.5): boolean {
    return this.gen() < p
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array')
    return arr[this.int(0, arr.length - 1)]
  }

  /** Fisher–Yates shuffle; returns a new array, input untouched. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  /** n distinct elements sampled without replacement. */
  sample<T>(arr: readonly T[], n: number): T[] {
    if (n > arr.length) throw new Error(`Rng.sample: n (${n}) > array length (${arr.length})`)
    return this.shuffle(arr).slice(0, n)
  }

  /**
   * Derive an independent child RNG. Useful to keep sub-generators stable:
   * inserting draws in one branch does not shift the sequence of another.
   */
  fork(label: string): Rng {
    return new Rng(`${this.seed}:${label}:${this.int(0, 0xffffffff)}`)
  }
}
