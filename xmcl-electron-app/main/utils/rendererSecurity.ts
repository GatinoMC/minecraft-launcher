import { HAS_DEV_SERVER } from '@/constant'

const DEVELOPMENT_RENDERER_ORIGIN = 'http://localhost:3000'
const PACKAGED_RENDERER_ORIGINS = new Set(['http://xmcl.runtime', 'http://app'])

export const MAIN_RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self' http://launcher",
  "style-src 'self'",
  "img-src 'self' data: blob: https: image:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: http://launcher",
  "media-src 'self' blob: https: video:",
  "worker-src 'self' blob:",
  "child-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export function isTrustedRendererUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (PACKAGED_RENDERER_ORIGINS.has(url.origin)) return true
    return HAS_DEV_SERVER === true && url.origin === DEVELOPMENT_RENDERER_ORIGIN
  } catch {
    return false
  }
}

export function isSafeExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
