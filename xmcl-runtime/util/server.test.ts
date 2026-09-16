import { createServer } from 'net'
import { describe, expect, it } from 'vitest'
import { listen } from './server'

describe('launcher local server', () => {
  it('binds only to the IPv4 loopback interface', async () => {
    const server = createServer()
    try {
      await listen(server, 0, port => port + 1)
      const address = server.address()
      expect(address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' })
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
