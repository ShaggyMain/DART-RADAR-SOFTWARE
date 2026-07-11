import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type VectorMindApi } from '@shared/ipc'
import type { SessionQuery, SessionSaveRequest } from '@shared/results'
import type { AppSettings } from '@shared/settings'

const api: VectorMindApi = {
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsSet, patch),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  saveSession: (req: SessionSaveRequest) => ipcRenderer.invoke(IPC.resultsSave, req),
  listSessions: (query?: SessionQuery) => ipcRenderer.invoke(IPC.resultsList, query),
  getOverview: () => ipcRenderer.invoke(IPC.resultsOverview),
  listSkillStates: () => ipcRenderer.invoke(IPC.skillsList),
  exportData: () => ipcRenderer.invoke(IPC.dataExport),
  importData: () => ipcRenderer.invoke(IPC.dataImport)
}

contextBridge.exposeInMainWorld('vectormind', api)
