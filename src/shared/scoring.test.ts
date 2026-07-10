import { describe, expect, it } from 'vitest'
import { buildResult, scoreMultipleChoice } from './scoring'
import type { ItemResponse } from './types'

describe('scoreMultipleChoice', () => {
  const correct = [0, 2, 1, 3]

  it('scores all-correct responses', () => {
    const responses: ItemResponse[] = correct.map((c) => ({ answerIndex: c, rtMs: 500 }))
    const r = scoreMultipleChoice('matching-figure', correct, responses)
    expect(r.correct).toBe(4)
    expect(r.accuracy).toBe(1)
    expect(r.meanRtMs).toBe(500)
    expect(r.items.every((i) => i.correct && !i.timedOut)).toBe(true)
  })

  it('scores mixed responses with timeouts', () => {
    const responses: ItemResponse[] = [
      { answerIndex: 0, rtMs: 400 }, // correct
      { answerIndex: 0, rtMs: 600 }, // wrong
      { answerIndex: null, rtMs: 3000 }, // timeout
      { answerIndex: 3, rtMs: 800 } // correct
    ]
    const r = scoreMultipleChoice('matching-figure', correct, responses)
    expect(r.correct).toBe(2)
    expect(r.accuracy).toBe(0.5)
    expect(r.items[2].timedOut).toBe(true)
    // mean RT only over answered items
    expect(r.meanRtMs).toBe((400 + 600 + 800) / 3)
  })

  it('treats missing responses as timed-out misses', () => {
    const r = scoreMultipleChoice('matching-figure', correct, [{ answerIndex: 0, rtMs: 300 }])
    expect(r.totalItems).toBe(4)
    expect(r.correct).toBe(1)
    expect(r.items[1].timedOut).toBe(true)
    expect(r.items[3].timedOut).toBe(true)
  })
})

describe('buildResult', () => {
  it('returns null meanRt when nothing was answered', () => {
    const r = buildResult('cube-folding', [
      { index: 0, correct: false, rtMs: 0, timedOut: true }
    ])
    expect(r.meanRtMs).toBeNull()
    expect(r.accuracy).toBe(0)
  })

  it('passes through extra metrics', () => {
    const r = buildResult('vigilance', [], { falseAlarms: 3 })
    expect(r.extra).toEqual({ falseAlarms: 3 })
  })
})
