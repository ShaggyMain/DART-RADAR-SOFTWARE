import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type UpdateStatus, type VectorMindApi } from '@shared/ipc'
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
  importData: () => ipcRenderer.invoke(IPC.dataImport),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const listener = (_e: IpcRendererEvent, status: UpdateStatus): void => cb(status)
    ipcRenderer.on(IPC.updateEvent, listener)
    return () => ipcRenderer.removeListener(IPC.updateEvent, listener)
  }
}

contextBridge.exposeInMainWorld('vectormind', api)
