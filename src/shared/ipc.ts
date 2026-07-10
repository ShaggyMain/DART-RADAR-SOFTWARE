import type { AppSettings } from './settings'

/** IPC channel names — the only channels the preload bridge exposes. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  appInfo: 'app:info'
} as const

export interface AppInfo {
  version: string
  platform: string
}

/** The typed API exposed to the renderer as window.vectormind. */
export interface VectorMindApi {
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getAppInfo(): Promise<AppInfo>
}
