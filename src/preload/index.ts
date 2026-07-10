import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type VectorMindApi } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'

const api: VectorMindApi = {
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsSet, patch),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo)
}

contextBridge.exposeInMainWorld('vectormind', api)
