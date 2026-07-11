import { app, dialog, type IpcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import { IPC, type AppInfo, type ExportResult, type ImportResult } from '@shared/ipc'
import type { SessionQuery, SessionSaveRequest } from '@shared/results'
import { getSettings, updateSettings } from '../storage/settingsStore'
import {
  getOverview,
  listSessions,
  listSkillStates,
  openDatabase,
  saveSession
} from '../storage/db'
import { exportData, importData, validateBundle } from '../storage/transfer'
import { BrowserWindow } from 'electron'
import { checkForUpdates, installUpdate } from '../updater'

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
  ipcMain.handle(IPC.skillsList, () => listSkillStates(getDb()))

  ipcMain.handle(IPC.updateCheck, () =>
    checkForUpdates(() => BrowserWindow.getAllWindows()[0] ?? null)
  )
  ipcMain.handle(IPC.updateInstall, () => installUpdate())

  ipcMain.handle(IPC.dataExport, async (): Promise<ExportResult> => {
    const stamp = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export training data',
      defaultPath: `vectormind-export-${stamp}.json`,
      filters: [{ name: 'VectorMind export', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { status: 'canceled' }
    const bundle = exportData(getDb(), getSettings())
    await writeFile(filePath, JSON.stringify(bundle, null, 2), 'utf8')
    return { status: 'saved', path: filePath, sessions: bundle.sessions.length }
  })

  ipcMain.handle(IPC.dataImport, async (): Promise<ImportResult> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import training data',
      properties: ['openFile'],
      filters: [{ name: 'VectorMind export', extensions: ['json'] }]
    })
    if (canceled || filePaths.length === 0) return { status: 'canceled' }
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(filePaths[0], 'utf8'))
    } catch {
      return { status: 'invalid' }
    }
    if (!validateBundle(parsed)) return { status: 'invalid' }
    const summary = importData(getDb(), parsed)
    if (summary.settings) updateSettings(summary.settings)
    return { status: 'imported', imported: summary.imported, skipped: summary.skipped }
  })
}
