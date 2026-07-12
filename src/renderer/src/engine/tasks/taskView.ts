import type { TaskResult } from '@shared/types'

/** Props every task view receives from the task page. */
export interface TaskViewProps<S> {
  scenario: S
  /** Timing-preset multiplier applied to all per-item limits. */
  timingMultiplier: number
  /**
   * Practice mode shows per-item feedback (reveal the correct answer). Exam mode
   * leaves this false so nothing is revealed until the final summary. Views that
   * support feedback opt in; others ignore it.
   */
  feedback?: boolean
  onFinish: (result: TaskResult) => void
}
