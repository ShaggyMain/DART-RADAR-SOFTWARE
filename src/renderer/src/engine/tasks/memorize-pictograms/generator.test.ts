import { describe, expect, it } from 'vitest'
import { glyphKey } from '@shared/glyphs'
import { DIFFICULTIES } from '@shared/types'
import { generate, score } from './generator'

describe('memorize-pictograms generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 4)).toEqual(generate('s', 4))
  })

  it.each(DIFFICULTIES)('difficulty %i: study set glyphs are distinct', (d) => {
    const s = generate('study', d)
    for (const item of s.items) {
      const keys = item.studySet.map(glyphKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('each recognition round has the target once, distractors not in study set', () => {
    for (const d of DIFFICULTIES) {
      const s = generate('rec', d)
      for (const item of s.items) {
        const studyKeys = new Set(item.studySet.map(glyphKey))
        expect(item.recognitionRounds).toHaveLength(item.studySet.length)
        for (const round of item.recognitionRounds) {
          const keys = round.options.map(glyphKey)
          expect(new Set(keys).size).toBe(keys.length)
          const inStudy = keys.filter((k) => studyKeys.has(k))
          expect(inStudy).toHaveLength(1)
          expect(keys[round.correctIndex]).toBe(inStudy[0])
        }
      }
    }
  })

  it('math questions compute correctly and never go negative', () => {
    const s = generate('math', 3)
    for (const item of s.items) {
      for (const q of item.mathQuestions) {
        const m = q.prompt.match(/^(\d+) ([+−]) (\d+) = \?$/)
        expect(m).not.toBeNull()
        const [, a, op, b] = m!
        const expected = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b)
        expect(expected).toBeGreaterThanOrEqual(0)
        expect(q.options[q.correctIndex]).toBe(String(expected))
        expect(new Set(q.options).size).toBe(4)
      }
    }
  })
})

describe('memorize-pictograms scorer', () => {
  it('scores recognition as primary and math as extra', () => {
    const s = generate('sc', 2)
    const recognition = s.items
      .flatMap((i) => i.recognitionRounds)
      .map((r) => ({ answerIndex: r.correctIndex, rtMs: 1200 }))
    const mathQs = s.items.flatMap((i) => i.mathQuestions)
    // answer half the math questions wrong
    const math = mathQs.map((q, idx) => ({
      answerIndex: idx % 2 === 0 ? q.correctIndex : (q.correctIndex + 1) % 4,
      rtMs: 1500
    }))
    const r = score(s, { math, recognition })
    expect(r.accuracy).toBe(1)
    expect(r.totalItems).toBe(recognition.length)
    expect(r.extra?.mathAccuracy).toBeCloseTo(
      math.filter((_, idx) => idx % 2 === 0).length / math.length
    )
  })

  it('treats missing recognition responses as timeouts', () => {
    const s = generate('sc2', 1)
    const r = score(s, { math: [], recognition: [] })
    expect(r.accuracy).toBe(0)
    expect(r.items.every((i) => i.timedOut)).toBe(true)
  })
})
