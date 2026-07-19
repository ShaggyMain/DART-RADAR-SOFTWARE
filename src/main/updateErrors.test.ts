import { describe, expect, it } from 'vitest'
import { friendlyUpdateError, isTransientUpdateError } from './updateErrors'

describe('isTransientUpdateError', () => {
  it('flags GitHub 5xx and rate limits', () => {
    expect(isTransientUpdateError(new Error('503 Service Unavailable'))).toBe(true)
    expect(isTransientUpdateError('method: GET ... 503 ... No server is available')).toBe(true)
    expect(isTransientUpdateError(new Error('502 Bad Gateway'))).toBe(true)
    expect(isTransientUpdateError(new Error('429 Too Many Requests'))).toBe(true)
  })

  it('flags network drops', () => {
    expect(isTransientUpdateError(new Error('socket hang up'))).toBe(true)
    expect(isTransientUpdateError(new Error('read ECONNRESET'))).toBe(true)
    expect(isTransientUpdateError(new Error('getaddrinfo EAI_AGAIN github.com'))).toBe(true)
  })

  it('does not flag a genuine missing-asset (404) error', () => {
    expect(isTransientUpdateError(new Error('HttpError: 404 Cannot find latest.yml'))).toBe(false)
  })
})

describe('friendlyUpdateError', () => {
  it('summarises a transient 503 dump into one short line', () => {
    const dump =
      'Update error: 503 "method: GET url: https://github.com/x/y/releases.atom\n Data:\n <html>...</html>\n Headers: { "cache-control": "no-cache", ... very long ... }'
    const msg = friendlyUpdateError(new Error(dump))
    expect(msg).toMatch(/temporary network or server issue/i)
    expect(msg).not.toContain('Headers')
    expect(msg.length).toBeLessThan(160)
  })

  it('explains a missing latest.yml', () => {
    expect(friendlyUpdateError(new Error('Cannot find latest.yml in the latest release'))).toMatch(
      /update information/i
    )
  })

  it('trims an unknown long error to a single capped line', () => {
    const msg = friendlyUpdateError(new Error(`weird failure ${'x'.repeat(400)}\nsecond line`))
    expect(msg).not.toContain('second line')
    expect(msg.length).toBeLessThanOrEqual(181)
  })
})
