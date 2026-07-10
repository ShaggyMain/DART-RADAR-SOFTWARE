import { describe, expect, it } from 'vitest'
import { glyphKey } from '@shared/glyphs'
import { DIFFICULTIES } from '@shared/types'
import { generate, isMatch, score } from './generator'

describe('matching-figure generator', () => {
  it('same seed + difficulty => identical scenario', () => {
    expect(generate('s1', 3)).toEqual(generate('s1', 3))
  })

  it('different seeds => different scenarios', () => {
    expect(JSON.stringify(generate('a', 2))).not.toBe(JSON.stringify(generate('b', 2)))
  })

  it.each(DIFFICULTIES)('difficulty %i: exactly one option matches the rule', (d) => {
    const s = generate('validity', d)
    for (const item of s.items) {
      const matches = item.options.filter((o) => isMatch(item.reference, o, item.rotationsAllowed))
      expect(matches).toHaveLength(1)
      expect(isMatch(item.reference, item.options[item.correctIndex], item.rotationsAllowed)).toBe(
        true
      )
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: options are pairwise distinct', (d) => {
    const s = generate('unique', d)
    for (const item of s.items) {
      const keys = item.options.map(glyphKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('has positive time limits and valid correct indices', () => {
    const s = generate('sanity', 4)
    for (const item of s.items) {
      expect(item.timeLimitMs).toBeGreaterThan(0)
      expect(item.correctIndex).toBeGreaterThanOrEqual(0)
      expect(item.correctIndex).toBeLessThan(item.options.length)
    }
  })
})

describe('matching-figure scorer', () => {
  it('scores perfect and imperfect runs', () => {
    const s = generate('score', 1)
    const perfect = s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 900 }))
    expect(score(s, perfect).accuracy).toBe(1)

    const oneWrong = perfect.slice()
    oneWrong[0] = { answerIndex: (s.items[0].correctIndex + 1) % s.items[0].options.length, rtMs: 900 }
    expect(score(s, oneWrong).correct).toBe(s.items.length - 1)
  })
})
