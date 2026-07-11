import type { Difficulty } from './types'

/**
 * Timing presets scale every per-item/exposure time limit. Base timings in
 * generators are "realistic" (sourced from candidate reports, configurable
 * by design — EUROCONTROL publishes no official values).
 */
export type TimingPreset = 'relaxed' | 'realistic' | 'strict'

export const TIMING_MULTIPLIER: Record<TimingPreset, number> = {
  relaxed: 1.5,
  realistic: 1.0,
  strict: 0.75
}

/**
 * Simulation speed multiplier for the real-time radar work-samples. It only
 * accelerates AIRCRAFT MOTION (and turns/climbs), so traffic actually
 * crosses the sector and hands off within a session — the session clock,
 * spawns and audio reaction windows stay in real time. Higher = faster,
 * busier, more demanding.
 */
export const SIM_SPEEDS = [1, 2, 4, 6, 8, 12] as const
export type SimSpeed = (typeof SIM_SPEEDS)[number]

export interface AppSettings {
  timingPreset: TimingPreset
  defaultDifficulty: Difficulty
  /** Enable spoken audio (TTS) in audio-based tasks. */
  audioEnabled: boolean
  /** Aircraft-motion acceleration for radar simulations. */
  simSpeed: SimSpeed
}

export const DEFAULT_SETTINGS: AppSettings = {
  timingPreset: 'realistic',
  defaultDifficulty: 2,
  audioEnabled: true,
  simSpeed: 8
}

/** Keep only known keys with valid values — IPC patches are untrusted. */
export function sanitizeSettingsPatch(patch: unknown): Partial<AppSettings> {
  const out: Partial<AppSettings> = {}
  if (typeof patch !== 'object' || patch === null) return out
  const p = patch as Record<string, unknown>
  if (p.timingPreset === 'relaxed' || p.timingPreset === 'realistic' || p.timingPreset === 'strict') {
    out.timingPreset = p.timingPreset
  }
  if (
    typeof p.defaultDifficulty === 'number' &&
    [1, 2, 3, 4, 5].includes(p.defaultDifficulty)
  ) {
    out.defaultDifficulty = p.defaultDifficulty as Difficulty
  }
  if (typeof p.audioEnabled === 'boolean') {
    out.audioEnabled = p.audioEnabled
  }
  if (typeof p.simSpeed === 'number' && (SIM_SPEEDS as readonly number[]).includes(p.simSpeed)) {
    out.simSpeed = p.simSpeed as SimSpeed
  }
  return out
}
