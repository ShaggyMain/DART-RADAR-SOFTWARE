import type { DatabaseSync } from 'node:sqlite'
import type { SessionRecord } from '@shared/results'
import type { AppSettings } from '@shared/settings'
import { DEFAULT_PROFILE_ID, listSessions, saveSession } from './db'

/**
 * Profile export/import as a single JSON bundle. Import merges: sessions
 * already present (same task, seed and start time) are skipped, and the
 * skill ratings are rebuilt by the normal save pipeline.
 */
export interface ExportedItem {
  index: number
  correct: boolean
  rtMs: number
  timedOut: boolean
}

export interface ExportedSession extends SessionRecord {
  items: ExportedItem[]
}

export interface ExportBundle {
  app: 'vectormind'
  formatVersion: 1
  exportedAt: number
  settings: AppSettings | null
  sessions: ExportedSession[]
}

const EXPORT_LIMIT = 500

export function exportData(db: DatabaseSync, settings: AppSettings | null): ExportBundle {
  const sessions = listSessions(db, { limit: EXPORT_LIMIT })
  const itemsStmt = db.prepare(
    'SELECT idx, correct, rt_ms, timed_out FROM items WHERE session_id = ? ORDER BY idx'
  )
  const withItems: ExportedSession[] = sessions.map((s) => ({
    ...s,
    items: (itemsStmt.all(s.id) as unknown as {
      idx: number
      correct: number
      rt_ms: number
      timed_out: number
    }[]).map((r) => ({
      index: r.idx,
      correct: r.correct === 1,
      rtMs: r.rt_ms,
      timedOut: r.timed_out === 1
    }))
  }))
  return {
    app: 'vectormind',
    formatVersion: 1,
    exportedAt: Date.now(),
    settings,
    sessions: withItems
  }
}

export interface ImportSummary {
  imported: number
  skipped: number
  settings: AppSettings | null
}

/** Basic shape check — imports are untrusted files. */
export function validateBundle(data: unknown): data is ExportBundle {
  if (typeof data !== 'object' || data === null) return false
  const b = data as Record<string, unknown>
  return b.app === 'vectormind' && b.formatVersion === 1 && Array.isArray(b.sessions)
}

export function importData(
  db: DatabaseSync,
  bundle: ExportBundle,
  profileId = DEFAULT_PROFILE_ID
): ImportSummary {
  const existsStmt = db.prepare(
    `SELECT id FROM sessions
     WHERE profile_id = ? AND task_id = ? AND seed = ? AND started_at = ?`
  )
  let imported = 0
  let skipped = 0
  // Oldest first, so percentiles/ratings rebuild in chronological order.
  const chronological = bundle.sessions.slice().sort((a, b) => a.startedAt - b.startedAt)
  for (const s of chronological) {
    if (
      typeof s.taskId !== 'string' ||
      typeof s.startedAt !== 'number' ||
      typeof s.accuracy !== 'number'
    ) {
      skipped++
      continue
    }
    if (existsStmt.get(profileId, s.taskId, s.seed ?? '', s.startedAt)) {
      skipped++
      continue
    }
    saveSession(
      db,
      {
        taskId: s.taskId,
        seed: s.seed ?? 'imported',
        difficulty: s.difficulty,
        startedAt: s.startedAt,
        durationMs: s.durationMs ?? 0,
        timingPreset: (s.timingPreset as 'relaxed' | 'realistic' | 'strict') ?? 'realistic',
        result: {
          taskId: s.taskId,
          totalItems: s.totalItems,
          correct: s.correct,
          accuracy: s.accuracy,
          meanRtMs: s.meanRtMs,
          items: (s.items ?? []).map((i) => ({
            index: i.index,
            correct: i.correct,
            rtMs: i.rtMs,
            timedOut: i.timedOut
          })),
          ...(s.extra ? { extra: s.extra } : {})
        }
      },
      profileId
    )
    imported++
  }
  return { imported, skipped, settings: bundle.settings ?? null }
}
