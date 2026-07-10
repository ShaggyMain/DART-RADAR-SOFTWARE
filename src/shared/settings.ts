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

export interface AppSettings {
  timingPreset: TimingPreset
  defaultDifficulty: Difficulty
  /** Enable spoken audio (TTS) in audio-based tasks. */
  audioEnabled: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  timingPreset: 'realistic',
  defaultDifficulty: 2,
  audioEnabled: true
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
  return out
}
