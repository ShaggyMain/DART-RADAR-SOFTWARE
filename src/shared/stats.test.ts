import { describe, expect, it } from 'vitest'
import { formatDuration, mean, percentileRank, rollingMean } from './stats'

describe('percentileRank', () => {
  it('returns null with no history', () => {
    expect(percentileRank([], 0.5)).toBeNull()
  })

  it('ranks against previous values', () => {
    expect(percentileRank([0.2, 0.4, 0.6, 0.8], 0.9)).toBe(100)
    expect(percentileRank([0.2, 0.4, 0.6, 0.8], 0.1)).toBe(0)
    expect(percentileRank([0.2, 0.4, 0.6, 0.8], 0.5)).toBe(50)
  })

  it('counts ties as half', () => {
    expect(percentileRank([0.5, 0.5], 0.5)).toBe(50)
    expect(percentileRank([0.3, 0.5, 0.7], 0.5)).toBeCloseTo(50)
  })
})

describe('mean / rollingMean', () => {
  it('computes means', () => {
    expect(mean([1, 2, 3])).toBe(2)
    expect(mean([])).toBeNull()
  })

  it('rolling mean uses the tail', () => {
    expect(rollingMean([0, 0, 10, 20], 2)).toBe(15)
    expect(rollingMean([5], 10)).toBe(5)
    expect(rollingMean([], 3)).toBeNull()
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(185_000)).toBe('3m 05s')
    expect(formatDuration(5_040_000)).toBe('1h 24m')
  })
})
