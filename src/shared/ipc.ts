import type {
  OverviewStats,
  SaveOutcome,
  SessionQuery,
  SessionRecord,
  SessionSaveRequest,
  SkillStateRecord
} from './results'
import type { AppSettings } from './settings'

/** IPC channel names — the only channels the preload bridge exposes. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  appInfo: 'app:info',
  resultsSave: 'results:save',
  resultsList: 'results:list',
  resultsOverview: 'results:overview',
  skillsList: 'skills:list',
  dataExport: 'data:export',
  dataImport: 'data:import'
} as const

export type ExportResult =
  | { status: 'saved'; path: string; sessions: number }
  | { status: 'canceled' }

export type ImportResult =
  | { status: 'imported'; imported: number; skipped: number }
  | { status: 'canceled' }
  | { status: 'invalid' }

export interface AppInfo {
  version: string
  platform: string
}

/** The typed API exposed to the renderer as window.vectormind. */
export interface VectorMindApi {
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getAppInfo(): Promise<AppInfo>
  saveSession(req: SessionSaveRequest): Promise<SaveOutcome>
  listSessions(query?: SessionQuery): Promise<SessionRecord[]>
  getOverview(): Promise<OverviewStats>
  listSkillStates(): Promise<SkillStateRecord[]>
  exportData(): Promise<ExportResult>
  importData(): Promise<ImportResult>
}
