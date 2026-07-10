import { describe, expect, it } from 'vitest'
import { distance, headingDeg, signedTurn } from '@shared/geometry'
import { DIFFICULTIES } from '@shared/types'
import {
  formatDistance,
  formatHeading,
  formatTurn,
  generate,
  score
} from './generator'

describe('coordinate-system generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 2)).toEqual(generate('s', 2))
  })

  it.each(DIFFICULTIES)('difficulty %i: stored answer matches recomputed ground truth', (d) => {
    const s = generate('truth', d)
    for (const item of s.items) {
      if (item.kind === 'distance') {
        expect(item.answerValue).toBeCloseTo(Math.round(distance(item.a, item.b) * 10) / 10)
        expect(item.options[item.correctIndex]).toBe(formatDistance(item.answerValue))
      } else if (item.kind === 'heading') {
        expect(item.answerValue).toBe(Math.round(headingDeg(item.a, item.b)))
        expect(item.options[item.correctIndex]).toBe(formatHeading(item.answerValue))
      } else {
        expect(item.currentHeading).not.toBeNull()
        expect(item.answerValue).toBe(
          Math.round(signedTurn(item.currentHeading!, headingDeg(item.a, item.b)))
        )
        expect(item.options[item.correctIndex]).toBe(formatTurn(item.answerValue))
        // no ambiguous straight-ahead or reversal turns
        expect(Math.abs(item.answerValue)).toBeGreaterThanOrEqual(10)
        expect(Math.abs(item.answerValue)).toBeLessThanOrEqual(170)
      }
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: options unique, 4 per item', (d) => {
    const s = generate('opts', d)
    for (const item of s.items) {
      expect(item.options).toHaveLength(4)
      expect(new Set(item.options).size).toBe(4)
    }
  })

  it('mixes all three kinds', () => {
    const s = generate('kinds', 3)
    expect(new Set(s.items.map((i) => i.kind))).toEqual(
      new Set(['distance', 'heading', 'rotation'])
    )
  })
})

describe('coordinate-system scorer', () => {
  it('scores correct answers', () => {
    const s = generate('sc', 1)
    const responses = s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 2000 }))
    expect(score(s, responses).accuracy).toBe(1)
  })
})

describe('formatters', () => {
  it('formats headings as 3-digit compass values', () => {
    expect(formatHeading(5)).toBe('005°')
    expect(formatHeading(270)).toBe('270°')
  })

  it('formats turns with direction', () => {
    expect(formatTurn(40)).toBe('Right 40°')
    expect(formatTurn(-115)).toBe('Left 115°')
  })
})
