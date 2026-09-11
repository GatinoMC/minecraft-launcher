const DEFAULT_BACKEND_URL = 'https://minelatino-production.up.railway.app'

/**
 * CurseForge credentials live in the MineLatino backend. Keeping this resolver
 * here avoids coupling the generic runtime package to Electron's branded
 * service while still allowing staging builds to override the backend.
 */
export function resolveCurseforgeProxyUrl(): string {
  const backend = process.env.MINELATINO_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL
  return `${backend.replace(/\/+$/, '')}/api/curseforge`
}
