import type { ItemOutcome, ItemResponse, TaskId, TaskResult } from './types'

/**
 * Generic scorer for multiple-choice tasks: compares each response's
 * answerIndex against the item's correct index. Missing responses (view
 * aborted early) count as timed-out misses so accuracy is never inflated.
 */
export function scoreMultipleChoice(
  taskId: TaskId,
  correctIndices: readonly number[],
  responses: readonly ItemResponse[]
): TaskResult {
  const items: ItemOutcome[] = correctIndices.map((correctIndex, index) => {
    const r = responses[index]
    if (!r || r.answerIndex === null) {
      return { index, correct: false, rtMs: r?.rtMs ?? 0, timedOut: true }
    }
    return { index, correct: r.answerIndex === correctIndex, rtMs: r.rtMs, timedOut: false }
  })
  return buildResult(taskId, items)
}

/** Assemble the common result envelope from per-item outcomes. */
export function buildResult(
  taskId: TaskId,
  items: ItemOutcome[],
  extra?: Record<string, number>
): TaskResult {
  const answered = items.filter((i) => !i.timedOut)
  const correct = items.filter((i) => i.correct).length
  const meanRtMs =
    answered.length === 0
      ? null
      : answered.reduce((sum, i) => sum + i.rtMs, 0) / answered.length
  return {
    taskId,
    totalItems: items.length,
    correct,
    accuracy: items.length === 0 ? 0 : correct / items.length,
    meanRtMs,
    items,
    ...(extra ? { extra } : {})
  }
}
