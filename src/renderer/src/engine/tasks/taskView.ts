import type { TaskResult } from '@shared/types'

/** Props every task view receives from the task page. */
export interface TaskViewProps<S> {
  scenario: S
  /** Timing-preset multiplier applied to all per-item limits. */
  timingMultiplier: number
  onFinish: (result: TaskResult) => void
}
