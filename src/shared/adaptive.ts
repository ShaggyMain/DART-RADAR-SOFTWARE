import type { Difficulty } from './types'

/**
 * Adaptive difficulty + practice-stanine helpers. All pure.
 *
 * Recommendation rule (per plan): raise difficulty when rolling accuracy
 * at the current level exceeds 85%, lower it below 60%.
 */
export const RAISE_THRESHOLD = 0.85
export const LOWER_THRESHOLD = 0.6
/** How many recent sessions at the current level feed the rolling accuracy. */
const ROLLING_WINDOW = 3

export interface SessionSample {
  difficulty: Difficulty
  accuracy: number
}

/**
 * Recommend the next difficulty from recent sessions (NEWEST FIRST).
 * Uses the most recently played level and the rolling accuracy of the
 * last few sessions at that level.
 */
export function recommendDifficulty(
  sessions: readonly SessionSample[],
  fallback: Difficulty = 2
): Difficulty {
  if (sessions.length === 0) return fallback
  const level = sessions[0].difficulty
  const atLevel = sessions.filter((s) => s.difficulty === level).slice(0, ROLLING_WINDOW)
  const rolling = atLevel.reduce((sum, s) => sum + s.accuracy, 0) / atLevel.length
  if (rolling > RAISE_THRESHOLD) return Math.min(5, level + 1) as Difficulty
  if (rolling < LOWER_THRESHOLD) return Math.max(1, level - 1) as Difficulty
  return level
}

/* ------------------------------------------------------------------ */
/* Stanine (practice-only) helpers                                      */
/* ------------------------------------------------------------------ */

/**
 * Stanine from a percentile (0–100): standard cumulative boundaries at
 * 4, 11, 23, 40, 60, 77, 89 and 96 percent.
 */
export function stanineFromPercentile(percentile: number): number {
  const bounds = [4, 11, 23, 40, 60, 77, 89, 96]
  let stanine = 1
  for (const b of bounds) {
    if (percentile >= b) stanine++
  }
  return stanine
}

/** Abramowitz–Stegun approximation of the error function. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/** Φ — standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

/**
 * Percentile of `value` under a Normal(mu, sigma) reference distribution.
 * Used as the fallback reference when the user has too little history —
 * clearly labelled practice-only, NOT an official norm.
 */
export function percentileFromNormal(value: number, mu: number, sigma: number): number {
  if (sigma <= 0) return value >= mu ? 100 : 0
  return normalCdf((value - mu) / sigma) * 100
}

/** Default practice reference used when personal history is too thin. */
export const DEFAULT_REFERENCE = { mu: 0.7, sigma: 0.15 }

/** Personal history only becomes the reference at this many sessions. */
export const HISTORY_REFERENCE_MIN = 5
