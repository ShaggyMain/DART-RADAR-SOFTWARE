/**
 * Pure helpers for update-check error handling (no Electron imports, so they
 * are unit-testable). Shared by the updater wiring in updater.ts.
 */

/**
 * Transient failures worth a silent retry: GitHub's release feed occasionally
 * returns 5xx (503 "Service Unavailable"), and networks drop connections. These
 * are not a problem with the app or the release.
 */
export function isTransientUpdateError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /\b(50[0-9]|429)\b|service unavailable|bad gateway|gateway time-?out|econnreset|etimedout|econnrefused|eai_again|enotfound|getaddrinfo|socket hang up|network|timed? out/i.test(
    msg
  )
}

/**
 * A short, human message instead of electron-updater's full HTTP dump (which
 * includes the request URL and every response header).
 */
export function friendlyUpdateError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).trim()
  if (isTransientUpdateError(raw)) {
    return 'Could not reach GitHub just now (temporary network or server issue). Please try again in a moment.'
  }
  if (/latest\.yml|no published versions|cannot find/i.test(raw)) {
    return 'No update information was found on the latest release. Please try again shortly.'
  }
  const firstLine = raw.split('\n')[0].replace(/\s+/g, ' ').trim()
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine || 'Update check failed.'
}
