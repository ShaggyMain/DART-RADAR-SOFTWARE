import Store from 'electron-store'
import {
  DEFAULT_SETTINGS,
  sanitizeSettingsPatch,
  type AppSettings
} from '@shared/settings'

const store = new Store<{ settings: AppSettings }>({
  defaults: { settings: DEFAULT_SETTINGS }
})

export function getSettings(): AppSettings {
  // Merge over defaults so new keys added in updates get sane values.
  return { ...DEFAULT_SETTINGS, ...store.get('settings') }
}

export function updateSettings(patch: unknown): AppSettings {
  const next = { ...getSettings(), ...sanitizeSettingsPatch(patch) }
  store.set('settings', next)
  return next
}
