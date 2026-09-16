import { AUTHORITY_DEV } from '@xmcl/runtime-api'
import { Readable } from 'stream'
import { describe, expect, it, vi } from 'vitest'

const services = vi.hoisted(() => ({
  peer: Symbol('kPeerFacade'),
  UserService: class {},
}))

vi.mock('~/peer', () => ({ kPeerFacade: services.peer }))
vi.mock('~/user', () => ({ UserService: services.UserService }))

import { pluginYggdrasilHandler } from './pluginYggdrasilHandler'

describe('pluginYggdrasilHandler', () => {
  it('returns resolved unsigned profile UUIDs from Yggdrasil endpoints', async () => {
    const profile = {
      id: '12345678-1234-1234-1234-123456789abc',
      name: 'reter',
      textures: {
        SKIN: { url: 'http://launcher/media?path=C%3A%5Cskin.png' },
      },
    }
    const storedSecrets = new Map<string, string>()
    const app = {
      getLogger: vi.fn(() => ({ log: vi.fn() })),
      serverPort: Promise.resolve(25555),
      secretStorage: {
        get: vi.fn(async (service: string, account: string) =>
          storedSecrets.get(`${service}/${account}`),
        ),
        put: vi.fn(async (service: string, account: string, value: string) => {
          storedSecrets.set(`${service}/${account}`, value)
        }),
      },
      registry: {
        get: vi.fn(async () => ({
          state: {
            users: {
              offline: {
                authority: AUTHORITY_DEV,
                profiles: { [profile.id]: profile },
              },
            },
          },
        })),
      },
      protocol: { registerHandler: vi.fn() },
    }
    pluginYggdrasilHandler(app as any, {} as any)
    const handler = app.protocol.registerHandler.mock.calls[0]![1]
    const response: Record<string, any> = { headers: {} }

    await handler({
      request: {
        method: 'GET',
        url: new URL(
          'minelatino://launcher/yggdrasil/sessionserver/session/minecraft/hasJoined?username=reter',
        ),
        headers: {},
      },
      response,
      handle: vi.fn(),
    })

    expect(response.status).toBe(200)
    const payload = JSON.parse(response.body)
    expect(payload).toMatchObject({
      id: '12345678123412341234123456789abc',
      name: profile.name,
    })
    const textureProperty = payload.properties.find(
      (property: { name: string }) => property.name === 'textures',
    )
    const textureInfo = JSON.parse(Buffer.from(textureProperty.value, 'base64').toString())
    expect(textureInfo.profileId).toBe('12345678123412341234123456789abc')
    const proxiedSkin = new URL(textureInfo.textures.SKIN.url)
    expect(proxiedSkin.hostname).toBe('127.0.0.1')
    expect(proxiedSkin.searchParams.get('signature')).toBeTruthy()

    const deniedTextureResponse: Record<string, any> = { headers: {} }
    const textureHandle = vi.fn()
    await handler({
      request: {
        method: 'GET',
        url: new URL(
          'minelatino://launcher/yggdrasil/textures?href=http%3A%2F%2Flauncher%2Fmedia%3Fpath%3DC%253A%255Csecret.png',
        ),
        headers: {},
      },
      response: deniedTextureResponse,
      handle: textureHandle,
    })
    expect(deniedTextureResponse.status).toBe(403)
    expect(textureHandle).not.toHaveBeenCalled()

    const allowedTextureResponse: Record<string, any> = { headers: {} }
    await handler({
      request: {
        method: 'GET',
        url: new URL(
          proxiedSkin.toString().replace('http://127.0.0.1:25555', 'minelatino://launcher'),
        ),
        headers: {},
      },
      response: allowedTextureResponse,
      handle: textureHandle,
    })
    expect(textureHandle).toHaveBeenCalledTimes(1)

    const profileResponse: Record<string, any> = { headers: {} }
    await handler({
      request: {
        method: 'GET',
        url: new URL(
          'minelatino://launcher/yggdrasil/sessionserver/session/minecraft/profile/12345678123412341234123456789abc?unsigned=false',
        ),
        headers: {},
      },
      response: profileResponse,
      handle: vi.fn(),
    })

    expect(profileResponse.status).toBe(200)
    expect(JSON.parse(profileResponse.body)).toMatchObject({
      id: '12345678123412341234123456789abc',
      name: profile.name,
    })

    const joinResponse: Record<string, any> = { headers: {} }
    await handler({
      request: {
        method: 'POST',
        url: new URL('minelatino://launcher/yggdrasil/sessionserver/session/minecraft/join'),
        headers: {},
        body: Readable.from('{"accessToken":"token"}'),
      },
      response: joinResponse,
      handle: vi.fn(),
    })

    expect(joinResponse.status).toBe(240)
  })
})
