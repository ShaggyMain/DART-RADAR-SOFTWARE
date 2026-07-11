import { describe, expect, it } from 'vitest'
import {
  normalCdf,
  percentileFromNormal,
  recommendDifficulty,
  stanineFromPercentile
} from './adaptive'

describe('recommendDifficulty', () => {
  it('returns the fallback with no history', () => {
    expect(recommendDifficulty([], 2)).toBe(2)
    expect(recommendDifficulty([], 4)).toBe(4)
  })

  it('raises after consistently high accuracy at the current level', () => {
    expect(
      recommendDifficulty([
        { difficulty: 2, accuracy: 0.9 },
        { difficulty: 2, accuracy: 0.88 },
        { difficulty: 2, accuracy: 0.92 }
      ])
    ).toBe(3)
  })

  it('lowers after consistently poor accuracy', () => {
    expect(
      recommendDifficulty([
        { difficulty: 3, accuracy: 0.5 },
        { difficulty: 3, accuracy: 0.55 }
      ])
    ).toBe(2)
  })

  it('holds inside the 60–85% band', () => {
    expect(
      recommendDifficulty([
        { difficulty: 3, accuracy: 0.75 },
        { difficulty: 3, accuracy: 0.7 }
      ])
    ).toBe(3)
  })

  it('caps at 5 and floors at 1', () => {
    expect(recommendDifficulty([{ difficulty: 5, accuracy: 1 }])).toBe(5)
    expect(recommendDifficulty([{ difficulty: 1, accuracy: 0.1 }])).toBe(1)
  })

  it('ignores older sessions at other levels and beyond the window', () => {
    expect(
      recommendDifficulty([
        { difficulty: 3, accuracy: 0.9 },
        { difficulty: 3, accuracy: 0.9 },
        { difficulty: 3, accuracy: 0.9 },
        { difficulty: 3, accuracy: 0.1 }, // outside window of 3
        { difficulty: 1, accuracy: 0.2 } // different level
      ])
    ).toBe(4)
  })
})

describe('stanineFromPercentile', () => {
  it('maps standard boundaries', () => {
    expect(stanineFromPercentile(0)).toBe(1)
    expect(stanineFromPercentile(3.9)).toBe(1)
    expect(stanineFromPercentile(4)).toBe(2)
    expect(stanineFromPercentile(50)).toBe(5)
    expect(stanineFromPercentile(76)).toBe(6)
    expect(stanineFromPercentile(77)).toBe(7)
    expect(stanineFromPercentile(96)).toBe(9)
    expect(stanineFromPercentile(100)).toBe(9)
  })
})

describe('normalCdf / percentileFromNormal', () => {
  it('matches known CDF values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4)
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3)
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
  })

  it('percentileFromNormal centres on mu', () => {
    expect(percentileFromNormal(0.7, 0.7, 0.15)).toBeCloseTo(50, 3)
    expect(percentileFromNormal(0.85, 0.7, 0.15)).toBeCloseTo(84.13, 1)
    expect(percentileFromNormal(1, 0.7, 0)).toBe(100)
  })
})
