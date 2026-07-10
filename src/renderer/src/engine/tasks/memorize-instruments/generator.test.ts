import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import { formatReading, generate, score } from './generator'

describe('memorize-instruments generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 2)).toEqual(generate('s', 2))
  })

  it.each(DIFFICULTIES)('difficulty %i: gauge values are snapped and in range', (d) => {
    const s = generate('vals', d)
    for (const item of s.items) {
      for (const g of item.gauges) {
        expect(g.value).toBeGreaterThan(g.min)
        expect(g.value).toBeLessThan(g.max)
        expect((g.value - g.min) % g.step).toBe(0)
      }
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: queries reference distinct shown gauges', (d) => {
    const s = generate('queries', d)
    for (const item of s.items) {
      const indices = item.queries.map((q) => q.gaugeIndex)
      expect(new Set(indices).size).toBe(indices.length)
      for (const q of item.queries) {
        expect(q.gaugeIndex).toBeGreaterThanOrEqual(0)
        expect(q.gaugeIndex).toBeLessThan(item.gauges.length)
      }
    }
  })

  it('query options are unique and contain the true reading', () => {
    for (const d of DIFFICULTIES) {
      const s = generate('opts', d)
      for (const item of s.items) {
        for (const q of item.queries) {
          expect(q.options).toHaveLength(4)
          expect(new Set(q.options).size).toBe(4)
          const gauge = item.gauges[q.gaugeIndex]
          expect(q.options[q.correctIndex]).toBe(formatReading(gauge, gauge.value))
        }
      }
    }
  })

  it('gauge names within a panel are distinct', () => {
    const s = generate('names', 5)
    for (const item of s.items) {
      const names = item.gauges.map((g) => g.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe('memorize-instruments scorer', () => {
  it('scores flattened query responses', () => {
    const s = generate('sc', 2)
    const correct = s.items.flatMap((i) => i.queries.map((q) => q.correctIndex))
    const responses = correct.map((c) => ({ answerIndex: c, rtMs: 1500 }))
    const r = score(s, responses)
    expect(r.accuracy).toBe(1)
    expect(r.totalItems).toBe(correct.length)
  })
})
