import type {
  MineLatinoAuthMode,
  MineLatinoAutoMod,
  MineLatinoAutoModVersion,
  MineLatinoConfig,
  MineLatinoLink,
  MineLatinoLoader,
  MineLatinoPreset,
  MineLatinoUpdatesProvider,
} from '@xmcl/runtime-api'

/**
 * The single value that has to be baked into the client: where the backend
 * lives. Everything else the launcher shows is served from there.
 *
 * This is the production Railway deployment of `MineLatino-Backend`. If it ever
 * contains `CHANGE_ME` the service skips the network entirely and runs on
 * `FALLBACK_CONFIG`, which keeps the home screen functional (and the log clean)
 * without a backend. Override with the `MINELATINO_BACKEND_URL` environment
 * variable to point a build at a staging backend without recompiling.
 */
export const DEFAULT_BACKEND_URL = 'https://minelatino-production.up.railway.app'

const PLACEHOLDER = 'CHANGE_ME'

export function resolveBackendUrl(): string {
  const fromEnv = process.env.MINELATINO_BACKEND_URL?.trim()
  const url = fromEnv || DEFAULT_BACKEND_URL
  if (!url || url.includes(PLACEHOLDER)) return ''
  // Tolerate a trailing slash so `${base}/api/config` never doubles up.
  return url.replace(/\/+$/, '')
}

const LOADERS: MineLatinoLoader[] = ['vanilla', 'fabric', 'neoforge', 'forge', 'quilt']

/**
 * Shipped inside the launcher so the home screen still renders with no backend
 * and no cache: a first launch on a machine without network must not show a
 * blank screen or an error dialog.
 *
 * These are the live MineLatino values (play address, shop, brand logo and the
 * amber accent sampled from the logo and both sites), mirroring the backend's
 * own defaults in `launcher-backend/src/env.ts`. The backend always wins when
 * reachable, so changing any of them later still needs no new build. News stays
 * disabled here on purpose: the Discord bot token only ever lives server-side.
 */
export const FALLBACK_CONFIG: MineLatinoConfig = {
  schemaVersion: 1,
  branding: {
    name: 'GatinoLauncher',
    tagline: 'Apoya al servidor y mejora tu experiencia de juego',
    logoUrl: 'https://minelatino.com/wp-content/uploads/2025/09/Logo-ML-1.png',
    accentColor: '#E8A32E',
  },
  server: {
    name: 'MineLatino',
    host: 'play.minelatino.com',
    port: 25565,
    bedrockPort: 19132,
    autoJoin: true,
    allowOffline: true,
    requiredMods: [],
  },
  store: {
    url: 'https://minelatino.shop',
    openInExternalBrowser: false,
    tabs: [],
  },
  news: {
    enabled: false,
    limit: 10,
  },
  updates: {
    enabled: true,
    limit: 10,
    provider: 'wordpress',
    sourceLabel: 'MineLatino Network',
    openInExternalBrowser: false,
  },
  auth: {
    modes: ['microsoft', 'offline'],
  },
  presets: [{
    id: 'minelatino-1-21-4',
    name: 'GatinoLauncher 1.21.4',
    description: 'Perfil Fabric 1.21.4 optimizado con 22 mods y configuración GatinoLauncher.',
    minecraftVersion: '1.21.4',
    loader: 'fabric',
    mods: [
      { projectId: 'Gi02250Z', version: '37UVvafP' }, // Almanac
      { projectId: 'VSNURh3q', version: 'WfGkrMP6' }, // C2ME
      { projectId: '9s6osm5g', version: 'TJ6o2sr4' }, // Cloth Config
      { projectId: 'Wnxd13zP', version: '1ZHtT6Xo' }, // Clumps
      { projectId: 'LQ3K71Q1', version: 'chAeqYaB' }, // Dynamic FPS
      { projectId: 'NNAgCjsB', version: 'hLb4spl6' }, // Entity Culling
      { projectId: 'P7dR8mSH', version: 'p96k10UR' }, // Fabric API
      { projectId: 'x1hIzbuY', version: 'HdbAWjaF' }, // FastQuit
      { projectId: 'uXXizFIs', version: '7KqeXPRS' }, // FerriteCore
      { projectId: 'DIlqwRFH', version: 'ZiNw8Tlt' }, // FPS Display
      { projectId: '5ZwdcRci', version: 'CFJfGS8F' }, // ImmediatelyFast
      { projectId: 'YL57xq9U', version: 'Ca054sTe' }, // Iris
      { projectId: 'vE2FN5qn', version: 'Wb7jqi55' }, // Let Me Despawn
      { projectId: 'gvQqBUqZ', version: 'u8pHPXJl' }, // Lithium
      { projectId: 'nmDcB62a', version: 'ZGxQddYr' }, // ModernFix
      { projectId: 'mOgUt4GM', version: '7iGb2ltH' }, // Mod Menu
      { projectId: '51shyZVL', version: 'gWgOJqk8' }, // More Culling
      { projectId: 'eXts2L7r', version: 'eeN3FuMY' }, // Placeholder API
      { projectId: 'Bh37bMuy', version: 'KoUrx3jJ' }, // Reese's Sodium Options
      { projectId: 'Ps1zyz6x', version: 'brerLvPf' }, // ScalableLux
      { projectId: 'PtjYWJkn', version: 'f4TfteNb' }, // Sodium Extra
      { projectId: 'AANobbMI', version: 'c3YkZvne' }, // Sodium
    ],
    icon: 'star',
    recommended: false,
    autoCreate: true,
  }, {
    id: 'minelatino-1-21-11',
    name: 'GatinoLauncher 1.21.11',
    description: 'Perfil Fabric 1.21.11 optimizado con 32 mods y configuración GatinoLauncher.',
    minecraftVersion: '1.21.11',
    loader: 'fabric',
    mods: [
      { projectId: 'Gi02250Z', version: 'Tcl38ycb' }, // Almanac
      { projectId: 'ONZm0H7Y', version: '6wjGquEh' }, // Better Block Entities
      { projectId: 'iRXmuz7a', version: 'CJeMP0KK' }, // Better Render Distance
      { projectId: 'VSNURh3q', version: 'QdLiMUjx' }, // C2ME
      { projectId: 'fALzjamp', version: '1CpEkmcD' }, // Chunky
      { projectId: '9s6osm5g', version: 'xuX40TN5' }, // Cloth Config
      { projectId: 'Wnxd13zP', version: 'OgBE8Rz4' }, // Clumps
      { projectId: 'NNAgCjsB', version: 'Dx3xsUER' }, // Entity Culling
      { projectId: 'P7dR8mSH', version: 'i5tSkVBH' }, // Fabric API
      { projectId: 'Ha28R6CL', version: 'ViT4gucI' }, // Fabric Language Kotlin
      { projectId: 'x1hIzbuY', version: 'ip2tVKLp' }, // FastQuit
      { projectId: 'uXXizFIs', version: 'Ii0gP3D8' }, // FerriteCore
      { projectId: 'DIlqwRFH', version: 'Tiz1VFDa' }, // FPS Display
      { projectId: 'hYykXjDp', version: 'nSB6xGOS' }, // Fzzy Config
      { projectId: '5ZwdcRci', version: 'QwkfUKSj' }, // ImmediatelyFast
      { projectId: 'YL57xq9U', version: 'ZQx4ktUs' }, // Iris
      { projectId: 'fQEb0iXm', version: 'O9LmWYR7' }, // Krypton
      { projectId: 'vE2FN5qn', version: '7gmpSYHk' }, // Let Me Despawn
      { projectId: 'gvQqBUqZ', version: 'qvNsoO3l' }, // Lithium
      { projectId: 'TjSm1wrD', version: 'JwSO8JCN' }, // ModernFix
      { projectId: 'mOgUt4GM', version: 'JWQVh32x' }, // Mod Menu
      { projectId: '51shyZVL', version: 'kWU8mVq5' }, // More Culling
      { projectId: 'hasdd01q', version: 'VyMvRQKq' }, // Noisium
      { projectId: 'RSeLon5O', version: 'kIlv5noY' }, // Particle Core
      { projectId: 'eXts2L7r', version: 'qxjzQ9xY' }, // Placeholder API
      { projectId: 'Bh37bMuy', version: 'yIgAFMna' }, // Reese's Sodium Options
      { projectId: 'Va8PJBFX', version: '1BDIVv7c' }, // RenderScale
      { projectId: 'Ps1zyz6x', version: 'PV9KcrYQ' }, // ScalableLux
      { projectId: 'gk3B4zrk', version: 'gqFyBDHt' }, // Smooth Boot
      { projectId: 'PtjYWJkn', version: 'yqY1efrC' }, // Sodium Extra
      { projectId: 'AANobbMI', version: '1OWNgWVR' }, // Sodium
      { projectId: 'fxxUqruK', version: 'w33aHXHj' }, // Voxy
    ],
    icon: 'star',
    recommended: true,
    autoCreate: true,
  }, {
    id: 'minelatino-26-2',
    name: 'GatinoLauncher 26.2',
    description: 'Perfil Fabric 26.2 optimizado con 29 mods y configuración GatinoLauncher.',
    minecraftVersion: '26.2',
    loader: 'fabric',
    mods: [
      { projectId: 'zvNzKfGF', version: 'MCoxIcu9' }, // Async Logger
      { projectId: 'g96Z4WVZ', version: 'JmPs4Wie' }, // BadOptimizations
      { projectId: 'ONZm0H7Y', version: 'IDqHHWrF' }, // Better Block Entities
      {
        downloadUrl: 'https://mediafilez.forgecdn.net/files/8422/187/boosters-1.3.0%2B26.2-fabric.jar',
        sha1: 'a32087f22cac539fb5b307a53b37e27a3ee2b0f6',
        fileName: 'boosters-1.3.0+26.2-fabric.jar',
        fileSize: 50149,
      }, // Boosters (CurseForge)
      { projectId: '9s6osm5g', version: 'Nv3xnWXd' }, // Cloth Config
      { projectId: 'Wnxd13zP', version: 'dEMopoOJ' }, // Clumps
      { projectId: 'NNAgCjsB', version: 'iiF6U3Ne' }, // Entity Culling
      { projectId: 'P7dR8mSH', version: 'Kr4WG5mG' }, // Fabric API
      { projectId: 'Ha28R6CL', version: 'Pd0xrHCw' }, // Fabric Language Kotlin
      { projectId: 'uXXizFIs', version: 'd5ddUdiB' }, // FerriteCore
      { projectId: 'nSRLvOHG', version: '4HgtdJ7f' }, // FISM
      { projectId: 'ohNO6lps', version: 'rSd3GiG8' }, // Forge Config API Port
      { projectId: 'hYykXjDp', version: 'EQSFgLYw' }, // Fzzy Config
      { projectId: 'T0OUgf8P', version: 'BOGqc3kp' }, // Get It Together, Drops!
      { projectId: '7MoE34WK', version: 'ES5Xkk9W' }, // Gnetum
      { projectId: '5ZwdcRci', version: 'uJHxuQxy' }, // ImmediatelyFast
      { projectId: 'YL57xq9U', version: 'oaD6KQls' }, // Iris
      { projectId: 'p8RJPJIC', version: '6Tdp16jL' }, // Ixeris
      { projectId: 'gvQqBUqZ', version: 'UPNexAfy' }, // Lithium
      { projectId: 'TjSm1wrD', version: 'TUWH6NZu' }, // ModernFix
      { projectId: 'mOgUt4GM', version: 'njXb639R' }, // Mod Menu
      { projectId: '51shyZVL', version: 'SYFaYeMK' }, // More Culling
      { projectId: 'Kw7Sm3Xf', version: 'Qx0oq0L0' }, // Noxesium
      { projectId: 'RSeLon5O', version: 'VFv6uQKM' }, // Particle Core
      { projectId: 'Bh37bMuy', version: 'PH4SPorH' }, // Reese's Sodium Options
      { projectId: 'Ps1zyz6x', version: 'EKLUURiy' }, // ScalableLux
      { projectId: 'PtjYWJkn', version: 'Fu02wj4x' }, // Sodium Extra
      { projectId: 'AANobbMI', version: '2Yom1N68' }, // Sodium
      { projectId: 'OnlVIpq5', version: 'GJk7sVtP' }, // ZFastNoise
    ],
    icon: 'star',
    recommended: false,
    autoCreate: true,
  }],
  links: [],
  maintenance: {
    enabled: false,
    message: '',
  },
  minLauncherVersion: '',
  autoMods: [],
}

function asObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fallback
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Only http(s) links are openable; anything else is a config mistake. */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/**
 * A Minecraft server address is a bare hostname, IP or bracketed IPv6 — no
 * scheme, no path, no port (the port is a separate field). Anything else would
 * be passed straight to `--quickPlayMultiplayer` and fail to resolve, so it is
 * rejected here and auto-join turns itself off instead.
 */
function asServerHost(value: string): string {
  const host = value.trim()
  if (!host) return ''
  if (host.startsWith('[')) return /^\[[0-9a-f:]+]$/i.test(host) ? host : ''
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host) ? host : ''
}

function asLink(value: unknown): MineLatinoLink | undefined {
  const source = asObject(value)
  const url = asString(source.url)
  const label = asString(source.label)
  if (!label || !isHttpUrl(url)) return undefined
  return { label, url, icon: asString(source.icon) || undefined }
}

function asLinks(value: unknown): MineLatinoLink[] {
  return asArray(value)
    .map(asLink)
    .filter((link): link is MineLatinoLink => !!link)
}

function asPreset(value: unknown): MineLatinoPreset | undefined {
  const source = asObject(value)
  const id = asString(source.id).trim()
  const minecraftVersion = asString(source.minecraftVersion).trim()
  const loader = asString(source.loader).toLowerCase() as MineLatinoLoader
  if (!id || !minecraftVersion || !LOADERS.includes(loader)) return undefined
  return {
    id,
    name: asString(source.name).trim() || id,
    description: asString(source.description) || undefined,
    minecraftVersion,
    loader,
    loaderVersion: asString(source.loaderVersion).trim() || undefined,
    mods: asArray(source.mods).map((mod) => {
      const source = asObject(mod)
      const projectId = asString(source.projectId).trim()
      const downloadUrl = asString(source.downloadUrl).trim()
      const sha1 = asString(source.sha1).trim().toLowerCase()
      const fileName = asString(source.fileName).trim()
      return {
        projectId: projectId || undefined,
        version: asString(source.version).trim() || undefined,
        downloadUrl: /^https:\/\//i.test(downloadUrl) ? downloadUrl : undefined,
        sha1: /^[a-f0-9]{40}$/.test(sha1) ? sha1 : undefined,
        fileName: /^[a-z0-9._+ -]+\.jar$/i.test(fileName) ? fileName : undefined,
        fileSize: Math.max(asNumber(source.fileSize, 0), 0) || undefined,
      }
    }).filter(mod => mod.projectId || (mod.downloadUrl && mod.sha1 && mod.fileName)),
    icon: asString(source.icon) || undefined,
    recommended: asBoolean(source.recommended, false),
    autoCreate: asBoolean(source.autoCreate, false),
  }
}

function asAutoModVersion(value: unknown): MineLatinoAutoModVersion | undefined {
  const source = asObject(value)
  const modVersion = asString(source.modVersion).trim()
  const loaderRaw = asString(source.loader).trim()
  const downloadUrl = asString(source.downloadUrl).trim()
  const sha1 = asString(source.sha1).trim()
  const fileName = asString(source.fileName).trim()
  const validLoaders = ['fabric', 'forge', 'neoforge'] as const
  const loader = validLoaders.find(l => l === loaderRaw)
  if (!modVersion || !loader || !downloadUrl || !sha1 || !fileName) return undefined
  const minecraftVersions = asArray(source.minecraftVersions)
    .map(v => asString(v).trim())
    .filter(v => v.length > 0)
  if (minecraftVersions.length === 0) return undefined
  return {
    modVersion,
    minecraftVersions,
    loader,
    downloadUrl,
    sha1,
    fileName,
    fileSize: asNumber(source.fileSize, 0),
  }
}

function asAutoMod(value: unknown): MineLatinoAutoMod | undefined {
  const source = asObject(value)
  const id = asString(source.id).trim()
  const name = asString(source.name).trim()
  if (!id || !name) return undefined
  const versions = asArray(source.versions)
    .map(asAutoModVersion)
    .filter((v): v is MineLatinoAutoModVersion => !!v)
  if (versions.length === 0) return undefined
  return { id, name, versions }
}

/**
 * Fills every field the renderer reads from whatever the backend returned.
 *
 * The launcher may be newer than the backend (or the other way round), and a
 * missing nested field would otherwise throw while rendering the home screen.
 * Unknown extras are dropped, invalid values fall back to the shipped default.
 */
export function normalizeConfig(raw: unknown): MineLatinoConfig {
  const base = FALLBACK_CONFIG
  const source = asObject(raw)
  const branding = asObject(source.branding)
  const server = asObject(source.server)
  const store = asObject(source.store)
  const news = asObject(source.news)
  const updates = asObject(source.updates)
  const auth = asObject(source.auth)
  const maintenance = asObject(source.maintenance)

  const host = asServerHost(asString(server.host))
  const port = asNumber(server.port, base.server.port)
  const provider = asString(updates.provider) as MineLatinoUpdatesProvider
  const modes = asArray(auth.modes)
    .map(mode => asString(mode))
    .filter((mode): mode is MineLatinoAuthMode => mode === 'microsoft' || mode === 'offline')
  const presets = asArray(source.presets)
    .map(asPreset)
    .filter((preset): preset is MineLatinoPreset => !!preset)

  const storeUrl = asString(store.url).trim()
  return {
    schemaVersion: asNumber(source.schemaVersion, base.schemaVersion),
    branding: {
      // The backend describes the MineLatino server, but the desktop product
      // has a fixed local identity. Never let an old cached config rename the
      // launcher back to the old server-branded product name.
      name: 'GatinoLauncher',
      tagline: asString(branding.tagline),
      logoUrl: asString(branding.logoUrl) || undefined,
      backgroundUrl: asString(branding.backgroundUrl) || undefined,
      accentColor: asString(branding.accentColor) || undefined,
    },
    server: {
      name: asString(server.name).trim() || base.server.name,
      host,
      port: port > 0 && port <= 65535 ? port : base.server.port,
      bedrockPort: asNumber(server.bedrockPort, base.server.bedrockPort ?? 19132),
      icon: asString(server.icon) || undefined,
      // Joining needs a real address, so a config without one cannot auto-join
      // no matter what the backend claims.
      autoJoin: asBoolean(server.autoJoin, false) && !!host,
      allowOffline: asBoolean(server.allowOffline, false),
      requiredMods: asArray(server.requiredMods).map(id => asString(id).trim()).filter(id => !!id),
    },
    store: {
      url: isHttpUrl(storeUrl) ? storeUrl : '',
      openInExternalBrowser: asBoolean(store.openInExternalBrowser, false),
      tabs: asLinks(store.tabs),
    },
    news: {
      enabled: asBoolean(news.enabled, false),
      limit: Math.min(Math.max(asNumber(news.limit, base.news.limit), 1), 50),
      inviteUrl: asString(news.inviteUrl) || undefined,
    },
    updates: {
      enabled: asBoolean(updates.enabled, false),
      limit: Math.min(Math.max(asNumber(updates.limit, base.updates.limit), 1), 50),
      provider: ['wordpress', 'json', 'none'].includes(provider) ? provider : 'none',
      sourceLabel: asString(updates.sourceLabel) || undefined,
      openInExternalBrowser: asBoolean(updates.openInExternalBrowser, false),
    },
    auth: {
      // Deliberately not `base.auth.modes`: falling back to a list containing
      // `offline` would re-enable non-premium accounts that the operator turned
      // off, which is a policy regression rather than a cosmetic one.
      modes: modes.length > 0 ? modes : ['microsoft'],
    },
    // Falling back to the shipped preset when the backend sends none keeps the
    // "Crear perfil MineLatino" flow alive across a schema change.
    presets: presets.length > 0 ? presets : base.presets,
    links: asLinks(source.links),
    maintenance: {
      enabled: asBoolean(maintenance.enabled, false),
      message: asString(maintenance.message),
    },
    minLauncherVersion: asString(source.minLauncherVersion),
    autoMods: asArray(source.autoMods)
      .map(asAutoMod)
      .filter((mod): mod is MineLatinoAutoMod => !!mod),
  }
}
