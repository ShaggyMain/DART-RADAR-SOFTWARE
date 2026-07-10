import { describe, expect, it } from 'vitest'
import { glyphKey } from '@shared/glyphs'
import { DIFFICULTIES } from '@shared/types'
import { generate, score } from './generator'

describe('rule-application generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: digits and glyphs are distinct within a phase', (d) => {
    const s = generate('distinct', d)
    for (const phase of s.phases) {
      const digits = phase.mapping.map((p) => p.digit)
      expect(new Set(digits).size).toBe(digits.length)
      const keys = phase.mapping.map((p) => glyphKey(p.glyph))
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('each item’s correct option equals the current phase mapping', () => {
    const s = generate('mapping', 4)
    for (const item of s.items) {
      const phase = s.phases[item.phaseIndex]
      const expected = phase.mapping[item.pairIndex].digit
      expect(item.options[item.correctIndex]).toBe(expected)
      expect(item.options.filter((o) => o === expected)).toHaveLength(1)
      expect(new Set(item.options).size).toBe(item.options.length)
    }
  })

  it('rule changes actually change at least half the pairs', () => {
    const s = generate('change', 5)
    for (let p = 1; p < s.phases.length; p++) {
      const prev = s.phases[p - 1].mapping.map((m) => m.digit)
      const cur = s.phases[p].mapping.map((m) => m.digit)
      const changed = cur.filter((d, i) => d !== prev[i]).length
      expect(changed).toBeGreaterThanOrEqual(Math.ceil(prev.length / 2))
    }
  })

  it('marks the first item of each later phase', () => {
    const s = generate('banner', 3)
    for (const phase of s.phases.slice(1)) {
      expect(s.items[phase.startIndex].isPhaseStart).toBe(true)
    }
    expect(s.items[0].isPhaseStart).toBe(false)
  })

  it('difficulty 1 has a single phase', () => {
    expect(generate('single', 1).phases).toHaveLength(1)
  })
})

describe('rule-application scorer', () => {
  it('computes post-change adaptation accuracy', () => {
    const s = generate('adapt', 2)
    // answer everything correctly except the first item after the change
    const responses = s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 800 }))
    const changeAt = s.phases[1].startIndex
    responses[changeAt] = {
      answerIndex: (s.items[changeAt].correctIndex + 1) % s.items[changeAt].options.length,
      rtMs: 800
    }
    const r = score(s, responses)
    expect(r.extra?.postChangeAccuracy).toBeCloseTo(2 / 3)
  })

  it('omits adaptation metric for single-phase runs', () => {
    const s = generate('single', 1)
    const r = score(s, s.items.map((i) => ({ answerIndex: i.correctIndex, rtMs: 500 })))
    expect(r.extra).toBeUndefined()
  })
})
