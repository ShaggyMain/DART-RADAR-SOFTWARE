import {
  DEFAULT_REFERENCE,
  HISTORY_REFERENCE_MIN,
  percentileFromNormal,
  stanineFromPercentile
} from '@shared/adaptive'
import type { SaveOutcome } from '@shared/results'
import type { Difficulty, TaskId, TaskResult } from '@shared/types'

/**
 * Exam-simulation blueprints: chained modules in a FEAST-like order with
 * locked settings (difficulty 3, realistic timing), mandatory short breaks
 * between blocks and no feedback until the final summary.
 */
export const EXAM_DIFFICULTY: Difficulty = 3

export interface ExamBlock {
  name: string
  modules: TaskId[]
}

export interface ExamBlueprint {
  id: 'short' | 'full'
  name: string
  approxMinutes: number
  description: string
  blocks: ExamBlock[]
}

export const BLUEPRINTS: ExamBlueprint[] = [
  {
    id: 'short',
    name: 'Short exam',
    approxMinutes: 20,
    description: 'One module from each area — a quick full-pipeline rehearsal.',
    blocks: [
      { name: 'Perception & memory', modules: ['matching-figure', 'memorize-instruments', 'rule-application'] },
      { name: 'Attention & English', modules: ['conflict-scan', 'english-listening'] },
      { name: 'Simulation', modules: ['radar-dart'] }
    ]
  },
  {
    id: 'full',
    name: 'Full exam',
    approxMinutes: 55,
    description: 'All modules chained in a FEAST-like order with short breaks.',
    blocks: [
      {
        name: 'Perception & speed',
        modules: ['matching-figure', 'spot-the-side', 'coordinate-system', 'cube-folding']
      },
      {
        name: 'Memory & rules',
        modules: ['rule-application', 'memorize-instruments', 'memorize-pictograms', 'big-numbers']
      },
      {
        name: 'Attention',
        modules: ['conflict-scan', 'vigilance', 'divided-attention', 'multi-attention']
      },
      { name: 'Planning & English', modules: ['planning', 'english-listening'] },
      { name: 'Simulation', modules: ['radar-dart', 'multipass'] }
    ]
  }
]

/** Break between blocks: total length and the minimum before Continue. */
export const BREAK_TOTAL_S = 45
export const BREAK_MIN_S = 15

export interface ModuleOutcome {
  taskId: TaskId
  result: TaskResult
  save: SaveOutcome | null
}

export interface ModuleStanine {
  taskId: TaskId
  accuracy: number
  percentile: number
  stanine: number
  /** True when the reference was the user's own history (≥5 prior runs). */
  personalReference: boolean
}

/**
 * Stanine-style practice summary. Uses the user's OWN history at this
 * task+difficulty as the reference when there is enough of it, otherwise a
 * built-in default distribution. Practice feedback only — NOT an official
 * FEAST score.
 */
export function moduleStanine(outcome: ModuleOutcome): ModuleStanine {
  const accuracy = outcome.result.accuracy
  const priorAttempts = outcome.save ? outcome.save.attempts - 1 : 0
  const usePersonal =
    outcome.save !== null && outcome.save.percentile !== null && priorAttempts >= HISTORY_REFERENCE_MIN
  const percentile = usePersonal
    ? outcome.save!.percentile!
    : percentileFromNormal(accuracy, DEFAULT_REFERENCE.mu, DEFAULT_REFERENCE.sigma)
  return {
    taskId: outcome.taskId,
    accuracy,
    percentile,
    stanine: stanineFromPercentile(percentile),
    personalReference: usePersonal
  }
}

export function overallStanine(modules: ModuleStanine[]): number {
  if (modules.length === 0) return 1
  const mean = modules.reduce((sum, m) => sum + m.stanine, 0) / modules.length
  return Math.min(9, Math.max(1, Math.round(mean)))
}
