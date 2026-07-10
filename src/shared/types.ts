/** Shared task contracts: every task type implements this model. */

/** Difficulty level 1 (easiest) … 5 (hardest). */
export type Difficulty = 1 | 2 | 3 | 4 | 5

export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5]

export type TaskCategory =
  | 'attention'
  | 'memory'
  | 'spatial'
  | 'planning'
  | 'english'
  | 'simulation'

export type TaskId =
  | 'cube-folding'
  | 'coordinate-system'
  | 'matching-figure'
  | 'spot-the-side'
  | 'planning'
  | 'rule-application'
  | 'memorize-instruments'
  | 'memorize-pictograms'
  | 'big-numbers'
  // M4 (real-time attention)
  | 'vigilance'
  | 'divided-attention'
  | 'multi-attention'
  | 'conflict-scan'
  // M5 (FEAST II simulations)
  | 'radar-dart'
  | 'multipass'
  | 'radar-control'
  | 'strip-management'
  // M6
  | 'english-listening'

/** Common envelope for every generated scenario. */
export interface ScenarioBase {
  taskId: TaskId
  seed: string
  difficulty: Difficulty
}

/** One answered item, as recorded by a task view. */
export interface ItemResponse {
  /** Index of the chosen option, or null when the item timed out unanswered. */
  answerIndex: number | null
  /** Reaction time in ms measured with performance.now(). */
  rtMs: number
}

export interface ItemOutcome {
  index: number
  correct: boolean
  rtMs: number
  /** Whether the item ended by timeout rather than an answer. */
  timedOut: boolean
}

/** Common scoring result envelope; tasks may extend it with extra metrics. */
export interface TaskResult {
  taskId: TaskId
  totalItems: number
  correct: number
  /** correct / totalItems, in [0, 1]. */
  accuracy: number
  /** Mean reaction time over answered items, ms; null when nothing was answered. */
  meanRtMs: number | null
  items: ItemOutcome[]
  /** Task-specific extra metrics (e.g. falseAlarms, mathAccuracy). */
  extra?: Record<string, number>
}

/**
 * The pure part of a task: generate(seed, difficulty) and score(scenario,
 * responses) must be deterministic, side-effect free, and unit-tested.
 * The React view lives separately in the renderer.
 */
export interface TaskLogic<S extends ScenarioBase, R> {
  taskId: TaskId
  generate(seed: string, difficulty: Difficulty): S
  score(scenario: S, responses: R): TaskResult
}

/** Standard multiple-choice item shape used by most static FEAST I tasks. */
export interface McItem<Stim> {
  stimulus: Stim
  /** Option payloads; rendering is task-specific. */
  options: Stim[] | string[]
  correctIndex: number
  /** Per-item response time limit in ms. */
  timeLimitMs: number
}
