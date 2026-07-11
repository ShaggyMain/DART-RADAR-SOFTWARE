import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '@shared/types'
import { TEMPLATES, generate, score } from './generator'

describe('english-listening generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it('different seeds fill different content', () => {
    expect(JSON.stringify(generate('a', 2))).not.toBe(JSON.stringify(generate('b', 2)))
  })

  it.each(DIFFICULTIES)('difficulty %i: every slot is filled, no braces remain', (d) => {
    const s = generate('slots', d)
    for (const item of s.items) {
      expect(item.text).not.toMatch(/[{}]/)
      for (const value of Object.values(item.slotValues)) {
        expect(item.text).toContain(value)
      }
    }
  })

  it.each(DIFFICULTIES)('difficulty %i: passages are distinct templates', (d) => {
    const s = generate('templates', d)
    const ids = s.items.map((i) => i.templateId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('questions have 4 unique options with the slot value correct', () => {
    for (const d of DIFFICULTIES) {
      const s = generate('opts', d)
      for (const item of s.items) {
        for (const q of item.questions) {
          expect(q.options).toHaveLength(4)
          expect(new Set(q.options).size).toBe(4)
          expect(q.options[q.correctIndex]).toBe(item.slotValues[q.slot])
        }
      }
    }
  })

  it('distractors never collide with other passage values from the same pool', () => {
    // e.g. the OLD gate must never appear as a distractor for the NEW gate.
    // (Cross-pool string coincidences — "4 km" vs "every 4 hours" — are
    // fine: the prompt names the unit, so the answer stays unambiguous.)
    for (const seed of ['x', 'y', 'z']) {
      const s = generate(seed, 3)
      for (const item of s.items) {
        const template = TEMPLATES.find((t) => t.id === item.templateId)!
        for (const q of item.questions) {
          const pool = template.slots[q.slot]
          const samePoolValues = new Set(
            Object.entries(item.slotValues)
              .filter(([slot]) => template.slots[slot] === pool)
              .map(([, value]) => value)
          )
          for (const [idx, opt] of q.options.entries()) {
            if (idx === q.correctIndex) continue
            expect(samePoolValues.has(opt)).toBe(false)
          }
        }
      }
    }
  })

  it('question count and replays follow the difficulty config', () => {
    const s1 = generate('cfg', 1)
    expect(s1.items).toHaveLength(4)
    for (const item of s1.items) {
      expect(item.questions).toHaveLength(2)
      expect(item.replaysAllowed).toBe(1)
    }
    const s5 = generate('cfg', 5)
    expect(s5.items).toHaveLength(5)
    for (const item of s5.items) {
      expect(item.questions.length).toBeGreaterThanOrEqual(3)
      expect(item.replaysAllowed).toBe(0)
      expect(item.rate).toBeGreaterThan(1)
    }
  })
})

describe('english-listening scorer', () => {
  it('scores flattened question responses', () => {
    const s = generate('sc', 2)
    const correct = s.items.flatMap((i) => i.questions.map((q) => q.correctIndex))
    const r = score(s, correct.map((c) => ({ answerIndex: c, rtMs: 3000 })))
    expect(r.accuracy).toBe(1)
    expect(r.totalItems).toBe(correct.length)
  })
})
