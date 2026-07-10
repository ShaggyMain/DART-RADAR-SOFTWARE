/** Pure statistics helpers shared by storage, views and tests. */

/**
 * Percentile rank of `value` within `previous` observations: the share of
 * previous values it beats, counting ties as half. Returns null when there
 * is no history. Result in [0, 100].
 */
export function percentileRank(previous: readonly number[], value: number): number | null {
  if (previous.length === 0) return null
  let below = 0
  let ties = 0
  for (const v of previous) {
    if (v < value) below++
    else if (v === value) ties++
  }
  return ((below + ties / 2) / previous.length) * 100
}

/** Arithmetic mean; null for empty input. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Mean of the last `n` values (or fewer if not enough history). */
export function rollingMean(values: readonly number[], n: number): number | null {
  return mean(values.slice(-n))
}

/** "1h 24m" / "3m 05s" / "45s" style duration formatting. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}
