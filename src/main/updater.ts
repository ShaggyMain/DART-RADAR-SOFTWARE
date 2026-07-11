import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC, type UpdateStatus } from '@shared/ipc'

const { autoUpdater } = electronUpdater

/**
 * Manual (user-triggered) auto-update wiring. We never auto-check on startup —
 * the user presses "Check for updates" in Settings. Status is pushed to the
 * renderer over the updateEvent channel. Requires the app to be packaged and
 * the repo's GitHub Releases to be reachable (public).
 */
export function setupUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (status: UpdateStatus): void => {
    getWindow()?.webContents.send(IPC.updateEvent, status)
  }

  autoUpdater.on('checking-for-update', () => send({ phase: 'checking' }))
  autoUpdater.on('update-available', (info) => send({ phase: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) =>
    send({ phase: 'not-available', version: info.version })
  )
  autoUpdater.on('download-progress', (p) =>
    send({ phase: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    send({ phase: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    send({ phase: 'error', message: err?.message ?? 'Unknown update error' })
  )
}

export async function checkForUpdates(getWindow: () => BrowserWindow | null): Promise<void> {
  if (!app.isPackaged) {
    getWindow()?.webContents.send(IPC.updateEvent, {
      phase: 'unsupported',
      reason: 'Updates work only in the installed app, not in development mode.'
    } satisfies UpdateStatus)
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    getWindow()?.webContents.send(IPC.updateEvent, {
      phase: 'error',
      message: err instanceof Error ? err.message : 'Update check failed'
    } satisfies UpdateStatus)
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
