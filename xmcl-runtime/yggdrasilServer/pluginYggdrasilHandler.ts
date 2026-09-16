import { AUTHORITY_DEV } from '@xmcl/runtime-api'
import { YggdrasilTexture, YggdrasilTexturesInfo } from '@xmcl/user'
import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
} from 'crypto'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import { LauncherApp, LauncherAppPlugin } from '~/app'
import { LAUNCHER_PROTOCOL } from '~/constant'
import { kPeerFacade } from '~/peer'
import { UserService } from '~/user'

const SIGNING_KEY_SERVICE = 'xmcl/yggdrasil-offline'
const SIGNING_KEY_ACCOUNT = 'profile-signing-key'

interface SigningKeyPair {
  publicKey: string
  privateKey: string
}

async function getSigningKeyPair(app: LauncherApp): Promise<SigningKeyPair> {
  const stored = await app.secretStorage
    .get(SIGNING_KEY_SERVICE, SIGNING_KEY_ACCOUNT)
    .catch(() => undefined)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as SigningKeyPair
      createPublicKey(parsed.publicKey)
      createPrivateKey(parsed.privateKey)
      return parsed
    } catch {
      // Replace invalid legacy/corrupt data with a fresh per-installation key.
    }
  }

  const generated = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const result = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
  }
  await app.secretStorage
    .put(SIGNING_KEY_SERVICE, SIGNING_KEY_ACCOUNT, JSON.stringify(result))
    .catch(() => undefined)
  return result
}

function signTextureTarget(secret: Buffer, target: string): string {
  return createHmac('sha256', secret).update(target).digest('base64url')
}

function isValidTextureSignature(secret: Buffer, target: string, signature: string): boolean {
  const expected = Buffer.from(signTextureTarget(secret, target))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export const pluginYggdrasilHandler: LauncherAppPlugin = (app) => {
  const logger = app.getLogger('YggdrasilServer')
  const signingKeyPair = getSigningKeyPair(app)
  const textureProxySecret = randomBytes(32)

  const getProfile = async (name: string) => {
    const userService = await app.registry.get(UserService)
    const peerService = await app.registry.get(kPeerFacade)
    const offline = Object.values(userService.state.users).find(
      (v) => v.authority === AUTHORITY_DEV,
    )
    if (offline) {
      const profiles = Object.values(offline.profiles)
      const founded = profiles.find(
        (p) => p.name === name || p.id === name || p.id.replaceAll('-', '') === name,
      )
      if (founded) return founded
    }
    return await peerService.queryGameProfile(name)
  }

  const queryProfile = async (id: string, needSign?: boolean) => {
    const profile = await getProfile(id)
    logger.log(`Get profile for ${id}: ${profile ? 'found' : 'not found'}`)

    const addr = `http://127.0.0.1:${await app.serverPort}/yggdrasil`
    const transformTexture = (texture?: YggdrasilTexture) => {
      if (!texture?.url) return texture
      const signature = signTextureTarget(textureProxySecret, texture.url)
      return {
        ...texture,
        url: `${addr}/textures?href=${encodeURIComponent(texture.url)}&signature=${encodeURIComponent(signature)}`,
      }
    }
    if (!profile) return undefined

    const unsignedProfileId = profile.id.replaceAll('-', '')
    const textureInfo: YggdrasilTexturesInfo = {
      timestamp: Date.now(),
      profileId: unsignedProfileId,
      profileName: profile.name,
      textures: {
        SKIN: transformTexture(profile.textures.SKIN),
        CAPE: transformTexture(profile.textures.CAPE),
        ELYTRA: transformTexture(profile.textures.ELYTRA),
      },
    }
    logger.log(`Transform texture info for ${id}`)
    const textureString = Buffer.from(JSON.stringify(textureInfo)).toString('base64')
    const signature = needSign
      ? await new Promise<Buffer>((resolve, reject) => {
          signingKeyPair.then(({ privateKey }) => {
            sign('RSA-SHA1', Buffer.from(textureString), privateKey, (error, data) => {
              if (error) reject(error)
              else resolve(data)
            })
          }, reject)
        })
      : undefined
    return JSON.stringify({
      id: unsignedProfileId,
      name: profile.name,
      properties: [
        { name: 'uploadableTextures', value: 'skin,cape' },
        {
          name: 'textures',
          value: textureString,
          signature: signature?.toString('base64'),
        },
      ],
    })
  }

  app.protocol.registerHandler(LAUNCHER_PROTOCOL, async ({ request, response, handle }) => {
    if (!request.url.pathname.startsWith('/yggdrasil')) return

    logger.log(`Process ${request.url.pathname}`)
    const pathname = request.url.pathname.substring('/yggdrasil'.length) || ''
    if (pathname === '/' || pathname === '') {
      response.status = 200
      response.body = JSON.stringify({
        meta: {
          implementationName: 'xmcl-offline-server',
          implementationVersion: '0.0.1',
          serverName: 'XMCL Offline Server',
        },
        skinDomains: ['localhost', '127.0.0.1'],
        signaturePublickey: (await signingKeyPair).publicKey,
      })
    } else if (pathname === '/sessionserver/session/minecraft/join' && request.method === 'POST') {
      if (request.body instanceof Readable) {
        request.body.resume()
        await finished(request.body)
      }
      response.status = 240
    } else if (
      pathname.startsWith('/sessionserver/session/minecraft/hasJoined') &&
      request.method === 'GET'
    ) {
      const username = request.url.searchParams.get('username')
      if (!username) {
        response.status = 400
        return
      }
      try {
        const payload = await queryProfile(username)
        if (payload) {
          response.status = 200
          response.headers = { 'content-type': 'application/json' }
          response.body = payload
        } else {
          response.status = 204
        }
      } catch {
        response.status = 204
      }
    } else if (pathname.startsWith('/sessionserver/session/minecraft/profile/')) {
      const uuid = pathname.substring(pathname.lastIndexOf('/') + 1)
      const needSigned = request.url.searchParams.get('unsigned') === 'false'
      await queryProfile(uuid, needSigned).then(
        (payload) => {
          if (payload) {
            response.headers['content-type'] = 'application/json'
            response.status = 200
            response.body = payload
          } else {
            response.status = 204
          }
        },
        () => {
          response.status = 204
        },
      )
    } else if (pathname === '/textures' && request.method === 'GET') {
      const target = request.url.searchParams.get('href')
      const signature = request.url.searchParams.get('signature')
      if (
        !target ||
        !signature ||
        !isValidTextureSignature(textureProxySecret, target, signature)
      ) {
        response.status = 403
        return
      }

      let targetUrl: URL
      try {
        targetUrl = new URL(target)
      } catch {
        response.status = 400
        return
      }
      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        response.status = 400
        return
      }
      await handle({
        request: {
          headers: request.headers,
          body: request.body,
          method: request.method,
          url: targetUrl,
        },
        response,
        handle,
      })
      logger.log(`Texture proxy response: ${response.status}`)
    } else {
      response.status = 404
    }
  })
}
