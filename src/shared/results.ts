import type { TimingPreset } from './settings'
import type { Difficulty, TaskId, TaskResult } from './types'

/** Request sent from the renderer after a completed run. */
export interface SessionSaveRequest {
  taskId: TaskId
  seed: string
  difficulty: Difficulty
  /** Epoch ms when the run started. */
  startedAt: number
  durationMs: number
  timingPreset: TimingPreset
  result: TaskResult
}

/** A stored session row. */
export interface SessionRecord {
  id: number
  taskId: TaskId
  seed: string
  difficulty: Difficulty
  startedAt: number
  durationMs: number
  totalItems: number
  correct: number
  accuracy: number
  meanRtMs: number | null
  timingPreset: string
  extra: Record<string, number> | null
}

/** Returned after saving: context for the results screen. */
export interface SaveOutcome {
  sessionId: number
  /** Total sessions for this task+difficulty, including this one. */
  attempts: number
  /**
   * Percentile rank of this run's accuracy vs previous runs at the same
   * task+difficulty; null when there is no history to compare against.
   */
  percentile: number | null
}

export interface OverviewStats {
  totalSessions: number
  totalDurationMs: number
  tasksPracticed: number
  /** Mean accuracy over the most recent sessions (any task); null if none. */
  recentMeanAccuracy: number | null
}

export interface SessionQuery {
  taskId?: TaskId
  /** Max rows, newest first. Defaults applied by the storage layer. */
  limit?: number
}

/** Per-task ability snapshot maintained on every save (adaptive difficulty). */
export interface SkillStateRecord {
  taskId: TaskId
  /** Rolling mean accuracy of the last sessions (0..1). */
  rating: number
  sessionsCount: number
  lastSeen: number
}
