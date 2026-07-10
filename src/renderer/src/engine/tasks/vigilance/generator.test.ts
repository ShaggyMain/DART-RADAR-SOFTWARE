import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import { generate, jumpTimes, score } from './generator'

describe('vigilance generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 2)).toEqual(generate('s', 2))
  })

  it.each(DIFFICULTIES)('difficulty %i: places the configured number of jumps with gaps', (d) => {
    const s = generate('jumps', d)
    const jumps = s.steps
      .map((j, i) => (j ? i : -1))
      .filter((i) => i >= 0)
    expect(jumps.length).toBeGreaterThanOrEqual(6)
    for (let k = 1; k < jumps.length; k++) {
      expect(jumps[k] - jumps[k - 1]).toBeGreaterThan(2)
    }
    // never at the very start
    expect(jumps[0]).toBeGreaterThanOrEqual(3)
  })

  it('duration equals steps * interval', () => {
    const s = generate('dur', 3)
    expect(s.durationMs).toBe(s.steps.length * s.stepIntervalMs)
  })
})

describe('vigilance scorer', () => {
  it('scores perfect detection', () => {
    const s = generate('perfect', 1)
    const presses = jumpTimes(s).map((t) => ({ tMs: t + 300 }))
    const r = score(s, presses)
    expect(r.accuracy).toBe(1)
    expect(r.extra?.falseAlarms).toBe(0)
    expect(r.meanRtMs).toBeCloseTo(300)
  })

  it('counts misses and false alarms', () => {
    const s = generate('mixed', 1)
    const jumps = jumpTimes(s)
    // hit only the first jump; add two stray presses far from any jump
    const stray1 = jumps[0] + s.responseWindowMs + 2000
    const presses = [{ tMs: jumps[0] + 200 }, { tMs: stray1 }, { tMs: stray1 + 300 }]
    const r = score(s, presses)
    expect(r.correct).toBe(1)
    expect(r.items.filter((i) => i.timedOut)).toHaveLength(jumps.length - 1)
    expect(r.extra?.falseAlarms).toBe(2)
  })

  it('one press cannot hit two jumps', () => {
    const s = generate('double', 1)
    const jumps = jumpTimes(s)
    const r = score(s, [{ tMs: jumps[0] + 100 }])
    expect(r.correct).toBe(1)
  })

  it('a press before the jump does not count', () => {
    const s = generate('early', 1)
    const jumps = jumpTimes(s)
    const r = score(s, [{ tMs: jumps[0] - 50 }])
    expect(r.correct).toBe(0)
    expect(r.extra?.falseAlarms).toBe(1)
  })
})
