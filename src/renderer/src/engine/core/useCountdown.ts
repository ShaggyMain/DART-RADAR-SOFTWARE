import { useEffect, useRef, useState } from 'react'

/**
 * Simple countdown that restarts whenever `activeKey` changes.
 * `durationMs === null` disables it. Calls `onExpire` exactly once per key.
 */
export function useCountdown(
  activeKey: string | number | null,
  durationMs: number | null,
  onExpire: () => void
): number {
  const [remainingMs, setRemainingMs] = useState(durationMs ?? 0)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (activeKey === null || durationMs === null) return
    setRemainingMs(durationMs)
    const start = performance.now()
    let expired = false
    const interval = setInterval(() => {
      const remaining = durationMs - (performance.now() - start)
      if (remaining <= 0) {
        clearInterval(interval)
        setRemainingMs(0)
        if (!expired) {
          expired = true
          onExpireRef.current()
        }
      } else {
        setRemainingMs(remaining)
      }
    }, 100)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, durationMs])

  return remainingMs
}
