import { app, type IpcMain } from 'electron'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import { IPC, type AppInfo } from '@shared/ipc'
import type { SessionQuery, SessionSaveRequest } from '@shared/results'
import { getSettings, updateSettings } from '../storage/settingsStore'
import { getOverview, listSessions, openDatabase, saveSession } from '../storage/db'

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (!db) {
    db = openDatabase(join(app.getPath('userData'), 'vectormind.db'))
  }
  return db
}

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_event, patch: unknown) => updateSettings(patch))
  ipcMain.handle(IPC.appInfo, (): AppInfo => {
    return { version: app.getVersion(), platform: process.platform }
  })

  ipcMain.handle(IPC.resultsSave, (_event, req: SessionSaveRequest) => {
    return saveSession(getDb(), req)
  })
  ipcMain.handle(IPC.resultsList, (_event, query: SessionQuery | undefined) => {
    return listSessions(getDb(), query ?? {})
  })
  ipcMain.handle(IPC.resultsOverview, () => getOverview(getDb()))
}
