import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import {
  BATTERY_SEGMENTS,
  COMPASS_POINTS,
  GAUGE_SEGMENTS,
  INSTRUMENT_POOL,
  formatReading,
  generate,
  score
} from './generator'

describe('memorize-instruments generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 2)).toEqual(generate('s', 2))
  })

  it.each(DIFFICULTIES)('difficulty %i: instrument values are snapped and in range', (d) => {
    const s = generate('vals', d)
    for (const item of s.items) {
      for (const inst of item.instruments) {
        expect(inst.value).toBeGreaterThanOrEqual(inst.min)
        expect(inst.value).toBeLessThanOrEqual(inst.max)
        expect((inst.value - inst.min) % inst.step).toBe(0)
        // only the compass may sit at a scale end (it reads all the way round)
        if (inst.kind !== 'compass') {
          expect(inst.value).toBeGreaterThan(inst.min)
          expect(inst.value).toBeLessThan(inst.max)
        }
      }
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: queries reference distinct shown instruments', (d) => {
    const s = generate('queries', d)
    for (const item of s.items) {
      const indices = item.queries.map((q) => q.instrumentIndex)
      expect(new Set(indices).size).toBe(indices.length)
      for (const q of item.queries) {
        expect(q.instrumentIndex).toBeGreaterThanOrEqual(0)
        expect(q.instrumentIndex).toBeLessThan(item.instruments.length)
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
          const inst = item.instruments[q.instrumentIndex]
          expect(q.options[q.correctIndex]).toBe(formatReading(inst, inst.value))
        }
      }
    }
  })

  it('instrument names within a panel are distinct', () => {
    const s = generate('names', 5)
    for (const item of s.items) {
      const names = item.instruments.map((i) => i.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('the hardest panels show every instrument kind', () => {
    const kinds = new Set(generate('kinds', 5).items.flatMap((i) => i.instruments.map((x) => x.kind)))
    expect(kinds.size).toBe(INSTRUMENT_POOL.length)
  })
})

describe('formatReading', () => {
  const spec = (kind: string) => INSTRUMENT_POOL.find((s) => s.kind === kind)!

  it('reads the compass as a named point and wraps past north', () => {
    expect(formatReading(spec('compass'), 0)).toBe('N')
    expect(formatReading(spec('compass'), 3)).toBe(COMPASS_POINTS[3])
    expect(formatReading(spec('compass'), -1)).toBe('NW') // one step back from N
    expect(formatReading(spec('compass'), 8)).toBe('N')
  })

  it('reads the clock as h:mm', () => {
    expect(formatReading(spec('clock'), 660)).toBe('11:00')
    expect(formatReading(spec('clock'), 90)).toBe('1:30')
  })

  it('reads segmented instruments as a count out of the total', () => {
    expect(formatReading(spec('battery'), 4)).toBe(`4 / ${BATTERY_SEGMENTS}`)
    expect(formatReading(spec('gauge'), 5)).toBe(`5 / ${GAUGE_SEGMENTS}`)
  })

  it('reads scaled instruments with their unit', () => {
    expect(formatReading(spec('thermometer'), 20)).toBe('20 °C')
    expect(formatReading(spec('speedlimit'), 110)).toBe('110 km/h')
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
