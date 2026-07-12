import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemResponse } from '@shared/types'

interface UseItemRunnerArgs<T> {
  items: readonly T[]
  /** Per-item time limit in ms (already timing-preset scaled); Infinity = untimed. */
  timeLimitOf: (item: T) => number
  onFinish: (responses: ItemResponse[]) => void
  /**
   * Practice feedback: after each answer, pause on the item for this many ms
   * so the view can reveal the correct choice, then advance. 0 (default) keeps
   * the original instant-advance behaviour. Reaction times are measured at the
   * moment of answering, so the pause never inflates them, and the countdown is
   * frozen during the reveal.
   */
  feedbackMs?: number
}

interface ItemRunner<T> {
  index: number
  total: number
  current: T | null
  remainingMs: number
  totalMs: number
  answer: (answerIndex: number | null) => void
  finished: boolean
  /** Non-null while a feedback reveal is showing the just-answered item. */
  reveal: { answerIndex: number | null } | null
}

const TICK_MS = 100

/**
 * Sequences a list of items with per-item deadlines, records reaction times
 * via performance.now(), and reports all responses when the list ends.
 */
export function useItemRunner<T>({
  items,
  timeLimitOf,
  onFinish,
  feedbackMs = 0
}: UseItemRunnerArgs<T>): ItemRunner<T> {
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(items.length === 0)
  const [reveal, setReveal] = useState<{ answerIndex: number | null } | null>(null)
  const current = finished ? null : items[index]
  const totalMs = current ? timeLimitOf(current) : 0
  const [remainingMs, setRemainingMs] = useState(totalMs)

  const responsesRef = useRef<ItemResponse[]>([])
  const startRef = useRef(performance.now())
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const goNext = useCallback(() => {
    setReveal(null)
    if (responsesRef.current.length >= items.length) {
      setFinished(true)
      onFinishRef.current(responsesRef.current)
    } else {
      startRef.current = performance.now()
      setIndex((i) => i + 1)
    }
  }, [items.length])

  const commit = useCallback(
    (response: ItemResponse) => {
      responsesRef.current.push(response)
      if (feedbackMs > 0) {
        setReveal({ answerIndex: response.answerIndex })
        revealTimer.current = setTimeout(goNext, feedbackMs)
      } else {
        goNext()
      }
    },
    [feedbackMs, goNext]
  )

  const answer = useCallback(
    (answerIndex: number | null) => {
      if (responsesRef.current.length > index || finished || reveal) return
      commit({ answerIndex, rtMs: performance.now() - startRef.current })
    },
    [commit, index, finished, reveal]
  )

  useEffect(() => {
    // Freeze the countdown during a reveal so feedback never eats the next item.
    if (finished || reveal || !Number.isFinite(totalMs)) return
    setRemainingMs(totalMs)
    const interval = setInterval(() => {
      const elapsed = performance.now() - startRef.current
      const remaining = totalMs - elapsed
      if (remaining <= 0) {
        clearInterval(interval)
        setRemainingMs(0)
        if (responsesRef.current.length <= index) {
          commit({ answerIndex: null, rtMs: totalMs })
        }
      } else {
        setRemainingMs(remaining)
      }
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [index, finished, reveal, totalMs, commit])

  useEffect(() => () => clearTimeout(revealTimer.current), [])

  return { index, total: items.length, current, remainingMs, totalMs, answer, finished, reveal }
}
