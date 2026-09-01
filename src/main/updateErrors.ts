/**
 * Pure helpers for update-check error handling (no Electron imports, so they
 * are unit-testable). Shared by the updater wiring in updater.ts.
 */

/**
 * electron-updater errors carry the HTTP status first and then dump the whole
 * response, headers included. Only the head of the first line is meaningful —
 * classifying on the full text once matched a "503" inside a content-length
 * header and reported a 404 as a network blip.
 */
function head(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).trim()
  return raw.split('\n')[0].slice(0, 200)
}

/** The HTTP status electron-updater reports, when it reports one. */
export function extractStatus(err: unknown): number | null {
  const m = head(err).match(/(?:^|error:|httperror:|status(?:code)?:?)\s*(\d{3})\b/i)
  return m ? Number(m[1]) : null
}

/**
 * Transient failures worth a silent retry: GitHub's release feed occasionally
 * returns 5xx (503 "Service Unavailable") or rate-limits, and networks drop
 * connections. These are not a problem with the app or the release.
 */
export function isTransientUpdateError(err: unknown): boolean {
  const status = extractStatus(err)
  if (status !== null && (status >= 500 || status === 429 || status === 408)) return true
  return /service unavailable|bad gateway|gateway time-?out|econnreset|etimedout|econnrefused|eai_again|enotfound|getaddrinfo|socket hang up|network|timed? out/i.test(
    head(err)
  )
}

/**
 * A short, human message instead of electron-updater's full HTTP dump. The
 * status code is kept on the end so a failure stays diagnosable.
 */
export function friendlyUpdateError(err: unknown): string {
  const line = head(err)
  const status = extractStatus(err)
  const suffix = status === null ? '' : ` (HTTP ${status})`

  if (isTransientUpdateError(err)) {
    return `Could not reach GitHub just now (temporary network or server issue). Please try again in a moment.${suffix}`
  }
  if (/latest\.yml|no published versions|cannot find/i.test(line)) {
    return `The newest release is still being uploaded. Please try again in a minute.${suffix}`
  }
  const trimmed = line.replace(/\s+/g, ' ').trim()
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed || 'Update check failed.'
}
