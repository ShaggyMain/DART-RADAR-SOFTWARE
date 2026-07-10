import { describe, expect, it } from 'vitest'
import { Rng, hashSeed, mulberry32 } from './rng'

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'))
  })

  it('differs for different strings', () => {
    expect(hashSeed('hello')).not.toBe(hashSeed('hellp'))
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
  })

  it('returns an unsigned 32-bit int', () => {
    for (const s of ['', 'x', 'seed-123', '🙂']) {
      const h = hashSeed(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('produces values in [0, 1)', () => {
    const g = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = g()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('Rng', () => {
  it('same string seed => identical sequence', () => {
    const a = new Rng('scenario-1')
    const b = new Rng('scenario-1')
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next())
  })

  it('int stays within inclusive bounds and hits both ends', () => {
    const rng = new Rng('bounds')
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
      seen.add(v)
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]))
  })

  it('int throws when max < min', () => {
    expect(() => new Rng('x').int(5, 4)).toThrow()
  })

  it('shuffle returns a permutation and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const frozen = input.slice()
    const rng = new Rng('shuffle')
    const out = rng.shuffle(input)
    expect(input).toEqual(frozen)
    expect(out.slice().sort((a, b) => a - b)).toEqual(frozen)
  })

  it('sample returns n distinct elements', () => {
    const rng = new Rng('sample')
    const out = rng.sample([1, 2, 3, 4, 5], 3)
    expect(out).toHaveLength(3)
    expect(new Set(out).size).toBe(3)
  })

  it('sample throws when n exceeds array length', () => {
    expect(() => new Rng('x').sample([1, 2], 3)).toThrow()
  })

  it('pick throws on empty array', () => {
    expect(() => new Rng('x').pick([])).toThrow()
  })

  it('fork produces deterministic but independent child streams', () => {
    const mk = (): number[] => {
      const rng = new Rng('parent')
      const child = rng.fork('a')
      return [child.next(), child.next(), rng.next()]
    }
    expect(mk()).toEqual(mk())

    const p1 = new Rng('parent')
    const c1 = p1.fork('a')
    const p2 = new Rng('parent')
    const c2 = p2.fork('b')
    expect(c1.next()).not.toBe(c2.next())
  })

  it('bool respects probability roughly', () => {
    const rng = new Rng('bool')
    let trues = 0
    for (let i = 0; i < 5000; i++) if (rng.bool(0.25)) trues++
    expect(trues / 5000).toBeGreaterThan(0.2)
    expect(trues / 5000).toBeLessThan(0.3)
  })
})
