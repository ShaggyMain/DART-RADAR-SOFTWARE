import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  TIMING_MULTIPLIER,
  type AppSettings
} from '@shared/settings'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

/**
 * Settings live in the main process (electron-store); this store mirrors
 * them for the UI. Falls back to defaults when the bridge is unavailable.
 */
export const useSettings = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const fromMain = await window.vectormind?.getSettings()
    set({ settings: fromMain ?? DEFAULT_SETTINGS, loaded: true })
  },
  update: async (patch) => {
    const fromMain = await window.vectormind?.setSettings(patch)
    set((s) => ({ settings: fromMain ?? { ...s.settings, ...patch } }))
  }
}))

/** Current timing multiplier from the active preset. */
export function useTimingMultiplier(): number {
  return TIMING_MULTIPLIER[useSettings((s) => s.settings.timingPreset)]
}
