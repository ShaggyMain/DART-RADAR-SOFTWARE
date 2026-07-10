import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import { countViolations, generate, landsBefore, score } from './generator'

describe('planning generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: ETAs recompute exactly from distance/speed', (d) => {
    const s = generate('eta', d)
    for (const item of s.items) {
      for (const a of item.aircraft) {
        expect(a.etaMin).toBeCloseTo(a.distanceNm / (a.speedKts / 60), 10)
        expect(Number.isInteger(a.distanceNm)).toBe(true)
        expect(a.speedKts % 60).toBe(0)
      }
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: ETA spacing guarantees a unique order', (d) => {
    const s = generate('spacing', d)
    for (const item of s.items) {
      const etas = item.aircraft.map((a) => a.etaMin).sort((x, y) => x - y)
      for (let i = 1; i < etas.length; i++) {
        const gap = etas[i] - etas[i - 1]
        // gaps are either designated 0.5-minute window pairs, or ≥ 1.5 min —
        // safely outside the 1-minute jet/prop window, so ETA decides
        expect(gap === 0.5 || gap >= 1.5).toBe(true)
      }
      // window pairs must be jet-vs-prop so the tiebreak rule decides them
      for (const a of item.aircraft) {
        for (const b of item.aircraft) {
          if (a === b) continue
          if (Math.abs(a.etaMin - b.etaMin) < 1) expect(a.type).not.toBe(b.type)
        }
      }
    }
  })

  it('correctOrder is a violation-free permutation; any adjacent swap violates', () => {
    for (const d of DIFFICULTIES) {
      const s = generate('order', d)
      for (const item of s.items) {
        expect([...item.correctOrder].sort()).toEqual(
          item.aircraft.map((a) => a.callsign).sort()
        )
        expect(countViolations(item, item.correctOrder)).toBe(0)
        for (let i = 0; i < item.correctOrder.length - 1; i++) {
          const swapped = item.correctOrder.slice()
          ;[swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
          expect(countViolations(item, swapped)).toBeGreaterThan(0)
        }
      }
    }
  })

  it('low-fuel aircraft (when present) lands first', () => {
    for (const seed of ['lf1', 'lf2', 'lf3']) {
      const s = generate(seed, 4)
      for (const item of s.items) {
        const lowFuel = item.aircraft.find((a) => a.lowFuel)
        if (lowFuel) expect(item.correctOrder[0]).toBe(lowFuel.callsign)
      }
    }
  })

  it('difficulty 1 never uses low fuel or window pairs', () => {
    const s = generate('easy', 1)
    for (const item of s.items) {
      expect(item.lowFuelRuleActive).toBe(false)
      expect(item.windowRuleActive).toBe(false)
      expect(item.aircraft.some((a) => a.lowFuel)).toBe(false)
    }
  })

  it('callsigns are unique within an item', () => {
    const s = generate('cs', 5)
    for (const item of s.items) {
      const signs = item.aircraft.map((a) => a.callsign)
      expect(new Set(signs).size).toBe(signs.length)
    }
  })
})

describe('landsBefore', () => {
  const mk = (etaMin: number, type: 'jet' | 'prop', lowFuel = false) => ({
    callsign: 'X',
    type,
    speedKts: 300,
    distanceNm: 30,
    etaMin,
    lowFuel,
    bearingDeg: 0
  })

  it('low fuel overrides everything', () => {
    const ctx = { lowFuelRuleActive: true, windowRuleActive: true }
    expect(landsBefore(mk(20, 'prop', true), mk(5, 'jet'), ctx)).toBe(true)
  })

  it('jet beats prop only inside the 1-minute window', () => {
    const ctx = { lowFuelRuleActive: false, windowRuleActive: true }
    expect(landsBefore(mk(10.5, 'jet'), mk(10, 'prop'), ctx)).toBe(true)
    expect(landsBefore(mk(12, 'jet'), mk(10, 'prop'), ctx)).toBe(false)
  })
})

describe('planning scorer', () => {
  it('scores exact orders as correct', () => {
    const s = generate('sc', 2)
    const responses = s.items.map((i) => ({ order: i.correctOrder.slice(), rtMs: 30000 }))
    const r = score(s, responses)
    expect(r.accuracy).toBe(1)
    expect(r.extra?.ruleViolations).toBe(0)
  })

  it('counts violations for wrong orders and flags incomplete ones as timeouts', () => {
    const s = generate('sc2', 3)
    const wrong = s.items.map((i, idx) =>
      idx === 0
        ? { order: [...i.correctOrder].reverse(), rtMs: 30000 }
        : { order: i.correctOrder.slice(0, 1), rtMs: 30000 }
    )
    const r = score(s, wrong)
    expect(r.items[0].correct).toBe(false)
    expect(r.items[1].timedOut).toBe(true)
    expect(r.extra?.ruleViolations).toBeGreaterThan(0)
  })
})
