import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC, type UpdateStatus } from '@shared/ipc'
import { friendlyUpdateError, isTransientUpdateError } from './updateErrors'

const { autoUpdater } = electronUpdater

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// While a user-triggered check is running we own error reporting (retry or a
// friendly message); the generic error listener stays quiet so it does not also
// push the raw dump. Download errors (which fire after the check resolves) still
// go through it.
let managedCheck = false

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
  autoUpdater.on('error', (err) => {
    if (managedCheck) return // checkForUpdates() decides whether to retry or report
    send({ phase: 'error', message: friendlyUpdateError(err) })
  })
}

const CHECK_ATTEMPTS = 3
const CHECK_BACKOFF_MS = [1500, 3000]

export async function checkForUpdates(getWindow: () => BrowserWindow | null): Promise<void> {
  const send = (status: UpdateStatus): void => {
    getWindow()?.webContents.send(IPC.updateEvent, status)
  }
  if (!app.isPackaged) {
    send({
      phase: 'unsupported',
      reason: 'Updates work only in the installed app, not in development mode.'
    })
    return
  }
  managedCheck = true
  try {
    for (let attempt = 0; attempt < CHECK_ATTEMPTS; attempt++) {
      try {
        await autoUpdater.checkForUpdates()
        return // check succeeded; available/not-available already sent
      } catch (err) {
        if (isTransientUpdateError(err) && attempt < CHECK_ATTEMPTS - 1) {
          send({ phase: 'checking' }) // keep the UI in "checking…" while we retry
          await delay(CHECK_BACKOFF_MS[attempt])
          continue
        }
        send({ phase: 'error', message: friendlyUpdateError(err) })
        return
      }
    }
  } finally {
    managedCheck = false
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
