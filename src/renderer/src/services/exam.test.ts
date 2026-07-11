import { describe, expect, it } from 'vitest'
import type { TaskResult } from '@shared/types'
import { BLUEPRINTS, moduleStanine, overallStanine } from './exam'
import { TASKS_BY_ID } from '../engine/tasks/registry'

function result(accuracy: number): TaskResult {
  return {
    taskId: 'matching-figure',
    totalItems: 10,
    correct: Math.round(accuracy * 10),
    accuracy,
    meanRtMs: 1000,
    items: []
  }
}

describe('exam blueprints', () => {
  it('reference only registered task ids', () => {
    for (const bp of BLUEPRINTS) {
      for (const block of bp.blocks) {
        for (const taskId of block.modules) {
          expect(TASKS_BY_ID.has(taskId)).toBe(true)
        }
      }
    }
  })

  it('short exam is a strict subset in size', () => {
    const count = (id: 'short' | 'full'): number =>
      BLUEPRINTS.find((b) => b.id === id)!.blocks.reduce((n, bl) => n + bl.modules.length, 0)
    expect(count('short')).toBeLessThan(count('full'))
  })
})

describe('moduleStanine', () => {
  it('uses the default practice reference with thin history', () => {
    const m = moduleStanine({
      taskId: 'matching-figure',
      result: result(0.7),
      save: { sessionId: 1, attempts: 2, percentile: 100 } // only 1 prior run
    })
    expect(m.personalReference).toBe(false)
    // 0.7 == default mu → 50th percentile → stanine 5
    expect(m.percentile).toBeCloseTo(50, 1)
    expect(m.stanine).toBe(5)
  })

  it('uses personal history when there are enough prior runs', () => {
    const m = moduleStanine({
      taskId: 'matching-figure',
      result: result(0.9),
      save: { sessionId: 1, attempts: 8, percentile: 90 }
    })
    expect(m.personalReference).toBe(true)
    expect(m.percentile).toBe(90)
    expect(m.stanine).toBe(8)
  })

  it('falls back to the default reference with no save at all', () => {
    const m = moduleStanine({ taskId: 'matching-figure', result: result(0.99), save: null })
    expect(m.personalReference).toBe(false)
    expect(m.stanine).toBeGreaterThanOrEqual(8)
  })
})

describe('overallStanine', () => {
  it('rounds the mean and clamps to 1..9', () => {
    const mk = (stanine: number): ReturnType<typeof moduleStanine> => ({
      taskId: 'matching-figure',
      accuracy: 0.5,
      percentile: 50,
      stanine,
      personalReference: false
    })
    expect(overallStanine([mk(4), mk(5)])).toBe(5)
    expect(overallStanine([mk(9), mk(9)])).toBe(9)
    expect(overallStanine([])).toBe(1)
  })
})
