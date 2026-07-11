import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { SessionSaveRequest } from '@shared/results'
import { listSessions, openDatabase, saveSession } from './db'
import { exportData, importData, validateBundle } from './transfer'

function request(i: number, accuracy = 0.75): SessionSaveRequest {
  return {
    taskId: 'matching-figure',
    seed: `seed-${i}`,
    difficulty: 2,
    startedAt: 1_700_000_000_000 + i * 1000,
    durationMs: 60_000,
    timingPreset: 'realistic',
    result: {
      taskId: 'matching-figure',
      totalItems: 4,
      correct: 3,
      accuracy,
      meanRtMs: 900,
      items: [
        { index: 0, correct: true, rtMs: 800, timedOut: false },
        { index: 1, correct: false, rtMs: 950, timedOut: false }
      ],
      extra: { falseAlarms: 1 }
    }
  }
}

describe('export/import round-trip', () => {
  it('exports sessions with items and settings', () => {
    const db = openDatabase(':memory:')
    saveSession(db, request(1))
    saveSession(db, request(2))
    const bundle = exportData(db, DEFAULT_SETTINGS)
    expect(bundle.app).toBe('vectormind')
    expect(bundle.sessions).toHaveLength(2)
    expect(bundle.sessions[0].items).toHaveLength(2)
    expect(bundle.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('imports into an empty database and rebuilds skill state', () => {
    const src = openDatabase(':memory:')
    saveSession(src, request(1, 0.5))
    saveSession(src, request(2, 1.0))
    const bundle = exportData(src, null)

    const dst = openDatabase(':memory:')
    const summary = importData(dst, bundle)
    expect(summary.imported).toBe(2)
    expect(summary.skipped).toBe(0)

    const sessions = listSessions(dst)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].extra).toEqual({ falseAlarms: 1 })

    const skill = dst
      .prepare('SELECT rating, sessions_count FROM skill_state WHERE task_id = ?')
      .get('matching-figure') as { rating: number; sessions_count: number }
    expect(skill.sessions_count).toBe(2)
    expect(skill.rating).toBeCloseTo(0.75)

    const items = dst.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }
    expect(items.n).toBe(4)
  })

  it('re-import skips duplicates', () => {
    const db = openDatabase(':memory:')
    saveSession(db, request(1))
    const bundle = exportData(db, null)
    const summary = importData(db, bundle)
    expect(summary.imported).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(listSessions(db)).toHaveLength(1)
  })

  it('skips malformed session entries', () => {
    const db = openDatabase(':memory:')
    const bundle = exportData(db, null)
    bundle.sessions.push({ nonsense: true } as never)
    const summary = importData(db, bundle)
    expect(summary.imported).toBe(0)
    expect(summary.skipped).toBe(1)
  })
})

describe('validateBundle', () => {
  it('accepts real bundles and rejects junk', () => {
    const db = openDatabase(':memory:')
    expect(validateBundle(exportData(db, null))).toBe(true)
    expect(validateBundle(null)).toBe(false)
    expect(validateBundle({ app: 'other', formatVersion: 1, sessions: [] })).toBe(false)
    expect(validateBundle({ app: 'vectormind', formatVersion: 2, sessions: [] })).toBe(false)
    expect(validateBundle({ app: 'vectormind', formatVersion: 1 })).toBe(false)
  })
})
