import { app, type IpcMain } from 'electron'
import { IPC, type AppInfo } from '@shared/ipc'
import { getSettings, updateSettings } from '../storage/settingsStore'

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_event, patch: unknown) => updateSettings(patch))
  ipcMain.handle(IPC.appInfo, (): AppInfo => {
    return { version: app.getVersion(), platform: process.platform }
  })
}
