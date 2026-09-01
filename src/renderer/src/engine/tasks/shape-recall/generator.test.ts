import { describe, expect, it } from 'vitest'
import { Rng } from '@shared/rng'
import { DIFFICULTIES } from '@shared/types'
import {
  generate,
  mutateShape,
  sameShape,
  score,
  shapeKey,
  type RecallAnswer,
  type RecallShape
} from './generator'

const base: RecallShape = { outer: 'circle', diagonal: 'tlbr', chord: 'none', dots: [0, 3] }

describe('shape features', () => {
  it('keys equal shapes the same and different shapes differently', () => {
    expect(shapeKey(base)).toBe(shapeKey({ ...base, dots: [0, 3] }))
    expect(sameShape(base, { ...base, outer: 'square' })).toBe(false)
    expect(sameShape(base, { ...base, dots: [1, 2] })).toBe(false)
  })

  it('a mutation changes exactly one feature', () => {
    const rng = new Rng('mutate')
    for (let i = 0; i < 200; i++) {
      const m = mutateShape(rng, base)
      expect(sameShape(m, base)).toBe(false)
      const changed = [
        m.outer !== base.outer,
        m.diagonal !== base.diagonal,
        m.chord !== base.chord,
        m.dots.join(',') !== base.dots.join(',')
      ].filter(Boolean).length
      expect(changed).toBe(1)
    }
  })
})

describe('shape-recall generator', () => {
  it('is deterministic', () => {
    expect(generate('s', 3)).toEqual(generate('s', 3))
  })

  it.each(DIFFICULTIES)('difficulty %i: rounds are well formed', (d) => {
    const s = generate('rounds', d)
    expect(s.rounds.length).toBeGreaterThan(0)
    for (const round of s.rounds) {
      // every studied shape appears in the grid exactly once, marked as a target
      expect(round.grid.filter((c) => c.target)).toHaveLength(round.study.length)
      for (const studied of round.study) {
        const hits = round.grid.filter((c) => sameShape(c.shape, studied))
        expect(hits).toHaveLength(1)
        expect(hits[0].target).toBe(true)
      }
      // no duplicate figures anywhere in the grid
      const keys = round.grid.map((c) => shapeKey(c.shape))
      expect(new Set(keys).size).toBe(keys.length)
      // distractors are never a studied shape
      for (const cell of round.grid.filter((c) => !c.target)) {
        expect(round.study.some((s2) => sameShape(s2, cell.shape))).toBe(false)
      }
      // dots stay inside the four slots
      for (const cell of round.grid) {
        expect(cell.shape.dots.length).toBeGreaterThanOrEqual(1)
        expect(cell.shape.dots.length).toBeLessThanOrEqual(2)
        for (const slot of cell.shape.dots) expect([0, 1, 2, 3]).toContain(slot)
      }
      // calculations are answerable
      for (const calc of round.calcs) {
        expect(calc.options).toHaveLength(4)
        expect(new Set(calc.options).size).toBe(4)
        expect(calc.correctIndex).toBeGreaterThanOrEqual(0)
        const [a, op, b] = calc.text.split(' ')
        const expected = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b)
        expect(calc.options[calc.correctIndex]).toBe(expected)
      }
    }
  })

  it('harder levels study more shapes in a bigger grid', () => {
    const easy = generate('x', 1).rounds[0]
    const hard = generate('x', 5).rounds[0]
    expect(hard.study.length).toBeGreaterThan(easy.study.length)
    expect(hard.grid.length).toBeGreaterThan(easy.grid.length)
    expect(hard.studyMs).toBeLessThan(easy.studyMs)
  })
})

describe('shape-recall scorer', () => {
  const scenario = generate('sc', 1)

  function perfectAnswers(): RecallAnswer[] {
    const out: RecallAnswer[] = []
    scenario.rounds.forEach((round, r) => {
      round.calcs.forEach((c, i) =>
        out.push({ type: 'calc', round: r, index: i, answerIndex: c.correctIndex, rtMs: 800 })
      )
      round.grid.forEach((cell, i) =>
        out.push({ type: 'grid', round: r, index: i, selected: cell.target, rtMs: 4000 })
      )
    })
    return out
  }

  it('scores a perfect run as 100%', () => {
    const r = score(scenario, perfectAnswers())
    expect(r.accuracy).toBe(1)
    expect(r.extra?.recallAccuracy).toBe(1)
    expect(r.extra?.mathAccuracy).toBe(1)
    expect(r.extra?.falseAlarms).toBe(0)
  })

  it('counts selecting a distractor as a false alarm', () => {
    const answers = perfectAnswers().map((a) =>
      a.type === 'grid' && a.round === 0 && !scenario.rounds[0].grid[a.index].target
        ? { ...a, selected: true }
        : a
    )
    const r = score(scenario, answers)
    const distractors = scenario.rounds[0].grid.filter((c) => !c.target).length
    expect(r.extra?.falseAlarms).toBe(distractors)
    expect(r.extra?.recallAccuracy).toBeLessThan(1)
    expect(r.extra?.mathAccuracy).toBe(1)
  })

  it('missing answers count as misses, never as credit', () => {
    const r = score(scenario, [])
    const targets = scenario.rounds.reduce((n, x) => n + x.study.length, 0)
    const calcs = scenario.rounds.reduce((n, x) => n + x.calcs.length, 0)
    // leaving every cell unselected is still right for the distractors
    expect(r.correct).toBe(r.totalItems - targets - calcs)
    expect(r.extra?.falseAlarms).toBe(0)
  })
})
