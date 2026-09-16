import { Server } from 'net'

export async function listen(server: Server, port: number, nextPort: (cur: number) => number) {
  for (; port <= 65535; port = nextPort(port)) {
    const listened = await new Promise<boolean>((resolve, reject) => {
      const handleError = (e: any) => {
        if (e.code === 'EADDRINUSE') {
          resolve(false)
        } else {
          // should panic
          reject(e)
        }
      }
      server.addListener('error', handleError)
      // This server exposes privileged launcher protocol handlers. It is an
      // implementation detail for local OAuth/game callbacks and must never
      // be reachable from the LAN.
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', handleError)
        resolve(true)
      })
    })

    if (listened) {
      break
    }
  }
  return port
}
