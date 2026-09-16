import { describe, expect, it } from 'vitest'
import { formatLogMessage, getMessageFromError } from './log_consumer'

describe('log redaction', () => {
  it('redacts nested sensitive keys without mutating the source object', () => {
    const input = {
      headers: { Authorization: 'Bearer very-sensitive-value' },
      body: JSON.stringify({ accessToken: 'secret-value', safe: 'visible' }),
      env: { PRIVATE_VALUE: 'must-not-leak' },
    }

    const output = formatLogMessage('%o', [input])

    expect(output).not.toContain('very-sensitive-value')
    expect(output).not.toContain('secret-value')
    expect(output).not.toContain('must-not-leak')
    expect(output).toContain('visible')
    expect(input.headers.Authorization).toBe('Bearer very-sensitive-value')
  })

  it('redacts credentials embedded in ordinary errors', () => {
    const output = getMessageFromError(new Error('Authorization: Bearer very-sensitive-value'))
    expect(output).not.toContain('very-sensitive-value')
    expect(output).toContain('Authorization: ***')
  })
})
