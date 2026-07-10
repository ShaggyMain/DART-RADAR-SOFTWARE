import { describe, expect, it } from 'vitest'
import { formatNumber, numberToWords } from '@shared/numberWords'
import { DIFFICULTIES } from '@shared/types'
import { generate, score } from './generator'

describe('big-numbers generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: numbers have the configured digit count', (d) => {
    const s = generate('digits', d)
    const ranges: Record<number, [number, number]> = {
      1: [4, 4],
      2: [5, 5],
      3: [6, 6],
      4: [6, 7],
      5: [7, 7]
    }
    const [lo, hi] = ranges[d]
    for (const item of s.items) {
      const len = String(item.number).length
      expect(len).toBeGreaterThanOrEqual(lo)
      expect(len).toBeLessThanOrEqual(hi)
    }
  })

  it('options are distinct and include the exact number once', () => {
    for (const d of DIFFICULTIES) {
      const s = generate('opts', d)
      for (const item of s.items) {
        expect(item.options).toHaveLength(4)
        expect(new Set(item.options).size).toBe(4)
        expect(item.options[item.correctIndex]).toBe(formatNumber(item.number))
        expect(item.options.filter((o) => o === formatNumber(item.number))).toHaveLength(1)
      }
    }
  })

  it('spoken text contains the number in words', () => {
    const s = generate('spoken', 4)
    for (const item of s.items) {
      expect(item.spokenText).toContain(numberToWords(item.number))
    }
  })
})

describe('big-numbers scorer', () => {
  it('scores exact matches', () => {
    const s = generate('sc', 1)
    const responses = s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 2500 }))
    expect(score(s, responses).accuracy).toBe(1)
  })
})
