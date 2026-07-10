import { describe, expect, it } from 'vitest'
import { glyphsEqual } from '@shared/glyphs'
import { DIFFICULTIES } from '@shared/types'
import { generate, score, type MAEvent } from './generator'

describe('multi-attention generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: match flag agrees with glyph equality', (d) => {
    const s = generate('match', d)
    for (const stim of s.shapes) {
      expect(glyphsEqual(stim.left, stim.right)).toBe(stim.match)
    }
  })

  it('equation truth flag agrees with the arithmetic', () => {
    const s = generate('math', 4)
    for (const stim of s.equations) {
      const m = stim.text.match(/^(\d+) ([+−]) (\d+) = (\d+)$/)
      expect(m).not.toBeNull()
      const [, a, op, b, shown] = m!
      const actual = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b)
      expect(actual === Number(shown)).toBe(stim.isTrue)
    }
  })

  it('difficulty 1 has no beeps; higher difficulties do', () => {
    expect(generate('b', 1).beeps).toHaveLength(0)
    expect(generate('b', 3).beeps.length).toBeGreaterThan(0)
  })

  it('stimuli fit within the run duration', () => {
    const s = generate('fit', 5)
    for (const stim of [...s.shapes, ...s.equations]) {
      expect(stim.tMs + stim.durationMs).toBeLessThanOrEqual(s.durationMs)
    }
    for (const beep of s.beeps) {
      expect(beep.tMs + s.beepWindowMs).toBeLessThanOrEqual(s.durationMs)
    }
  })
})

describe('multi-attention scorer', () => {
  it('scores a perfect run', () => {
    const s = generate('perfect', 2)
    const events: MAEvent[] = []
    for (const stim of s.shapes) {
      if (stim.match) events.push({ tMs: stim.tMs + 500, key: 'match' })
    }
    for (const stim of s.equations) {
      events.push({ tMs: stim.tMs + 700, key: stim.isTrue ? 'true' : 'false' })
    }
    for (const beep of s.beeps) {
      events.push({ tMs: beep.tMs + 400, key: 'beep' })
    }
    const r = score(s, events)
    expect(r.accuracy).toBe(1)
    expect(r.extra?.shapeAccuracy).toBe(1)
    expect(r.extra?.mathAccuracy).toBe(1)
    expect(r.extra?.soundAccuracy).toBe(1)
    expect(r.extra?.falseAlarms).toBe(0)
  })

  it('non-match shape pairs are correct-rejections when unanswered', () => {
    const s = generate('cr', 1)
    const r = score(s, [])
    const nonMatches = s.shapes.filter((x) => !x.match).length
    const shapeItems = r.items.slice(0, s.shapes.length)
    expect(shapeItems.filter((i) => i.correct)).toHaveLength(nonMatches)
    // equations unanswered = timeouts
    const eqItems = r.items.slice(s.shapes.length, s.shapes.length + s.equations.length)
    expect(eqItems.every((i) => i.timedOut)).toBe(true)
  })

  it('wrong equation key is incorrect; stray beep press is a false alarm', () => {
    const s = generate('mixed', 2)
    const eq = s.equations[0]
    const events: MAEvent[] = [
      { tMs: eq.tMs + 300, key: eq.isTrue ? 'false' : 'true' },
      { tMs: 100, key: 'beep' } // long before any beep
    ]
    const r = score(s, events)
    const eqItem = r.items[s.shapes.length]
    expect(eqItem.correct).toBe(false)
    expect(eqItem.timedOut).toBe(false)
    expect(r.extra?.falseAlarms).toBe(1)
  })
})
