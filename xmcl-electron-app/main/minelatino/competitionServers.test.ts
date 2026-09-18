import { describe, expect, it } from 'vitest'
import { normalizePublicServerAddress } from './competitionServers'

describe('normalizePublicServerAddress', () => {
  it('normalizes public saved servers', () => {
    expect(normalizePublicServerAddress('Play.Example.COM:25565')).toBe('play.example.com')
    expect(normalizePublicServerAddress('203.10.20.30:25570')).toBe('203.10.20.30:25570')
  })

  it.each(['localhost', 'server.lan', '192.168.1.10', '10.0.0.8', '127.0.0.1', '203.0.113.10', 'host name.example'])(
    'rejects local or invalid address %s',
    address => expect(normalizePublicServerAddress(address)).toBeUndefined(),
  )
})
