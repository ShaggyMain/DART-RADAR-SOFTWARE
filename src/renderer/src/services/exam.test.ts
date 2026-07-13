import { describe, expect, it } from 'vitest'
import type { TaskId, TaskResult } from '@shared/types'
import { EXAM_POOLS, FULL_EXAM, buildShortExam, moduleStanine, overallStanine } from './exam'
import { TASKS_BY_ID } from '../engine/tasks/registry'

const modulesOf = (bp: { blocks: { modules: TaskId[] }[] }): TaskId[] =>
  bp.blocks.flatMap((b) => b.modules)

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
  it('all pools and the full exam reference only registered task ids', () => {
    const all = [...Object.values(EXAM_POOLS).flat(), ...modulesOf(FULL_EXAM), 'planning', 'english-listening']
    for (const taskId of all as TaskId[]) {
      expect(TASKS_BY_ID.has(taskId)).toBe(true)
    }
  })

  it('pools match their registered categories', () => {
    const catOf = (id: TaskId): string | undefined => TASKS_BY_ID.get(id)?.category
    for (const id of EXAM_POOLS.attention) expect(catOf(id)).toBe('attention')
    for (const id of EXAM_POOLS.memory) expect(catOf(id)).toBe('memory')
    for (const id of EXAM_POOLS.spatial) expect(catOf(id)).toBe('spatial')
    for (const id of EXAM_POOLS.simulation) expect(catOf(id)).toBe('simulation')
  })

  it('short exam has six modules covering every required area', () => {
    // deterministic pick = first of each pool
    const bp = buildShortExam((arr) => arr[0])
    const mods = modulesOf(bp)
    expect(mods).toHaveLength(6)
    expect(mods).toContain('planning') // Landing Sequence
    expect(mods).toContain('english-listening')
    expect(EXAM_POOLS.attention).toContain(mods.find((m) => EXAM_POOLS.attention.includes(m))!)
    expect(EXAM_POOLS.memory).toContain(mods.find((m) => EXAM_POOLS.memory.includes(m))!)
    expect(EXAM_POOLS.spatial).toContain(mods.find((m) => EXAM_POOLS.spatial.includes(m))!)
    expect(EXAM_POOLS.simulation).toContain(mods.find((m) => EXAM_POOLS.simulation.includes(m))!)
  })

  it('short exam varies its picks across runs', () => {
    // Default random picker: many builds must not all be identical.
    const combos = new Set(Array.from({ length: 40 }, () => modulesOf(buildShortExam()).join(',')))
    expect(combos.size).toBeGreaterThan(1)
  })

  it('short exam is smaller than the full exam', () => {
    expect(modulesOf(buildShortExam((arr) => arr[0])).length).toBeLessThan(modulesOf(FULL_EXAM).length)
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
