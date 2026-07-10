import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemResponse } from '@shared/types'

interface UseItemRunnerArgs<T> {
  items: readonly T[]
  /** Per-item time limit in ms (already timing-preset scaled); Infinity = untimed. */
  timeLimitOf: (item: T) => number
  onFinish: (responses: ItemResponse[]) => void
}

interface ItemRunner<T> {
  index: number
  total: number
  current: T | null
  remainingMs: number
  totalMs: number
  answer: (answerIndex: number | null) => void
  finished: boolean
}

const TICK_MS = 100

/**
 * Sequences a list of items with per-item deadlines, records reaction times
 * via performance.now(), and reports all responses when the list ends.
 */
export function useItemRunner<T>({
  items,
  timeLimitOf,
  onFinish
}: UseItemRunnerArgs<T>): ItemRunner<T> {
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(items.length === 0)
  const current = finished ? null : items[index]
  const totalMs = current ? timeLimitOf(current) : 0
  const [remainingMs, setRemainingMs] = useState(totalMs)

  const responsesRef = useRef<ItemResponse[]>([])
  const startRef = useRef(performance.now())
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const advance = useCallback(
    (response: ItemResponse) => {
      responsesRef.current.push(response)
      if (responsesRef.current.length >= items.length) {
        setFinished(true)
        onFinishRef.current(responsesRef.current)
      } else {
        startRef.current = performance.now()
        setIndex((i) => i + 1)
      }
    },
    [items.length]
  )

  const answer = useCallback(
    (answerIndex: number | null) => {
      if (responsesRef.current.length > index || finished) return
      advance({ answerIndex, rtMs: performance.now() - startRef.current })
    },
    [advance, index, finished]
  )

  useEffect(() => {
    if (finished || !Number.isFinite(totalMs)) return
    setRemainingMs(totalMs)
    const interval = setInterval(() => {
      const elapsed = performance.now() - startRef.current
      const remaining = totalMs - elapsed
      if (remaining <= 0) {
        clearInterval(interval)
        setRemainingMs(0)
        if (responsesRef.current.length <= index) {
          advance({ answerIndex: null, rtMs: totalMs })
        }
      } else {
        setRemainingMs(remaining)
      }
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [index, finished, totalMs, advance])

  return { index, total: items.length, current, remainingMs, totalMs, answer, finished }
}
