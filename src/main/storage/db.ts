import { DatabaseSync } from 'node:sqlite'
import type {
  OverviewStats,
  SaveOutcome,
  SessionQuery,
  SessionRecord,
  SessionSaveRequest
} from '@shared/results'
import { percentileRank, rollingMean } from '@shared/stats'
import type { TaskId } from '@shared/types'

/**
 * Results storage on node:sqlite (bundled with Electron's Node — no native
 * module rebuilds). This module is Electron-free by design: callers supply
 * the database path, tests use ':memory:'.
 */

const SCHEMA_VERSION = 1

export const DEFAULT_PROFILE_ID = 1

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (row.user_version >= SCHEMA_VERSION) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id),
      task_id TEXT NOT NULL,
      seed TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      total_items INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      mean_rt_ms REAL,
      timing_preset TEXT NOT NULL,
      extra TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_task
      ON sessions(profile_id, task_id, started_at);
    CREATE TABLE IF NOT EXISTS items (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      rt_ms REAL NOT NULL,
      timed_out INTEGER NOT NULL,
      PRIMARY KEY (session_id, idx)
    );
    CREATE TABLE IF NOT EXISTS skill_state (
      profile_id INTEGER NOT NULL,
      task_id TEXT NOT NULL,
      rating REAL NOT NULL,
      sessions_count INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (profile_id, task_id)
    );
  `)
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  ensureDefaultProfile(db)
}

function ensureDefaultProfile(db: DatabaseSync): void {
  const existing = db.prepare('SELECT id FROM profiles WHERE id = ?').get(DEFAULT_PROFILE_ID)
  if (!existing) {
    db.prepare('INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)').run(
      DEFAULT_PROFILE_ID,
      'Default',
      Date.now()
    )
  }
}

/** How many recent sessions feed the skill rating (adaptive difficulty, M7). */
const RATING_WINDOW = 10

export function saveSession(
  db: DatabaseSync,
  req: SessionSaveRequest,
  profileId = DEFAULT_PROFILE_ID
): SaveOutcome {
  // Percentile is computed against PRIOR runs at the same task+difficulty.
  const prior = db
    .prepare(
      `SELECT accuracy FROM sessions
       WHERE profile_id = ? AND task_id = ? AND difficulty = ?
       ORDER BY started_at ASC`
    )
    .all(profileId, req.taskId, req.difficulty) as { accuracy: number }[]
  const percentile = percentileRank(
    prior.map((r) => r.accuracy),
    req.result.accuracy
  )

  const insert = db.prepare(
    `INSERT INTO sessions
      (profile_id, task_id, seed, difficulty, started_at, duration_ms,
       total_items, correct, accuracy, mean_rt_ms, timing_preset, extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const info = insert.run(
    profileId,
    req.taskId,
    req.seed,
    req.difficulty,
    req.startedAt,
    req.durationMs,
    req.result.totalItems,
    req.result.correct,
    req.result.accuracy,
    req.result.meanRtMs,
    req.timingPreset,
    req.result.extra ? JSON.stringify(req.result.extra) : null
  )
  const sessionId = Number(info.lastInsertRowid)

  const insertItem = db.prepare(
    'INSERT INTO items (session_id, idx, correct, rt_ms, timed_out) VALUES (?, ?, ?, ?, ?)'
  )
  for (const item of req.result.items) {
    insertItem.run(sessionId, item.index, item.correct ? 1 : 0, item.rtMs, item.timedOut ? 1 : 0)
  }

  updateSkillState(db, profileId, req.taskId)

  return { sessionId, attempts: prior.length + 1, percentile }
}

function updateSkillState(db: DatabaseSync, profileId: number, taskId: TaskId): void {
  const recent = db
    .prepare(
      `SELECT accuracy FROM sessions
       WHERE profile_id = ? AND task_id = ?
       ORDER BY started_at DESC LIMIT ?`
    )
    .all(profileId, taskId, RATING_WINDOW) as { accuracy: number }[]
  const rating = rollingMean(
    recent.map((r) => r.accuracy).reverse(),
    RATING_WINDOW
  )
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM sessions WHERE profile_id = ? AND task_id = ?')
    .get(profileId, taskId) as { n: number }
  db.prepare(
    `INSERT INTO skill_state (profile_id, task_id, rating, sessions_count, last_seen)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, task_id) DO UPDATE SET
       rating = excluded.rating,
       sessions_count = excluded.sessions_count,
       last_seen = excluded.last_seen`
  ).run(profileId, taskId, rating ?? 0, count.n, Date.now())
}

interface SessionRow {
  id: number
  task_id: string
  seed: string
  difficulty: number
  started_at: number
  duration_ms: number
  total_items: number
  correct: number
  accuracy: number
  mean_rt_ms: number | null
  timing_preset: string
  extra: string | null
}

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    taskId: row.task_id as SessionRecord['taskId'],
    seed: row.seed,
    difficulty: row.difficulty as SessionRecord['difficulty'],
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    totalItems: row.total_items,
    correct: row.correct,
    accuracy: row.accuracy,
    meanRtMs: row.mean_rt_ms,
    timingPreset: row.timing_preset,
    extra: row.extra ? (JSON.parse(row.extra) as Record<string, number>) : null
  }
}

const MAX_LIMIT = 500

export function listSessions(
  db: DatabaseSync,
  query: SessionQuery = {},
  profileId = DEFAULT_PROFILE_ID
): SessionRecord[] {
  const limit = Math.min(Math.max(1, Math.floor(query.limit ?? 50)), MAX_LIMIT)
  const rows = ((
    query.taskId
      ? db
          .prepare(
            `SELECT * FROM sessions WHERE profile_id = ? AND task_id = ?
             ORDER BY started_at DESC LIMIT ?`
          )
          .all(profileId, query.taskId, limit)
      : db
          .prepare(
            `SELECT * FROM sessions WHERE profile_id = ?
             ORDER BY started_at DESC LIMIT ?`
          )
          .all(profileId, limit)
  ) as unknown) as SessionRow[]
  return rows.map(toRecord)
}

/** Overview across all tasks; recent mean accuracy over the last 20 runs. */
export function getOverview(db: DatabaseSync, profileId = DEFAULT_PROFILE_ID): OverviewStats {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS sessions, COALESCE(SUM(duration_ms), 0) AS duration,
              COUNT(DISTINCT task_id) AS tasks
       FROM sessions WHERE profile_id = ?`
    )
    .get(profileId) as { sessions: number; duration: number; tasks: number }
  const recent = db
    .prepare(
      `SELECT accuracy FROM sessions WHERE profile_id = ?
       ORDER BY started_at DESC LIMIT 20`
    )
    .all(profileId) as { accuracy: number }[]
  const recentMean =
    recent.length === 0 ? null : recent.reduce((a, r) => a + r.accuracy, 0) / recent.length
  return {
    totalSessions: totals.sessions,
    totalDurationMs: totals.duration,
    tasksPracticed: totals.tasks,
    recentMeanAccuracy: recentMean
  }
}
