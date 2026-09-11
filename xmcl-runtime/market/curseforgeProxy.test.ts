import { afterEach, describe, expect, test } from 'vitest'
import { resolveCurseforgeProxyUrl } from './curseforgeProxy'

const previousBackend = process.env.MINELATINO_BACKEND_URL

afterEach(() => {
  if (previousBackend === undefined) delete process.env.MINELATINO_BACKEND_URL
  else process.env.MINELATINO_BACKEND_URL = previousBackend
})

describe('resolveCurseforgeProxyUrl', () => {
  test('uses the production MineLatino backend by default', () => {
    delete process.env.MINELATINO_BACKEND_URL
    expect(resolveCurseforgeProxyUrl()).toBe('https://minelatino-production.up.railway.app/api/curseforge')
  })

  test('supports a staging backend without producing a double slash', () => {
    process.env.MINELATINO_BACKEND_URL = 'https://staging.example/'
    expect(resolveCurseforgeProxyUrl()).toBe('https://staging.example/api/curseforge')
  })
})
