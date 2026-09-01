import { describe, expect, it } from 'vitest'
import { extractStatus, friendlyUpdateError, isTransientUpdateError } from './updateErrors'

// The shape electron-updater actually throws: status first, then a dump whose
// headers contain plenty of other numbers.
const dump503 =
  'Update error: 503 "method: GET url: https://github.com/o/r/releases.atom\n Data:\n <html><body><h1>503 Service Unavailable</h1></body></html>\n Headers: { "content-length": "107", "x-served": "429" }'
const dump404 =
  'Cannot find latest.yml in the latest release artifacts (https://github.com/o/r/releases/download/v0.1.4/latest.yml): HttpError: 404\n"method: GET ...\nHeaders: { "content-length": "503", "age": "500" }'

describe('extractStatus', () => {
  it('reads the reported status, not stray numbers', () => {
    expect(extractStatus(new Error(dump503))).toBe(503)
    expect(extractStatus(new Error(dump404))).toBe(404)
    expect(extractStatus(new Error('socket hang up'))).toBeNull()
  })
})

describe('isTransientUpdateError', () => {
  it('flags GitHub 5xx and rate limits', () => {
    expect(isTransientUpdateError(new Error(dump503))).toBe(true)
    expect(isTransientUpdateError(new Error('HttpError: 429 Too Many Requests'))).toBe(true)
    expect(isTransientUpdateError(new Error('502 Bad Gateway'))).toBe(true)
  })

  it('flags network drops', () => {
    expect(isTransientUpdateError(new Error('socket hang up'))).toBe(true)
    expect(isTransientUpdateError(new Error('read ECONNRESET'))).toBe(true)
    expect(isTransientUpdateError(new Error('getaddrinfo EAI_AGAIN github.com'))).toBe(true)
  })

  it('does NOT flag a 404 just because a header holds a 50x number', () => {
    expect(isTransientUpdateError(new Error(dump404))).toBe(false)
  })
})

describe('friendlyUpdateError', () => {
  it('summarises a transient 503 and keeps the status for diagnosis', () => {
    const msg = friendlyUpdateError(new Error(dump503))
    expect(msg).toMatch(/temporary network or server issue/i)
    expect(msg).toContain('HTTP 503')
    expect(msg).not.toContain('Headers')
  })

  it('explains a missing latest.yml as an upload still in flight', () => {
    const msg = friendlyUpdateError(new Error(dump404))
    expect(msg).toMatch(/still being uploaded/i)
    expect(msg).toContain('HTTP 404')
  })

  it('trims an unknown long error to a single capped line', () => {
    const msg = friendlyUpdateError(new Error(`weird failure ${'x'.repeat(400)}\nsecond line`))
    expect(msg).not.toContain('second line')
    expect(msg.length).toBeLessThanOrEqual(181)
  })
})
