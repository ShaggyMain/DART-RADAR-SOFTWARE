import { describe, expect, it } from 'vitest'
import type { SessionSaveRequest } from '@shared/results'
import { getOverview, listSessions, openDatabase, saveSession } from './db'

function makeRequest(overrides: Partial<SessionSaveRequest> = {}): SessionSaveRequest {
  return {
    taskId: 'matching-figure',
    seed: 'seed-1',
    difficulty: 2,
    startedAt: 1_700_000_000_000,
    durationMs: 60_000,
    timingPreset: 'realistic',
    result: {
      taskId: 'matching-figure',
      totalItems: 4,
      correct: 3,
      accuracy: 0.75,
      meanRtMs: 900,
      items: [
        { index: 0, correct: true, rtMs: 800, timedOut: false },
        { index: 1, correct: true, rtMs: 850, timedOut: false },
        { index: 2, correct: false, rtMs: 1000, timedOut: false },
        { index: 3, correct: true, rtMs: 950, timedOut: false }
      ],
      extra: { falseAlarms: 1 }
    },
    ...overrides
  }
}

describe('storage', () => {
  it('creates schema and default profile on open', () => {
    const db = openDatabase(':memory:')
    const profile = db.prepare('SELECT * FROM profiles WHERE id = 1').get() as {
      name: string
    }
    expect(profile.name).toBe('Default')
  })

  it('saves a session with items and reads it back', () => {
    const db = openDatabase(':memory:')
    const outcome = saveSession(db, makeRequest())
    expect(outcome.sessionId).toBeGreaterThan(0)
    expect(outcome.attempts).toBe(1)
    expect(outcome.percentile).toBeNull() // no history yet

    const sessions = listSessions(db)
    expect(sessions).toHaveLength(1)
    const s = sessions[0]
    expect(s.taskId).toBe('matching-figure')
    expect(s.accuracy).toBe(0.75)
    expect(s.extra).toEqual({ falseAlarms: 1 })

    const items = db.prepare('SELECT * FROM items WHERE session_id = ?').all(s.id)
    expect(items).toHaveLength(4)
  })

  it('computes percentile against prior runs at same task+difficulty', () => {
    const db = openDatabase(':memory:')
    for (const [i, acc] of [0.2, 0.4, 0.6, 0.8].entries()) {
      saveSession(
        db,
        makeRequest({
          startedAt: 1_700_000_000_000 + i,
          result: { ...makeRequest().result, accuracy: acc }
        })
      )
    }
    const outcome = saveSession(
      db,
      makeRequest({
        startedAt: 1_700_000_100_000,
        result: { ...makeRequest().result, accuracy: 0.9 }
      })
    )
    expect(outcome.attempts).toBe(5)
    expect(outcome.percentile).toBe(100)

    // different difficulty = separate history
    const other = saveSession(db, makeRequest({ difficulty: 5 }))
    expect(other.attempts).toBe(1)
    expect(other.percentile).toBeNull()
  })

  it('filters listSessions by task and honors limit', () => {
    const db = openDatabase(':memory:')
    saveSession(db, makeRequest())
    saveSession(db, makeRequest({ taskId: 'planning', startedAt: 1_700_000_000_001 }))
    saveSession(db, makeRequest({ startedAt: 1_700_000_000_002 }))

    expect(listSessions(db, { taskId: 'planning' })).toHaveLength(1)
    expect(listSessions(db, { taskId: 'matching-figure' })).toHaveLength(2)
    expect(listSessions(db, { limit: 2 })).toHaveLength(2)
    // newest first
    const all = listSessions(db)
    expect(all[0].startedAt).toBeGreaterThan(all[1].startedAt)
  })

  it('updates skill state with a rolling rating', () => {
    const db = openDatabase(':memory:')
    saveSession(db, makeRequest({ result: { ...makeRequest().result, accuracy: 0.5 } }))
    saveSession(
      db,
      makeRequest({
        startedAt: 1_700_000_000_001,
        result: { ...makeRequest().result, accuracy: 1.0 }
      })
    )
    const state = db
      .prepare('SELECT * FROM skill_state WHERE task_id = ?')
      .get('matching-figure') as { rating: number; sessions_count: number }
    expect(state.sessions_count).toBe(2)
    expect(state.rating).toBeCloseTo(0.75)
  })

  it('aggregates overview stats', () => {
    const db = openDatabase(':memory:')
    expect(getOverview(db).totalSessions).toBe(0)
    expect(getOverview(db).recentMeanAccuracy).toBeNull()

    saveSession(db, makeRequest())
    saveSession(db, makeRequest({ taskId: 'planning', startedAt: 1_700_000_000_001 }))
    const o = getOverview(db)
    expect(o.totalSessions).toBe(2)
    expect(o.tasksPracticed).toBe(2)
    expect(o.totalDurationMs).toBe(120_000)
    expect(o.recentMeanAccuracy).toBeCloseTo(0.75)
  })

  it('migration is idempotent across reopen (file db)', () => {
    // in-memory DBs vanish on close; use a temp file for the reopen check
    const path = `${process.env.TMPDIR ?? '/tmp'}/vectormind-test-${Date.now()}.db`
    const db1 = openDatabase(path)
    saveSession(db1, makeRequest())
    db1.close()
    const db2 = openDatabase(path)
    expect(listSessions(db2)).toHaveLength(1)
    db2.close()
  })
})
