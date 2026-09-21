import { readFile, outputFile, outputJson, readdir, remove } from 'fs-extra'
import { basename, join } from 'path'
import { createHash, randomUUID } from 'node:crypto'
import { rcompare, valid } from 'semver'
import { readServerInfo } from '@xmcl/game-data'
import {
  AUTHORITY_DEV,
  AUTHORITY_MICROSOFT,
  MineLatinoServiceKey,
  MarketType,
  type MineLatinoAutoMod,
  type MineLatinoAutoModVersion,
  type MineLatinoAccountCredentials,
  type MineLatinoCosmeticsAccount,
  type MineLatinoCosmeticsPlayer,
  type MineLatinoEquippedCosmetic,
  type MineLatinoCosmeticOrder,
  type MineLatinoCompetitionTelemetrySettings,
  type MineLatinoConfig,
  type MineLatinoNewsEmbed,
  type MineLatinoPaymentProvider,
  type MineLatinoNewsItem,
  type MineLatinoNewsResult,
  type MineLatinoPlaytimeLeaderboardEntry,
  type MineLatinoPreset,
  type MineLatinoService as IMineLatinoService,
  type MineLatinoStoreCategory,
  type MineLatinoStoreProduct,
  type MineLatinoStoreProductsResult,
  type MineLatinoStoreResult,
  type MineLatinoUpdateItem,
  type MineLatinoUpdatesResult,
  type MineLatinoWebWindowInfo,
  type MineLatinoWebWindowOptions,
  type UserProfile,
} from '@xmcl/runtime-api'
import { Inject, kGameDataPath, LauncherAppKey, type LauncherApp } from '@xmcl/runtime/app'
import { AbstractService, ExposeServiceKey } from '@xmcl/runtime/service'
import { LaunchService } from '~/launch'
import { InstanceModsService, InstanceService } from '~/instance'
import { InstanceInstallService } from '~/instanceIO'
import { VersionInstallService, VersionMetadataService } from '@xmcl/runtime/install'
import { kUserTokenStorage } from '~/user'
import { FALLBACK_CONFIG, normalizeConfig, resolveBackendUrl } from './config'
import { findPresetInstanceCandidate, selectAutoCreatePresets, selectSupersededPresetModFiles, shouldRetireLegacyPresetInstance } from './presetInstance'
import { getPresetDefaults } from './presetDefaults'
import { MineLatinoWebWindows } from './webWindow'
import { checksum } from '~/util/fs'
import { normalizePublicServerAddress } from './competitionServers'
import { normalizeCosmeticsPlayer, normalizeEquippedCosmetics, selectPlayerAppearance } from './cosmeticsAppearance'
import { matchesPlaytimeAccount, sumInstancePlaytime } from './playtime'
import {
  DEFAULT_SHADER_PACKS,
  ManagedContentSyncGate,
  MANAGED_CONTENT_STATE_FILE,
  MANAGED_MINECRAFT_VERSIONS,
  managedResourcePackFileName,
  normalizeLauncherResourcePackManifest,
  disableManagedDefaultShader,
  updateResourcePackOptions,
  type LauncherResourcePack,
} from './managedContent'

/**
 * Feeds the MineLatino home screen.
 *
 * Everything runs in the main process, so browser CORS does not apply and the
 * Discord bot token never reaches the client — it stays in the backend. The
 * pattern is stale-while-revalidate: the copy cached on disk is returned
 * immediately, a refresh happens in the background, and the result is pushed to
 * the renderer through a service event. With no backend and no cache the bundled
 * `FALLBACK_CONFIG` keeps the screen usable, so a first launch offline shows
 * content instead of an error.
 */

/** How long a background refresh is skipped for, per feed. */
const NEWS_TTL_MS = 60_000
const UPDATES_TTL_MS = 60_000
const CONFIG_TTL_MS = 5 * 60_000
const PRESET_STATE_FILE = '.minelatino-preset.json'
/** The catalog changes rarely, so its categories and per-mode products last longer. */
const STORE_TTL_MS = 5 * 60_000
const STORE_PRODUCTS_TTL_MS = 5 * 60_000
/** Periodic refresh while the launcher stays open. */
const REFRESH_INTERVAL_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 15_000
const PLAYTIME_CHECKPOINT_INTERVAL_MS = 60_000
/** Avoid repeating a full version diagnosis while the selected profile is unchanged. */
const PREPARED_INSTANCE_TTL_MS = 10 * 60_000
const COSMETICS_API = (process.env.MINELATINO_COSMETICS_API || 'https://minelatino-cosmetics-production.up.railway.app').replace(/\/$/, '')
const COSMETICS_SECRET_SERVICE = 'MineLatino Cosmetics'
const COSMETICS_SECRET_ACCOUNT = 'player-session'
const COMPETITION_TELEMETRY_FILE = 'competition-telemetry.json'
const COMPETITION_TELEMETRY_REFRESH_MS = 24 * 60 * 60 * 1000
const MAX_COMPETITION_SERVERS = 200

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

interface TrackedPlaytimeSession {
  user: UserProfile
  token?: string
  opening?: Promise<string | undefined>
  timer?: NodeJS.Timeout
}

interface CompetitionTelemetryState {
  enabled: boolean
  installationId: string
  lastFingerprint: string
  lastSubmittedAt: number
  submitted: number
  pending: boolean
}

interface ManagedContentState {
  resourcePack?: { fileName: string, sha1: string }
  shaderPacks?: Array<{ fileName: string, sha1: string }>
  defaultShaderFile?: string
  shaderDefaultDisabled?: boolean
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Guards the renderer against a backend that is older than the launcher: an
 * item missing `images` or `embeds` would throw while rendering the feed.
 */
function normalizeNewsItem(raw: unknown): MineLatinoNewsItem | undefined {
  const source = asObject(raw)
  const id = asString(source.id)
  if (!id) return undefined
  const embeds = Array.isArray(source.embeds)
    ? source.embeds.map((raw): MineLatinoNewsEmbed => {
        const embed = asObject(raw)
        return {
          title: asString(embed.title) || undefined,
          description: asString(embed.description) || undefined,
          url: asString(embed.url) || undefined,
          color: typeof embed.color === 'number' ? embed.color : undefined,
          image: asString(embed.image) || undefined,
          thumbnail: asString(embed.thumbnail) || undefined,
          fields: Array.isArray(embed.fields)
            ? embed.fields.map((raw) => {
                const field = asObject(raw)
                return {
                  name: asString(field.name),
                  value: asString(field.value),
                  inline: field.inline === true,
                }
              })
            : [],
        }
      })
    : []
  return {
    id,
    author: asString(source.author),
    authorAvatar: asString(source.authorAvatar),
    timestamp: asString(source.timestamp),
    content: asString(source.content),
    images: asStringArray(source.images),
    embeds,
    url: asString(source.url),
    isAnnouncement: source.isAnnouncement === true,
  }
}

function normalizeUpdateItem(raw: unknown): MineLatinoUpdateItem | undefined {
  const source = asObject(raw)
  const id = asString(source.id)
  const link = asString(source.link)
  if (!id && !link) return undefined
  return {
    id: id || link,
    title: asString(source.title),
    date: asString(source.date),
    link,
    excerpt: asString(source.excerpt),
    image: asString(source.image) || undefined,
  }
}

function normalizeStoreCategory(raw: unknown): MineLatinoStoreCategory | undefined {
  const source = asObject(raw)
  const id = asNumber(source.id, Number.NaN)
  const name = asString(source.name)
  if (!Number.isFinite(id) || !name) return undefined
  return {
    id,
    name,
    slug: asString(source.slug),
    count: asNumber(source.count, 0),
    image: asString(source.image) || undefined,
  }
}

function normalizeStoreProduct(raw: unknown): MineLatinoStoreProduct | undefined {
  const source = asObject(raw)
  const id = asNumber(source.id, Number.NaN)
  const permalink = asString(source.permalink)
  if (!Number.isFinite(id) || !permalink) return undefined
  return {
    id,
    name: asString(source.name),
    slug: asString(source.slug),
    permalink,
    shortDescription: asString(source.shortDescription),
    image: asString(source.image) || undefined,
    priceText: asString(source.priceText),
    regularPriceText: asString(source.regularPriceText) || undefined,
    onSale: source.onSale === true,
    inStock: source.inStock !== false,
  }
}

@ExposeServiceKey(MineLatinoServiceKey)
export class MineLatinoService extends AbstractService implements IMineLatinoService {
  readonly #backendUrl = resolveBackendUrl()
  #config: MineLatinoConfig = FALLBACK_CONFIG
  #news: MineLatinoNewsResult = { items: [], fetchedAt: 0, stale: true, source: 'discord' }
  #updates: MineLatinoUpdatesResult = { items: [], fetchedAt: 0, stale: true, provider: 'none' }
  #store: MineLatinoStoreResult = { categories: [], fetchedAt: 0, stale: true }
  /** Per-category product pages, cached in memory (not persisted) on demand. */
  #storeProducts = new Map<number, MineLatinoStoreProductsResult>()
  #configFetchedAt = 0
  #refreshing: Promise<void> | undefined
  #defaultInstanceSync: Promise<void> | undefined
  #autoModsSync: Promise<void> | undefined
  #autoModInstanceSyncs = new Map<string, Promise<void>>()
  #managedContentInstanceSyncs = new Map<string, Promise<void>>()
  #managedContentSyncGate = new ManagedContentSyncGate()
  #launcherResourcePackManifest: { fetchedAt: number, items: Map<string, LauncherResourcePack> } | undefined
  #launcherResourcePackManifestFetch: Promise<Map<string, LauncherResourcePack> | undefined> | undefined
  #instancePreparations = new Map<string, Promise<void>>()
  #preparedInstances = new Map<string, { fingerprint: string, preparedAt: number }>()
  #timer: NodeJS.Timeout | undefined
  #windows: MineLatinoWebWindows
  #playtimeSessions = new Map<string, TrackedPlaytimeSession>()
  #cosmeticsSession: { token: string; account: MineLatinoCosmeticsAccount } | undefined
  #competitionTelemetry: CompetitionTelemetryState = {
    enabled: true,
    installationId: randomUUID(),
    lastFingerprint: '',
    lastSubmittedAt: 0,
    submitted: 0,
    pending: true,
  }
  #competitionTelemetrySync: Promise<MineLatinoCompetitionTelemetrySettings> | undefined

  constructor(@Inject(LauncherAppKey) app: LauncherApp) {
    super(app, async () => {
      await this.#restore()
      await this.#restoreCosmeticsSession()
      await this.#restoreCompetitionTelemetry()
      if (!this.#backendUrl) {
        this.warn('No MineLatino backend URL configured; running on the bundled fallback config. Set MINELATINO_BACKEND_URL or DEFAULT_BACKEND_URL in main/minelatino/config.ts.')
      }
      // Do not block boot on the network: the screen already has cached content.
      void this.#refresh()
      this.#timer = setInterval(() => { void this.#refresh() }, REFRESH_INTERVAL_MS)

      // Reconcile the launcher's historical total only after the player proves
      // the selected identity, then send server-measured checkpoints while
      // Minecraft remains open.
      const launchService = await this.app.registry.get(LaunchService)
      for (const pid of launchService.getProcesses()) this.#managedContentSyncGate.start(pid)
      launchService.registerMiddleware({
        name: 'MineLatino cosmetics account',
        onBeforeLaunch: async input => {
          await this.#syncManagedContentBeforeLaunch(input.gameDirectory)
          await this.#writeCosmeticsGameSession(input.gameDirectory)
          // Statistics never delay launch; a failed refresh is retried later.
          if (this.#competitionTelemetry.enabled || this.#competitionTelemetry.pending) void this.#syncCompetitionServers()
        },
      })
      launchService.on('minecraft-start', (options) => {
        this.#managedContentSyncGate.start(options.pid)
        const session: TrackedPlaytimeSession = {
          user: options.user,
        }
        session.timer = setInterval(() => {
          void this.#checkpointPlaytimeSession(session, false)
        }, PLAYTIME_CHECKPOINT_INTERVAL_MS)
        session.timer.unref()
        this.#playtimeSessions.set(options.launchId, session)
        void this.#ensurePlaytimeSession(session)
      })
      launchService.on('minecraft-exit', (options) => {
        const session = this.#playtimeSessions.get(options.launchId)
        this.#playtimeSessions.delete(options.launchId)
        if (session?.timer) clearInterval(session.timer)
        if (session) void this.#checkpointPlaytimeSession(session, true)
        if (this.#managedContentSyncGate.stop(options.pid)) {
          void this.#ensureDefaultInstanceThenSync()
        }
      })
      // A first launch without a reachable backend still uses the bundled
      // GatinoLauncher catalog. Start the same one-shot profile sync after
      // setup has selected the data root; a simultaneous backend refresh is
      // deduplicated by #defaultInstanceSync.
      void this.#ensureDefaultInstanceThenSync()
      if (this.#competitionTelemetry.enabled || this.#competitionTelemetry.pending) void this.#syncCompetitionServers(this.#competitionTelemetry.pending)
    })
    this.#windows = new MineLatinoWebWindows(
      message => this.log(message),
      windows => this.emit('webWindows', windows),
      url => this.app.shell.openInBrowser(url),
    )
    // Neither the refresh interval nor a third-party store window may outlive
    // the launcher. `registryDisposer` is the hook the other long-lived
    // services use for exactly this (see `pluginNetworkInterface`).
    this.app.registryDisposer(() => {
      if (this.#timer) clearInterval(this.#timer)
      this.#timer = undefined
      for (const session of this.#playtimeSessions.values()) {
        if (session.timer) clearInterval(session.timer)
        void this.#checkpointPlaytimeSession(session, false)
      }
      this.#playtimeSessions.clear()
      this.#windows.closeAll()
    })
  }

  #cachePath(name: string) {
    return join(this.app.appDataPath, 'minelatino', name)
  }

  async #restore() {
    const [cachedConfig, cachedNews, cachedUpdates, cachedStore] = await Promise.all([
      this.#readJson<{ fetchedAt: number, config: unknown }>('config.json'),
      this.#readJson<unknown>('news.json'),
      this.#readJson<unknown>('updates.json'),
      this.#readJson<unknown>('store.json'),
    ])

    if (cachedConfig) {
      this.#config = normalizeConfig(cachedConfig.config)
      this.#configFetchedAt = asNumber(cachedConfig.fetchedAt, 0)
    }

    const news = asObject(cachedNews)
    const newsItems = Array.isArray(news.items)
      ? news.items.map(normalizeNewsItem).filter((item): item is MineLatinoNewsItem => !!item)
      : undefined
    if (newsItems) {
      this.#news = {
        items: newsItems,
        fetchedAt: asNumber(news.fetchedAt, 0),
        // Anything restored from disk is by definition not fresh.
        stale: true,
        source: 'discord',
      }
    }

    const updates = asObject(cachedUpdates)
    const updateItems = Array.isArray(updates.items)
      ? updates.items.map(normalizeUpdateItem).filter((item): item is MineLatinoUpdateItem => !!item)
      : undefined
    if (updateItems) {
      this.#updates = {
        items: updateItems,
        fetchedAt: asNumber(updates.fetchedAt, 0),
        stale: true,
        provider: this.#config.updates.provider,
      }
    }

    const store = asObject(cachedStore)
    const categories = Array.isArray(store.categories)
      ? store.categories.map(normalizeStoreCategory).filter((c): c is MineLatinoStoreCategory => !!c)
      : undefined
    if (categories) {
      this.#store = {
        categories,
        fetchedAt: asNumber(store.fetchedAt, 0),
        stale: true,
      }
    }

    this.log(`Restored MineLatino cache: ${this.#news.items.length} news, ${this.#updates.items.length} updates, ${this.#store.categories.length} store categories`)
  }

  async #readJson<T>(name: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.#cachePath(name), 'utf-8')) as T
    }
    catch {
      // A missing or truncated cache is normal on first run.
      return undefined
    }
  }

  async #writeJson(name: string, data: unknown) {
    try {
      await outputJson(this.#cachePath(name), data, { spaces: 2 })
    }
    catch (error) {
      this.warn(`Failed to persist minelatino/${name}: ${(error as Error).message}`)
    }
  }

  async #request(path: string): Promise<{ ok: boolean, body: unknown }> {
    const response = await this.app.fetch(`${this.#backendUrl}${path}`, {
      headers: { 'User-Agent': this.app.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    // A 503 from our own backend still carries a usable stale payload, so the
    // body is read before the status is judged.
    const body = await response.json().catch(() => undefined)
    return { ok: response.ok, body }
  }

  #normalizeCosmeticsAccount(value: unknown): MineLatinoCosmeticsAccount | undefined {
    const account = asObject(value)
    const accountId = asString(account.accountId)
    const email = asString(account.email)
    const nick = asString(account.nick)
    const status = asString(account.status)
    if (!/^[a-f0-9]{32}$/.test(accountId) || !email || !/^[A-Za-z0-9_]{3,16}$/.test(nick)
      || !['active', 'suspended', 'deleted'].includes(status)) return undefined
    return {
      accountId,
      email,
      nick,
      status: status as MineLatinoCosmeticsAccount['status'],
      createdAt: asNumber(account.createdAt, 0),
      updatedAt: asNumber(account.updatedAt, 0),
      deletedAt: typeof account.deletedAt === 'number' ? account.deletedAt : null,
    }
  }

  #normalizeCosmeticOrder(value: unknown): MineLatinoCosmeticOrder | undefined {
    const order = asObject(value)
    const id = asString(order.id), cosmeticId = asString(order.cosmeticId), provider = asString(order.provider)
    const status = asString(order.status), amountMinor = asNumber(order.amountMinor, -1), currency = asString(order.currency)
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(cosmeticId)
      || !['manual', 'paypal', 'binance', 'mercadopago', 'free'].includes(provider)
      || !['pending', 'paid', 'cancelled'].includes(status) || !Number.isSafeInteger(amountMinor)
      || (provider === 'free' ? amountMinor !== 0 || status !== 'paid' : amountMinor <= 0)
      || !/^[A-Z]{3}$/.test(currency)) return undefined
    return {
      id, cosmeticId, cosmeticName: typeof order.cosmeticName === 'string' ? order.cosmeticName : null,
      provider: provider as MineLatinoCosmeticOrder['provider'], amountMinor, currency,
      status: status as MineLatinoCosmeticOrder['status'],
      paymentReference: typeof order.paymentReference === 'string' ? order.paymentReference : null,
      createdAt: asNumber(order.createdAt, 0), updatedAt: asNumber(order.updatedAt, 0),
      deliveredAt: typeof order.deliveredAt === 'number' ? order.deliveredAt : null,
      cancelledAt: typeof order.cancelledAt === 'number' ? order.cancelledAt : null,
    }
  }

  async #restoreCosmeticsSession() {
    try {
      const raw = await this.app.secretStorage.get(COSMETICS_SECRET_SERVICE, COSMETICS_SECRET_ACCOUNT)
      if (!raw) return
      const parsed = asObject(JSON.parse(raw))
      const account = this.#normalizeCosmeticsAccount(parsed.account)
      const token = asString(parsed.token)
      if (account && token.length >= 32) this.#cosmeticsSession = { token, account }
    } catch {
      this.#cosmeticsSession = undefined
    }
  }

  async #persistCosmeticsSession() {
    await this.app.secretStorage.put(
      COSMETICS_SECRET_SERVICE,
      COSMETICS_SECRET_ACCOUNT,
      this.#cosmeticsSession ? JSON.stringify(this.#cosmeticsSession) : '',
    )
  }

  async #restoreCompetitionTelemetry() {
    const stored = asObject(await this.#readJson<unknown>(COMPETITION_TELEMETRY_FILE))
    const installationId = asString(stored.installationId)
    const wasEnabled = stored.enabled === true
    this.#competitionTelemetry = {
      enabled: true,
      installationId: /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(installationId)
        ? installationId
        : randomUUID(),
      lastFingerprint: asString(stored.lastFingerprint),
      lastSubmittedAt: asNumber(stored.lastSubmittedAt, 0),
      submitted: Math.max(0, Math.floor(asNumber(stored.submitted, 0))),
      // Migrate installations that previously opted out so the first launch
      // after updating submits the current snapshot immediately.
      pending: stored.pending === true || !wasEnabled,
    }
    await this.#persistCompetitionTelemetry()
  }

  async #persistCompetitionTelemetry() {
    await outputJson(this.#cachePath(COMPETITION_TELEMETRY_FILE), this.#competitionTelemetry, { spaces: 2 })
  }

  #competitionTelemetrySettings(): MineLatinoCompetitionTelemetrySettings {
    return {
      enabled: this.#competitionTelemetry.enabled,
      submitted: this.#competitionTelemetry.submitted,
      pending: this.#competitionTelemetry.pending,
    }
  }

  async #collectCompetitionServers() {
    const instanceService = await this.app.registry.get(InstanceService)
    await instanceService.initialize()
    const getGameDataPath = await this.app.registry.get(kGameDataPath)
    const files = new Set([
      getGameDataPath('servers.dat'),
      ...Object.keys(instanceService.state.all).map(instancePath => join(instancePath, 'servers.dat')),
    ])
    const ownServer = normalizePublicServerAddress(`${this.#config.server.host}:${this.#config.server.port}`)
    const addresses = new Set<string>()
    for (const file of files) {
      try {
        for (const server of await readServerInfo(await readFile(file))) {
          const address = normalizePublicServerAddress(server.ip)
          if (address && address !== ownServer) addresses.add(address)
          if (addresses.size >= MAX_COMPETITION_SERVERS) break
        }
      } catch {
        // Missing and malformed server lists are ordinary and contain no data.
      }
      if (addresses.size >= MAX_COMPETITION_SERVERS) break
    }
    return [...addresses].sort()
  }

  #syncCompetitionServers(force = false): Promise<MineLatinoCompetitionTelemetrySettings> {
    if (this.#competitionTelemetrySync) return this.#competitionTelemetrySync
    this.#competitionTelemetrySync = (async () => {
      const servers = this.#competitionTelemetry.enabled ? await this.#collectCompetitionServers() : []
      const fingerprint = createHash('sha256').update(JSON.stringify(servers)).digest('hex')
      const recentlySubmitted = Date.now() - this.#competitionTelemetry.lastSubmittedAt < COMPETITION_TELEMETRY_REFRESH_MS
      if (!force && !this.#competitionTelemetry.pending
        && fingerprint === this.#competitionTelemetry.lastFingerprint && recentlySubmitted) {
        return this.#competitionTelemetrySettings()
      }
      this.#competitionTelemetry.pending = true
      await this.#persistCompetitionTelemetry()
      try {
        await this.#cosmeticsRequest('/v1/telemetry/competition-servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installationId: this.#competitionTelemetry.installationId, servers }),
        })
        this.#competitionTelemetry.lastFingerprint = fingerprint
        this.#competitionTelemetry.lastSubmittedAt = Date.now()
        this.#competitionTelemetry.submitted = servers.length
        this.#competitionTelemetry.pending = false
        await this.#persistCompetitionTelemetry()
      } catch (error) {
        this.warn(`Anonymous server statistics could not be refreshed: ${(error as Error).message}`)
      }
      return this.#competitionTelemetrySettings()
    })().finally(() => { this.#competitionTelemetrySync = undefined })
    return this.#competitionTelemetrySync
  }

  async getCompetitionTelemetrySettings(): Promise<MineLatinoCompetitionTelemetrySettings> {
    await this.initialize()
    return this.#competitionTelemetrySettings()
  }

  async setCompetitionTelemetryEnabled(enabled: boolean): Promise<MineLatinoCompetitionTelemetrySettings> {
    await this.initialize()
    if (this.#competitionTelemetrySync) await this.#competitionTelemetrySync
    this.#competitionTelemetry.enabled = enabled
    this.#competitionTelemetry.pending = true
    await this.#persistCompetitionTelemetry()
    return this.#syncCompetitionServers(true)
  }

  async #cosmeticsRequest(path: string, options: RequestInit = {}) {
    const response = await this.app.fetch(`${COSMETICS_API}${path}`, {
      ...options,
      headers: { Accept: 'application/json', 'User-Agent': this.app.userAgent, ...options.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const result = asObject(await response.json().catch(() => undefined))
    if (!response.ok) throw Object.assign(
      new Error(asString(result.error) || `Cosmetics API HTTP ${response.status}`),
      { status: response.status },
    )
    return result
  }

  /** Concurrent callers share one in-flight refresh. */
  #refresh(): Promise<void> {
    if (!this.#backendUrl) return Promise.resolve()
    if (!this.#refreshing) {
      this.#refreshing = Promise.all([
        this.#fetchConfig(),
        this.#fetchNews(),
        this.#fetchUpdates(),
        this.#fetchStore(),
      ]).then(() => {}, () => {}).finally(() => { this.#refreshing = undefined })
    }
    return this.#refreshing
  }

  async #fetchConfig() {
    try {
      const { ok, body } = await this.#request('/api/config')
      if (!ok) throw new Error(`GET /api/config responded ${body ? 'with an error' : 'without a body'}`)
      this.#config = normalizeConfig(body)
      this.#configFetchedAt = Date.now()
      await this.#writeJson('config.json', { fetchedAt: this.#configFetchedAt, config: this.#config })
      this.emit('config', this.#config)
      // After a config refresh, ensure autoMods are installed in matching
      // instances. Fire-and-forget: the sync runs in the background and logs
      // its own failures.
      void this.#ensureDefaultInstanceThenSync()
    }
    catch (error) {
      // The cached (or bundled) config stays in place; no event, no throw.
      this.warn(`MineLatino config refresh failed: ${(error as Error).message}`)
    }
  }

  async #fetchNews() {
    if (!this.#config.news.enabled) return
    try {
      const { ok, body } = await this.#request('/api/news')
      const source = asObject(body)
      const items = Array.isArray(source.items)
        ? source.items.map(normalizeNewsItem).filter((item): item is MineLatinoNewsItem => !!item)
        : undefined
      if (!items) throw new Error(asString(source.error) || 'GET /api/news returned no items')
      this.#news = {
        items,
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        source: 'discord',
        error: asString(source.error) || undefined,
      }
      await this.#writeJson('news.json', this.#news)
      this.emit('news', this.#news)
    }
    catch (error) {
      this.#news = { ...this.#news, stale: true, error: (error as Error).message }
      this.emit('news', this.#news)
      this.warn(`MineLatino news refresh failed: ${(error as Error).message}`)
    }
  }

  async #fetchUpdates() {
    if (!this.#config.updates.enabled) return
    try {
      const { ok, body } = await this.#request('/api/updates')
      const source = asObject(body)
      const items = Array.isArray(source.items)
        ? source.items.map(normalizeUpdateItem).filter((item): item is MineLatinoUpdateItem => !!item)
        : undefined
      if (!items) throw new Error(asString(source.error) || 'GET /api/updates returned no items')
      this.#updates = {
        items,
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        provider: this.#config.updates.provider,
        error: asString(source.error) || undefined,
      }
      await this.#writeJson('updates.json', this.#updates)
      this.emit('updates', this.#updates)
    }
    catch (error) {
      this.#updates = { ...this.#updates, stale: true, error: (error as Error).message }
      this.emit('updates', this.#updates)
      this.warn(`MineLatino updates refresh failed: ${(error as Error).message}`)
    }
  }

  async #fetchStore() {
    try {
      const { ok, body } = await this.#request('/api/store')
      const source = asObject(body)
      // An empty list is valid (catalog disabled or no categories yet); only a
      // non-array means the backend did not answer with a catalog at all.
      const categories = Array.isArray(source.categories)
        ? source.categories.map(normalizeStoreCategory).filter((c): c is MineLatinoStoreCategory => !!c)
        : undefined
      if (!categories) throw new Error(asString(source.error) || 'GET /api/store returned no categories')
      this.#store = {
        categories,
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        error: asString(source.error) || undefined,
      }
      await this.#writeJson('store.json', this.#store)
      this.emit('store', this.#store)
    }
    catch (error) {
      this.#store = { ...this.#store, stale: true, error: (error as Error).message }
      this.emit('store', this.#store)
      this.warn(`MineLatino store refresh failed: ${(error as Error).message}`)
    }
  }

  #isStale(fetchedAt: number, ttl: number) {
    return Date.now() - fetchedAt > ttl
  }

  async getConfig(force?: boolean): Promise<MineLatinoConfig> {
    await this.initialize()
    if (force) await this.#fetchConfig()
    else if (this.#isStale(this.#configFetchedAt, CONFIG_TTL_MS)) void this.#refresh()
    return this.#config
  }

  async getNews(force?: boolean): Promise<MineLatinoNewsResult> {
    await this.initialize()
    if (force) await this.#fetchNews()
    else if (this.#isStale(this.#news.fetchedAt, NEWS_TTL_MS)) void this.#refresh()
    return this.#news
  }

  async getUpdates(force?: boolean): Promise<MineLatinoUpdatesResult> {
    await this.initialize()
    if (force) await this.#fetchUpdates()
    else if (this.#isStale(this.#updates.fetchedAt, UPDATES_TTL_MS)) void this.#refresh()
    return this.#updates
  }

  async getStore(force?: boolean): Promise<MineLatinoStoreResult> {
    await this.initialize()
    if (force) await this.#fetchStore()
    else if (this.#isStale(this.#store.fetchedAt, STORE_TTL_MS)) void this.#fetchStore()
    return this.#store
  }

  async getStoreProducts(category: number, force?: boolean): Promise<MineLatinoStoreProductsResult> {
    await this.initialize()
    const cached = this.#storeProducts.get(category)
    if (!force && cached && !this.#isStale(cached.fetchedAt, STORE_PRODUCTS_TTL_MS)) return cached
    try {
      const { ok, body } = await this.#request(`/api/store/products?category=${category}`)
      const source = asObject(body)
      const items = Array.isArray(source.items)
        ? source.items.map(normalizeStoreProduct).filter((p): p is MineLatinoStoreProduct => !!p)
        : []
      const result: MineLatinoStoreProductsResult = {
        category,
        items,
        total: asNumber(source.total, items.length),
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        error: asString(source.error) || undefined,
      }
      this.#storeProducts.set(category, result)
      return result
    }
    catch (error) {
      // Serve the last good copy for this mode; only a first-time failure is empty.
      if (cached) {
        const stale: MineLatinoStoreProductsResult = { ...cached, stale: true, error: (error as Error).message }
        this.#storeProducts.set(category, stale)
        return stale
      }
      this.warn(`MineLatino store products refresh failed: ${(error as Error).message}`)
      return { category, items: [], total: 0, fetchedAt: 0, stale: true, error: (error as Error).message }
    }
  }

  async getBackendUrl(): Promise<string> {
    return this.#backendUrl
  }

  async getCosmeticsAccount(): Promise<MineLatinoCosmeticsAccount | undefined> {
    await this.initialize()
    if (!this.#cosmeticsSession) return undefined
    try {
      const result = await this.#cosmeticsRequest('/v1/account/me', {
        headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}` },
      })
      const account = this.#normalizeCosmeticsAccount(result.account)
      if (!account) throw new Error('Respuesta de cuenta inválida')
      this.#cosmeticsSession.account = account
      await this.#persistCosmeticsSession()
      return account
    } catch (error) {
      this.warn(`MineLatino cosmetics account could not refresh: ${(error as Error).message}`)
      if ([401, 403].includes((error as Error & { status?: number }).status ?? 0)) {
        this.#cosmeticsSession = undefined
        await this.#persistCosmeticsSession()
        return undefined
      }
      return this.#cosmeticsSession.account
    }
  }

  async getEquippedCosmetics(player?: MineLatinoCosmeticsPlayer): Promise<MineLatinoEquippedCosmetic[]> {
    await this.initialize()
    const identity = normalizeCosmeticsPlayer(player)
    if (identity.uuid || identity.name) {
      try {
        const query = new URLSearchParams()
        if (identity.uuid) query.set('uuids', identity.uuid)
        if (identity.name) query.set('names', identity.name)
        const appearance = await this.#cosmeticsRequest(`/v1/cosmetics/appearance?${query}`)
        return selectPlayerAppearance(appearance, identity)
      } catch (error) {
        this.warn(`MineLatino public cosmetics appearance could not refresh: ${(error as Error).message}`)
        const accountName = this.#cosmeticsSession?.account.nick.toLowerCase()
        if (!accountName || accountName !== identity.name.toLowerCase()) return []
      }
    }
    if (!this.#cosmeticsSession) return []
    const result = await this.#cosmeticsRequest('/v1/account/wardrobe', {
      headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}` },
    })
    if (!Array.isArray(result.equipped)) throw new Error('Equipamiento de cosméticos inválido')
    return normalizeEquippedCosmetics(result.equipped)
  }

  async #openCosmeticsAccount(path: string, input: MineLatinoAccountCredentials) {
    const result = await this.#cosmeticsRequest(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const account = this.#normalizeCosmeticsAccount(result.account)
    const token = asString(result.token)
    if (!account || token.length < 32) throw new Error('Respuesta de sesión inválida')
    this.#cosmeticsSession = { token, account }
    await this.#persistCosmeticsSession()
    return account
  }

  registerCosmeticsAccount(input: Required<MineLatinoAccountCredentials>) {
    return this.#openCosmeticsAccount('/v1/account/register', input)
  }

  loginCosmeticsAccount(input: MineLatinoAccountCredentials) {
    return this.#openCosmeticsAccount('/v1/account/login', input)
  }

  async requestCosmeticsPasswordReset(email: string): Promise<{ delivery: 'email' | 'support' }> {
    const result = await this.#cosmeticsRequest('/v1/account/password/forgot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    })
    return { delivery: result.delivery === 'email' ? 'email' : 'support' }
  }

  async resetCosmeticsPassword(input: { email: string; code: string; password: string }): Promise<void> {
    await this.#cosmeticsRequest('/v1/account/password/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })
  }

  async changeCosmeticsPassword(input: { currentPassword: string; password: string }): Promise<void> {
    await this.initialize()
    if (!this.#cosmeticsSession) throw new Error('Inicia sesión con tu cuenta MineLatino')
    await this.#cosmeticsRequest('/v1/account/password', {
      method: 'PUT', headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    this.#cosmeticsSession = undefined
    await this.#persistCosmeticsSession()
  }

  async updateCosmeticsAccount(input: { email?: string; nick?: string; currentPassword: string }) {
    await this.initialize()
    if (!this.#cosmeticsSession) throw new Error('Inicia sesión con tu cuenta MineLatino')
    const result = await this.#cosmeticsRequest('/v1/account/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const account = this.#normalizeCosmeticsAccount(result.account)
    if (!account) throw new Error('Respuesta de cuenta inválida')
    this.#cosmeticsSession.account = account
    await this.#persistCosmeticsSession()
    return account
  }

  async logoutCosmeticsAccount() {
    await this.initialize()
    const session = this.#cosmeticsSession
    this.#cosmeticsSession = undefined
    await this.#persistCosmeticsSession()
    if (session) await this.#cosmeticsRequest('/v1/account/logout-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => undefined)
  }

  async deleteCosmeticsAccount(currentPassword: string) {
    await this.initialize()
    if (!this.#cosmeticsSession) throw new Error('Inicia sesión con tu cuenta MineLatino')
    await this.#cosmeticsRequest('/v1/account/me', {
      method: 'DELETE', headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword }),
    })
    this.#cosmeticsSession = undefined
    await this.#persistCosmeticsSession()
  }

  async getCosmeticsPaymentProviders(): Promise<MineLatinoPaymentProvider[]> {
    const result = await this.#cosmeticsRequest('/v1/storefront/payments')
    if (!Array.isArray(result.providers)) throw new Error('Configuración de pagos inválida')
    return result.providers.map((value) => {
      const provider = asObject(value), id = asString(provider.id), name = asString(provider.name)
      if (!['manual', 'paypal', 'binance', 'mercadopago'].includes(id) || !name) throw new Error('Proveedor de pago inválido')
      return { id, name, enabled: provider.enabled === true,
        instructions: typeof provider.instructions === 'string' ? provider.instructions : null } as MineLatinoPaymentProvider
    })
  }

  async getCosmeticsOrders(): Promise<MineLatinoCosmeticOrder[]> {
    await this.initialize()
    if (!this.#cosmeticsSession) return []
    const result = await this.#cosmeticsRequest('/v1/account/orders', {
      headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}` },
    })
    if (!Array.isArray(result.items)) throw new Error('Historial de órdenes inválido')
    return result.items.map(value => this.#normalizeCosmeticOrder(value)).filter((value): value is MineLatinoCosmeticOrder => !!value)
  }

  async createCosmeticsOrder(input: { cosmeticId: string; provider: MineLatinoPaymentProvider['id']; idempotencyKey: string }) {
    await this.initialize()
    if (!this.#cosmeticsSession) throw new Error('Inicia sesión con tu cuenta MineLatino')
    const result = await this.#cosmeticsRequest('/v1/account/orders', {
      method: 'POST', headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const order = this.#normalizeCosmeticOrder(result.order)
    if (!order) throw new Error('La orden creada es inválida')
    return order
  }

  async claimFreeCosmetic(input: { cosmeticId: string; idempotencyKey: string }) {
    await this.initialize()
    if (!this.#cosmeticsSession) throw new Error('Inicia sesión con tu cuenta MineLatino')
    const result = await this.#cosmeticsRequest('/v1/account/free-claims', {
      method: 'POST', headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const order = this.#normalizeCosmeticOrder(result.order)
    if (!order || order.provider !== 'free') throw new Error('Respuesta de reclamación inválida')
    return order
  }

  async cancelCosmeticsOrder(orderId: string) {
    await this.initialize()
    if (!this.#cosmeticsSession) throw new Error('Inicia sesión con tu cuenta MineLatino')
    const result = await this.#cosmeticsRequest(`/v1/account/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    const order = this.#normalizeCosmeticOrder(result.order)
    if (!order) throw new Error('La orden actualizada es inválida')
    return order
  }

  async #writeCosmeticsGameSession(gameDirectory: string) {
    const configPath = join(gameDirectory, 'config', 'minelatino-cosmetics', 'config.json')
    const base = { backendUrl: COSMETICS_API }
    if (!this.#cosmeticsSession) {
      await outputJson(configPath, base, { spaces: 2 })
      return
    }
    try {
      const result = await this.#cosmeticsRequest('/v1/account/game-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.#cosmeticsSession.token}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const token = asString(result.token)
      if (token.length < 32) throw new Error('Token de juego inválido')
      await outputJson(configPath, {
        ...base,
        accountToken: token,
        accountId: this.#cosmeticsSession.account.accountId,
        accountExpiresAt: asNumber(result.expiresAt, Date.now() + 60 * 60 * 1000),
      }, { spaces: 2 })
    } catch (error) {
      this.warn(`MineLatino cosmetics game session could not be prepared: ${(error as Error).message}`)
      await outputJson(configPath, base, { spaces: 2 })
    }
  }

  async openWebWindow(options: MineLatinoWebWindowOptions): Promise<void> {
    await this.initialize()
    // Never let a config value open a privileged scheme in a launcher window.
    if (!/^https?:\/\//i.test(options.url)) {
      this.warn(`Refusing to open a non-http url in a web window: ${options.url}`)
      return
    }
    if (options.externalBrowser) {
      await this.app.shell.openInBrowser(options.url)
      return
    }
    this.#windows.open({
      id: options.id,
      title: options.title || this.#config.branding.name,
      url: options.url,
      injectCss: options.injectCss,
    })
  }

  async closeWebWindow(id: string): Promise<void> {
    await this.initialize()
    this.#windows.close(id)
  }

  async getWebWindows(): Promise<MineLatinoWebWindowInfo[]> {
    await this.initialize()
    return this.#windows.list()
  }

  async #getAggregateLocalPlaytime(): Promise<number> {
    const instanceService = await this.app.registry.get(InstanceService)
    await instanceService.initialize()
    let total = sumInstancePlaytime(Object.values(instanceService.state.all).map(instance => instance.playtime))

    // Superseded MineLatino presets are kept as hidden directories so worlds
    // remain recoverable. Their recorded hours still form part of the player's
    // launcher history even though InstanceService no longer lists them.
    const getGameDataPath = await this.app.registry.get(kGameDataPath)
    const managedRoot = getGameDataPath('instances')
    const hiddenNames = await readdir(managedRoot).catch(() => [])
    for (const name of hiddenNames) {
      if (!name.startsWith('.')) continue
      try {
        const instance = asObject(JSON.parse(await readFile(join(managedRoot, name, 'instance.json'), 'utf-8')))
        total += sumInstancePlaytime([instance.playtime])
      } catch {
        // Removed folders and unrelated hidden directories are not instances.
      }
    }
    return total
  }

  async #openPlaytimeSession(session: TrackedPlaytimeSession): Promise<string | undefined> {
    const { user } = session
    if (!this.#backendUrl || !user.selectedProfile) return
    const profile = user.profiles[user.selectedProfile]
    if (!profile?.name) return
    try {
      const localPlaytime = await this.#getAggregateLocalPlaytime()
      if (user.authority === AUTHORITY_DEV) {
        // An offline UUID is public and cannot prove identity. The backend
        // verifies the selected nickname against this signed-in account.
        await this.getCosmeticsAccount()
        const linked = this.#cosmeticsSession
        if (!linked || !matchesPlaytimeAccount(profile.name, linked.account.nick)) {
          this.warn('MineLatino offline playtime requires the matching MineLatino account session')
          return
        }
        const sessionResponse = await this.app.fetch(`${this.#backendUrl}/api/playtime/offline-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': this.app.userAgent,
            Authorization: `Bearer ${linked.token}` },
          body: JSON.stringify({ username: profile.name, localPlaytime }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (!sessionResponse.ok) {
          this.warn(`MineLatino offline playtime session rejected: HTTP ${sessionResponse.status}`)
          return
        }
        return asString(asObject(await sessionResponse.json()).token) || undefined
      }
      if (user.authority !== AUTHORITY_MICROSOFT) return
      const tokenStorage = await this.app.registry.get(kUserTokenStorage)
      const accessToken = await tokenStorage.get(user)
      if (!accessToken) return
      const challengeResponse = await this.app.fetch(`${this.#backendUrl}/api/playtime/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': this.app.userAgent },
        body: JSON.stringify({ username: profile.name }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!challengeResponse.ok) {
        this.warn(`MineLatino playtime challenge rejected: HTTP ${challengeResponse.status}`)
        return
      }
      const challenge = asObject(await challengeResponse.json())
      const challengeId = asString(challenge.challengeId)
      const serverId = asString(challenge.serverId)
      if (!challengeId || !serverId) return
      const joinResponse = await this.app.fetch('https://sessionserver.mojang.com/session/minecraft/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, selectedProfile: user.selectedProfile, serverId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!joinResponse.ok) {
        this.warn(`MineLatino premium playtime verification rejected: HTTP ${joinResponse.status}`)
        return
      }
      const sessionResponse = await this.app.fetch(`${this.#backendUrl}/api/playtime/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': this.app.userAgent },
        body: JSON.stringify({ challengeId, localPlaytime }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!sessionResponse.ok) {
        this.warn(`MineLatino playtime session rejected: HTTP ${sessionResponse.status}`)
        return
      }
      return asString(asObject(await sessionResponse.json()).token) || undefined
    } catch (err) {
      this.warn(`MineLatino playtime session could not start: ${(err as Error).message}`)
      return undefined
    }
  }

  #ensurePlaytimeSession(session: TrackedPlaytimeSession): Promise<string | undefined> {
    if (session.token) return Promise.resolve(session.token)
    if (session.opening) return session.opening
    session.opening = this.#openPlaytimeSession(session)
      .then((token) => {
        session.token = token
        return token
      })
      .finally(() => { session.opening = undefined })
    return session.opening
  }

  async #checkpointPlaytimeSession(session: TrackedPlaytimeSession, close: boolean, retry = true): Promise<void> {
    if (!this.#backendUrl) return
    const token = await this.#ensurePlaytimeSession(session)
    if (!token) return
    try {
      const response = await this.app.fetch(`${this.#backendUrl}/api/playtime/${close ? 'report' : 'checkpoint'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': this.app.userAgent },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok) {
        if (close) session.token = undefined
        return
      }
      if (response.status === 401 && retry) {
        session.token = undefined
        await this.#checkpointPlaytimeSession(session, close, false)
        return
      }
      this.warn(`MineLatino playtime ${close ? 'report' : 'checkpoint'} rejected: HTTP ${response.status}`)
    } catch (err) {
      if (retry) {
        await this.#checkpointPlaytimeSession(session, close, false)
        return
      }
      this.warn(`MineLatino playtime ${close ? 'report' : 'checkpoint'} failed: ${(err as Error).message}`)
    }
  }

  async getPlaytimeLeaderboard(): Promise<MineLatinoPlaytimeLeaderboardEntry[]> {
    try {
      const response = await this.app.fetch(`${COSMETICS_API}/v1/launcher/playtime-leaderboard`, {
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error(`Leaderboard request was rejected: HTTP ${response.status}`)
      const body = await response.json()
      const source = asObject(body)
      const items = Array.isArray(source.items) ? source.items : []
      return items
        .map((raw): MineLatinoPlaytimeLeaderboardEntry | undefined => {
          const entry = asObject(raw)
          const rank = asNumber(entry.rank, 0)
          const name = asString(entry.name)
          if (!rank || !name) return undefined
          return {
            rank,
            name,
            playtime: asNumber(entry.playtime, 0),
            updatedAt: asString(entry.updatedAt),
            recorded: entry.recorded !== false && (asNumber(entry.playtime, 0) > 0 || !!asString(entry.updatedAt)),
          }
        })
        .filter((e): e is MineLatinoPlaytimeLeaderboardEntry => !!e)
    } catch (err) {
      this.warn(`MineLatino leaderboard fetch failed: ${(err as Error).message}`)
      throw err
    }
  }

  /**
   * Determine which loader an instance uses, matching the autoMod vocabulary.
   * Returns undefined for vanilla or unknown loaders.
   */
  #instanceLoader(runtime: Record<string, unknown>): MineLatinoAutoModVersion['loader'] | undefined {
    if (runtime.fabricLoader || runtime.quiltLoader) return 'fabric'
    if (runtime.neoForged) return 'neoforge'
    if (runtime.forge) return 'forge'
    return undefined
  }

  /**
   * Read the JAR filenames already present in an instance's mods/ directory.
   * Keeps the original filename for case-sensitive filesystems and returns an
   * empty map when the directory does not exist or is unreadable.
   */
  async #instanceModFiles(instancePath: string): Promise<Map<string, string>> {
    try {
      const entries = await readdir(join(instancePath, 'mods'))
      return new Map(entries.filter(e => e.toLowerCase().endsWith('.jar')).map(e => [e.toLowerCase(), e]))
    } catch {
      return new Map()
    }
  }

  /**
   * Find the best matching autoMod version for an instance's MC version and
   * loader. Prefers the newest modVersion when multiple entries match.
   */
  #findMatchingVersion(
    mod: MineLatinoAutoMod,
    minecraft: string,
    loader: MineLatinoAutoModVersion['loader'],
  ): MineLatinoAutoModVersion | undefined {
    const matches = mod.versions.filter(
      v => v.loader === loader && v.minecraftVersions.includes(minecraft),
    )
    return matches.sort((a, b) => {
      const av = valid(a.modVersion), bv = valid(b.modVersion)
      return av && bv ? rcompare(av, bv) : b.modVersion.localeCompare(a.modVersion, undefined, { numeric: true })
    })[0]
  }

  #presetSignature(preset: MineLatinoPreset) {
    const defaults = getPresetDefaults(preset.id)
    return JSON.stringify({
      minecraftVersion: preset.minecraftVersion,
      loader: preset.loader,
      mods: preset.mods.map(mod => ({
        projectId: mod.projectId ?? '',
        version: mod.version ?? '',
        downloadUrl: mod.downloadUrl ?? '',
        sha1: mod.sha1 ?? '',
        fileName: mod.fileName ?? '',
        fileSize: mod.fileSize ?? 0,
      })),
      defaults: defaults?.signature ?? '',
    })
  }

  async #hasAppliedPreset(instancePath: string, preset: MineLatinoPreset) {
    try {
      const state = await this.#readPresetState(instancePath)
      return asString(state.id) === preset.id
        && asString(state.signature) === this.#presetSignature(preset)
    } catch {
      return false
    }
  }

  async #readPresetState(instancePath: string) {
    return asObject(JSON.parse(await readFile(join(instancePath, PRESET_STATE_FILE), 'utf8')))
  }

  async #markPresetApplied(instancePath: string, preset: MineLatinoPreset, managedFiles: string[]) {
    await outputJson(join(instancePath, PRESET_STATE_FILE), {
      id: preset.id,
      signature: this.#presetSignature(preset),
      managedFiles,
      appliedAt: new Date().toISOString(),
    }, { spaces: 2 })
  }

  async #applyPresetDefaults(preset: MineLatinoPreset, instancePath: string): Promise<boolean> {
    const defaults = getPresetDefaults(preset.id)
    if (!defaults) return true
    try {
      await Promise.all(defaults.files.map(file => outputFile(join(instancePath, file.path), file.content)))
      this.log(`[autoInstance] Applied ${defaults.files.length} GatinoLauncher defaults to ${instancePath}`)
      return true
    } catch (error) {
      this.warn(`[autoInstance] Failed to apply GatinoLauncher defaults: ${(error as Error).message}`)
      return false
    }
  }

  async #findPresetInstance(preset: MineLatinoPreset, instanceService: InstanceService) {
    const managed = Object.values(instanceService.state.all)
      .filter(instance => instanceService.isUnderManaged(instance.path))

    for (const instance of managed) {
      if (await this.#hasAppliedPreset(instance.path, preset)) return instance
    }

    return findPresetInstanceCandidate(
      preset,
      managed,
      path => instanceService.isUnderManaged(path),
      runtime => this.#instanceLoader(runtime),
    )
  }

  async #cleanupSupersededPresetMods(instancePath: string, managedFiles: string[]) {
    const previous = await this.#readPresetState(instancePath)
      .then(state => asStringArray(state.managedFiles))
      .catch(() => [])
    const existing = [...(await this.#instanceModFiles(instancePath)).values()]
    for (const file of selectSupersededPresetModFiles(existing, managedFiles, previous)) {
      await remove(join(instancePath, 'mods', file))
      this.log(`[autoInstance] Removed superseded preset mod ${file}`)
    }
  }

  /** Resolve and install the starter set declared by a preset. */
  async #installPresetMods(preset: MineLatinoPreset, instancePath: string): Promise<string[] | undefined> {
    if (preset.mods.length === 0) return []

    const resolved = await Promise.all(preset.mods.map(async (mod) => {
      if (mod.downloadUrl && mod.sha1 && mod.fileName) {
        return {
          source: 'direct' as const,
          file: {
            path: `mods/${mod.fileName}`,
            hashes: { sha1: mod.sha1 },
            downloads: [mod.downloadUrl],
            size: mod.fileSize,
          },
        }
      }
      if (!mod.projectId) return undefined
      try {
        const params = new URLSearchParams({
          game_versions: JSON.stringify([preset.minecraftVersion]),
          loaders: JSON.stringify([preset.loader]),
        })
        const response = await this.app.fetch(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(mod.projectId)}/version?${params}`,
          {
            headers: { 'User-Agent': this.app.userAgent, Accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        )
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = await response.json()
        const versions = Array.isArray(body)
          ? body.map(asObject).filter(version => asString(version.id))
          : []
        const selected = mod.version
          ? versions.find(version => asString(version.id) === mod.version || asString(version.version_number) === mod.version)
          : versions.find(version => version.featured === true && asString(version.version_type) === 'release')
            ?? versions.find(version => asString(version.version_type) === 'release')
            ?? versions[0]
        const versionId = asString(selected?.id)
        if (!versionId) throw new Error('no compatible release')
        return { source: 'modrinth' as const, projectId: mod.projectId, versionId }
      } catch (error) {
        this.warn(`[autoInstance] Could not resolve starter mod ${mod.projectId}: ${(error as Error).message}`)
        return undefined
      }
    }))

    const versions = resolved.filter((entry): entry is NonNullable<typeof entry> => !!entry)
    if (versions.length !== preset.mods.length) {
      this.warn(`[autoInstance] Resolved only ${versions.length}/${preset.mods.length} starter mods; retrying on the next refresh.`)
      return undefined
    }

    try {
      const modrinthVersions = versions.filter(
        (entry): entry is Extract<typeof entry, { source: 'modrinth' }> => entry.source === 'modrinth',
      )
      const directFiles = versions.filter(
        (entry): entry is Extract<typeof entry, { source: 'direct' }> => entry.source === 'direct',
      )
      const managedFiles: string[] = []
      if (modrinthVersions.length > 0) {
        const modsService = await this.app.registry.get(InstanceModsService)
        const paths = await modsService.installFromMarket({
          market: MarketType.Modrinth,
          version: modrinthVersions.map(({ versionId }) => ({ versionId })),
          instancePath,
        })
        managedFiles.push(...paths.map(path => basename(path)))
      }
      if (directFiles.length > 0) {
        const installService = await this.app.registry.get(InstanceInstallService)
        await installService.installInstanceFiles({
          path: instancePath,
          oldFiles: [],
          files: directFiles.map(entry => entry.file),
        })
        managedFiles.push(...directFiles.map(entry => basename(entry.file.path)))
      }
      await this.#cleanupSupersededPresetMods(instancePath, managedFiles)
      this.log(`[autoInstance] Installed ${versions.length}/${preset.mods.length} starter mods into ${instancePath}`)
      return managedFiles
    } catch (error) {
      // The instance and the cosmetics auto-mod are still useful if Modrinth is
      // temporarily unavailable. The catalog lets the player retry later.
      this.warn(`[autoInstance] Failed to install starter mods: ${(error as Error).message}`)
      return undefined
    }
  }

  /**
   * Ensure every auto-created profile exists after clean installs and launcher
   * upgrades. Existing unrelated profiles never suppress them. Older backends
   * that do not send `autoCreate` retain the former recommended-profile
   * behaviour.
   */
  #ensureDefaultInstanceThenSync(): Promise<void> {
    const wasDeferred = this.#managedContentSyncGate.deferred
    if (this.#managedContentSyncGate.deferIfRunning()) {
      if (!wasDeferred) {
        this.log('[managedContent] Minecraft is running; deferring background profile synchronization.')
      }
      return Promise.resolve()
    }
    if (!this.#defaultInstanceSync) {
      this.#defaultInstanceSync = this.#ensureDefaultInstanceThenSyncInternal()
        .finally(() => { this.#defaultInstanceSync = undefined })
    }
    return this.#defaultInstanceSync
  }

  async #ensureDefaultInstanceThenSyncInternal() {
    try {
      const instanceService = await this.app.registry.get(InstanceService)
      await instanceService.initialize()
      const presets = selectAutoCreatePresets(this.#config.presets)
      if (presets.length === 0) {
        this.warn('[autoInstance] No presets configured; skipping auto-creation.')
        return
      }

      await this.#retireLegacyPresetInstances(presets, instanceService)

      for (const preset of presets) {
        try {
          await this.#ensurePresetInstance(preset, instanceService)
        } catch (error) {
          this.warn(`[autoInstance] Failed to ensure "${preset.name}": ${(error as Error).message}`)
        }
      }
      await this.syncAutoMods()
      await this.#syncManagedContentForPresets(presets, instanceService)
    } catch (error) {
      this.warn(`[autoInstance] Failed to auto-create profiles: ${(error as Error).message}`)
      void this.syncAutoMods()
    }
  }

  /**
   * Remove the three obsolete MineLatino defaults from the visible catalog.
   * `deleteData=false` makes InstanceService rename each directory with a dot,
   * so worlds, options and player-added mods remain recoverable on disk.
   */
  async #retireLegacyPresetInstances(presets: MineLatinoPreset[], instanceService: InstanceService) {
    const activePresetIds = new Set(presets.map(preset => preset.id))
    const managed = Object.values(instanceService.state.all)
      .filter(instance => instanceService.isUnderManaged(instance.path))

    for (const instance of managed) {
      const presetStateId = await this.#readPresetState(instance.path)
        .then(state => asString(state.id))
        .catch(() => '')
      if (!shouldRetireLegacyPresetInstance(instance, presetStateId, activePresetIds)) continue
      await instanceService.deleteInstance(instance.path, false)
      this.log(`[autoInstance] Retired obsolete default profile ${instance.name}; data kept in a hidden directory.`)
    }
  }

  async #ensurePresetInstance(preset: MineLatinoPreset, instanceService: InstanceService) {
    const existing = await this.#findPresetInstance(preset, instanceService)
    if (existing) {
      if (!(await this.#hasAppliedPreset(existing.path, preset))) {
        this.log(`[autoInstance] Applying GatinoLauncher preset to existing profile at ${existing.path}`)
        const managedFiles = await this.#installPresetMods(preset, existing.path)
        if (managedFiles && await this.#applyPresetDefaults(preset, existing.path)) {
          await this.#markPresetApplied(existing.path, preset, managedFiles)
        }
      }
      return
    }

    this.log(`[autoInstance] Profile missing — creating "${preset.name}" (${preset.minecraftVersion} ${preset.loader})`)
    const runtime: {
      minecraft: string
      fabricLoader?: string
      quiltLoader?: string
      forge?: string
      neoForged?: string
    } = { minecraft: preset.minecraftVersion }
    const metadata = await this.app.registry.get(VersionMetadataService)
    if (preset.loaderVersion) {
      if (preset.loader === 'fabric') runtime.fabricLoader = preset.loaderVersion
      else if (preset.loader === 'quilt') runtime.quiltLoader = preset.loaderVersion
      else if (preset.loader === 'forge') runtime.forge = preset.loaderVersion
      else if (preset.loader === 'neoforge') runtime.neoForged = preset.loaderVersion
    } else if (preset.loader === 'fabric' || preset.loader === 'quilt') {
      const fabric = preset.loader === 'fabric'
      const loaderMetadata = fabric ? await metadata.getFabricVersions() : await metadata.getQuiltVersions()
      if (!loaderMetadata.gameVersions.includes(preset.minecraftVersion)) {
        this.warn(`[autoInstance] ${preset.loader} does not support Minecraft ${preset.minecraftVersion}; skipping.`)
        return
      }
      const loaderVersion = loaderMetadata.loaderVersions[0]?.version
      if (!loaderVersion) {
        this.warn(`[autoInstance] No ${preset.loader} loader version available; skipping.`)
        return
      }
      if (fabric) runtime.fabricLoader = loaderVersion
      else runtime.quiltLoader = loaderVersion
    } else if (preset.loader === 'forge') {
      const versions = await metadata.getForgeVersions(preset.minecraftVersion)
      const loaderVersion = versions.find(v => v.type === 'recommended')?.version ?? versions[0]?.version
      if (!loaderVersion) { this.warn(`[autoInstance] Forge does not support Minecraft ${preset.minecraftVersion}; skipping.`); return }
      runtime.forge = loaderVersion
    } else if (preset.loader === 'neoforge') {
      const versions = await metadata.getNeoForgedVersions(preset.minecraftVersion)
      const loaderVersion = versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
      if (!loaderVersion) { this.warn(`[autoInstance] NeoForge does not support Minecraft ${preset.minecraftVersion}; skipping.`); return }
      runtime.neoForged = loaderVersion
    }
    const path = await instanceService.createInstance({
      name: preset.name,
      description: preset.description ?? '',
      runtime,
      resourcepacks: true,
      shaderpacks: true,
    })
    this.log(`[autoInstance] Created instance at ${path}`)
    const managedFiles = await this.#installPresetMods(preset, path)
    if (managedFiles && await this.#applyPresetDefaults(preset, path)) {
      await this.#markPresetApplied(path, preset, managedFiles)
    }
  }

  async #fetchLauncherResourcePackManifest(): Promise<Map<string, LauncherResourcePack> | undefined> {
    const cached = this.#launcherResourcePackManifest
    if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL_MS) return cached.items
    if (!this.#launcherResourcePackManifestFetch) {
      this.#launcherResourcePackManifestFetch = (async () => {
        try {
          const response = await this.app.fetch(`${COSMETICS_API}/v1/launcher/resource-packs`, {
            headers: { 'User-Agent': this.app.userAgent, Accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const normalized = normalizeLauncherResourcePackManifest(await response.json())
          const base = new URL(`${COSMETICS_API}/`)
          const items = new Map<string, LauncherResourcePack>()
          for (const pack of normalized) {
            const download = new URL(pack.downloadUrl, base)
            if (download.origin !== base.origin) {
              this.warn(`[managedContent] Ignoring cross-origin resource pack URL for ${pack.minecraftVersion}`)
              continue
            }
            items.set(pack.minecraftVersion, { ...pack, downloadUrl: download.toString() })
          }
          this.#launcherResourcePackManifest = { fetchedAt: Date.now(), items }
          return items
        } catch (error) {
          this.warn(`[managedContent] Resource-pack manifest unavailable; keeping installed pack: ${(error as Error).message}`)
          return undefined
        }
      })().finally(() => { this.#launcherResourcePackManifestFetch = undefined })
    }
    return this.#launcherResourcePackManifestFetch
  }

  async #readManagedContentState(instancePath: string): Promise<ManagedContentState> {
    try {
      const source = asObject(JSON.parse(await readFile(join(instancePath, MANAGED_CONTENT_STATE_FILE), 'utf8')))
      const resourcePack = asObject(source.resourcePack)
      const shaderPacks = Array.isArray(source.shaderPacks)
        ? source.shaderPacks.map(asObject).map(item => ({ fileName: asString(item.fileName), sha1: asString(item.sha1) }))
          .filter(item => item.fileName && /^[a-f\d]{40}$/i.test(item.sha1))
        : []
      return {
        resourcePack: asString(resourcePack.fileName) && /^[a-f\d]{40}$/i.test(asString(resourcePack.sha1))
          ? { fileName: asString(resourcePack.fileName), sha1: asString(resourcePack.sha1) }
          : undefined,
        shaderPacks,
        defaultShaderFile: asString(source.defaultShaderFile) || undefined,
        shaderDefaultDisabled: source.shaderDefaultDisabled === true,
      }
    } catch {
      return {}
    }
  }

  async #isManagedContentProfile(instancePath: string, rawInstance: unknown): Promise<boolean> {
    const instance = asObject(rawInstance)
    const minecraft = asString(asObject(instance.runtime).minecraft)
    if (!MANAGED_MINECRAFT_VERSIONS.some(version => version === minecraft)) return false
    const presets = selectAutoCreatePresets(this.#config.presets)
      .filter(preset => preset.minecraftVersion === minecraft)
    if (presets.length === 0) return false
    const stateId = await this.#readPresetState(instancePath).then(state => asString(state.id)).catch(() => '')
    return presets.some(preset => preset.id === stateId || preset.name === asString(instance.name))
  }

  async #syncManagedContentBeforeLaunch(instancePath: string): Promise<void> {
    try {
      const instanceService = await this.app.registry.get(InstanceService)
      await instanceService.initialize()
      const instance = instanceService.state.all[instancePath]
      if (!instance || !(await this.#isManagedContentProfile(instancePath, instance))) return
      const installService = await this.app.registry.get(InstanceInstallService)
      await this.#syncManagedContentForInstance(instancePath, instance, installService)
    } catch (error) {
      this.warn(`[managedContent] Pre-launch synchronization failed; keeping current files: ${(error as Error).message}`)
    }
  }

  async #syncManagedContentForPresets(presets: MineLatinoPreset[], instanceService: InstanceService) {
    const manifest = (await this.#fetchLauncherResourcePackManifest()) ?? null
    const installService = await this.app.registry.get(InstanceInstallService)
    for (const preset of presets) {
      if (!MANAGED_MINECRAFT_VERSIONS.some(version => version === preset.minecraftVersion)) continue
      const instance = await this.#findPresetInstance(preset, instanceService)
      if (!instance) continue
      await this.#syncManagedContentForInstance(instance.path, instance, installService, manifest)
    }
  }

  #syncManagedContentForInstance(
    instancePath: string,
    rawInstance: unknown,
    installService: InstanceInstallService,
    suppliedManifest?: Map<string, LauncherResourcePack> | null,
  ): Promise<void> {
    const active = this.#managedContentInstanceSyncs.get(instancePath)
    if (active) return active
    const synchronization = (async () => {
      if (!(await this.#isManagedContentProfile(instancePath, rawInstance))) return
      const manifest = suppliedManifest === undefined
        ? ((await this.#fetchLauncherResourcePackManifest()) ?? null)
        : suppliedManifest
      await this.#syncManagedContentForInstanceInternal(instancePath, rawInstance, installService, manifest)
    })().finally(() => { this.#managedContentInstanceSyncs.delete(instancePath) })
    this.#managedContentInstanceSyncs.set(instancePath, synchronization)
    return synchronization
  }

  async #syncManagedContentForInstanceInternal(
    instancePath: string,
    rawInstance: unknown,
    installService: InstanceInstallService,
    manifest: Map<string, LauncherResourcePack> | null,
  ) {
    const minecraft = asString(asObject(asObject(rawInstance).runtime).minecraft)
    if (!MANAGED_MINECRAFT_VERSIONS.some(version => version === minecraft)) return
    const state = await this.#readManagedContentState(instancePath)

    try {
      const missingShaders = []
      for (const shader of DEFAULT_SHADER_PACKS) {
        const valid = await checksum(join(instancePath, 'shaderpacks', shader.fileName), 'sha1')
          .then(value => value.toLowerCase() === shader.sha1).catch(() => false)
        if (!valid) missingShaders.push({
          path: `shaderpacks/${shader.fileName}`,
          hashes: { sha1: shader.sha1 },
          downloads: [shader.downloadUrl],
          size: shader.fileSize,
        })
      }
      if (missingShaders.length > 0) {
        this.log(`[managedContent] Installing ${missingShaders.length} shaderpack(s) into ${asString(asObject(rawInstance).name) || instancePath}`)
        await installService.installInstanceFiles({ path: instancePath, oldFiles: [], files: missingShaders })
      }
      const expectedShaders = new Set(DEFAULT_SHADER_PACKS.map(shader => shader.fileName))
      for (const previous of state.shaderPacks ?? []) {
        if (!expectedShaders.has(previous.fileName)) await remove(join(instancePath, 'shaderpacks', previous.fileName))
      }
      const irisPath = join(instancePath, 'config', 'iris.properties')
      if (!state.shaderDefaultDisabled) {
        const iris = await readFile(irisPath, 'utf8').catch(() => '')
        const updated = disableManagedDefaultShader(iris, state.defaultShaderFile)
        if (updated !== iris) await outputFile(irisPath, updated)
        state.shaderDefaultDisabled = true
      }
      state.shaderPacks = DEFAULT_SHADER_PACKS.map(shader => ({ fileName: shader.fileName, sha1: shader.sha1 }))
      delete state.defaultShaderFile
    } catch (error) {
      this.warn(`[managedContent] Shaderpack update failed; keeping the previous set: ${(error as Error).message}`)
    }

    if (manifest) {
      const next = manifest.get(minecraft)
      const previous = state.resourcePack
      if (next) {
        const fileName = managedResourcePackFileName(next)
        try {
          const valid = await checksum(join(instancePath, 'resourcepacks', fileName), 'sha1')
            .then(value => value.toLowerCase() === next.sha1).catch(() => false)
          if (!valid) {
            await installService.installInstanceFiles({ path: instancePath, oldFiles: [], files: [{
              path: `resourcepacks/${fileName}`,
              hashes: { sha1: next.sha1 },
              downloads: [next.downloadUrl],
              size: next.fileSize,
            }] })
          }
          const optionsPath = join(instancePath, 'options.txt')
          const options = await readFile(optionsPath, 'utf8').catch(() => '')
          await outputFile(optionsPath, updateResourcePackOptions(options, fileName, previous?.fileName))
          if (previous?.fileName && previous.fileName !== fileName) {
            await remove(join(instancePath, 'resourcepacks', previous.fileName))
          }
          state.resourcePack = { fileName, sha1: next.sha1 }
          this.log(`[managedContent] Resource pack revision ${next.revision} ready for Minecraft ${minecraft}`)
        } catch (error) {
          this.warn(`[managedContent] Resource-pack update failed; keeping the previous version: ${(error as Error).message}`)
        }
      } else if (previous) {
        const optionsPath = join(instancePath, 'options.txt')
        const options = await readFile(optionsPath, 'utf8').catch(() => '')
        await outputFile(optionsPath, updateResourcePackOptions(options, undefined, previous.fileName))
        await remove(join(instancePath, 'resourcepacks', previous.fileName))
        delete state.resourcePack
      }
    }

    await outputJson(join(instancePath, MANAGED_CONTENT_STATE_FILE), state, { spaces: 2 })
  }

  /**
   * Ensure every matching instance has the latest autoMods installed.
   *
   * Runs after each config refresh so a backend operator can push a new mod
   * version and every player's launcher picks it up within minutes. Also called
   * right after instance creation so a brand-new profile gets the mod
   * immediately instead of waiting for the next refresh cycle.
   *
   * The check is fast when nothing is missing: it only reads the mods/
   * directory listing and compares file names. Downloads happen only when a JAR
   * is absent or an older version is detected. The installer downloads and
   * verifies the replacement in its workspace first. Only after that succeeds
   * are older versions removed from the mods/ directory.
   */
  syncAutoMods(): Promise<void> {
    if (!this.#autoModsSync) {
      this.#autoModsSync = this.#syncAutoModsInternal().finally(() => { this.#autoModsSync = undefined })
    }
    return this.#autoModsSync
  }

  async #syncAutoModsInternal(): Promise<void> {
    const autoMods = this.#config.autoMods
    if (!autoMods || autoMods.length === 0) return

    const instanceService = await this.app.registry.get(InstanceService)
    await instanceService.initialize()
    const installService = await this.app.registry.get(InstanceInstallService)
    await this.#syncAutoModsForInstances(
      Object.entries(instanceService.state.all),
      installService,
    )
  }

  async #syncAutoModsForInstances(
    instances: Array<[string, unknown]>,
    installService: InstanceInstallService,
  ): Promise<void> {
    const autoMods = this.#config.autoMods
    if (!autoMods || autoMods.length === 0) return

    for (const [instancePath, rawInstance] of instances) {
      await this.#syncAutoModsForInstance(instancePath, rawInstance, installService)
    }
  }

  /**
   * Serialize auto-mod work per profile, without making a foreground launch
   * wait for the unrelated profiles in the periodic all-profile sweep.
   */
  #syncAutoModsForInstance(
    instancePath: string,
    rawInstance: unknown,
    installService: InstanceInstallService,
  ): Promise<void> {
    const active = this.#autoModInstanceSyncs.get(instancePath)
    if (active) return active

    const synchronization = this.#syncAutoModsForInstanceInternal(instancePath, rawInstance, installService)
      .finally(() => { this.#autoModInstanceSyncs.delete(instancePath) })
    this.#autoModInstanceSyncs.set(instancePath, synchronization)
    return synchronization
  }

  async #syncAutoModsForInstanceInternal(
    instancePath: string,
    rawInstance: unknown,
    installService: InstanceInstallService,
  ): Promise<void> {
    const autoMods = this.#config.autoMods
    if (!autoMods || autoMods.length === 0) return

    const instance = asObject(rawInstance)
    const runtime = asObject(instance.runtime)
    if (!runtime) return
    const minecraft = asString(runtime.minecraft)
    const loader = this.#instanceLoader(runtime)
    if (!minecraft || !loader) return

    const existingMods = await this.#instanceModFiles(instancePath)

    for (const mod of autoMods) {
      const match = this.#findMatchingVersion(mod, minecraft, loader)
      if (!match) continue

      const expectedFile = match.fileName.toLowerCase()
      const prefix = `${mod.id}-${loader}-${minecraft}-`
      const oldFiles = [...existingMods.entries()].filter(([file]) =>
        file !== expectedFile && file.startsWith(prefix) && file.endsWith('.jar'))
        .map(([, originalName]) => originalName)

      // Build an InstanceFile for the transactional download pipeline. It uses
      // a separate workspace and validates SHA-1 before committing this path.
      const instanceFile = {
        path: `mods/${match.fileName}`,
        hashes: { sha1: match.sha1 },
        downloads: [match.downloadUrl],
        size: match.fileSize || undefined,
      }

      const existingName = existingMods.get(expectedFile)
      const existingValid = existingName
        ? (await checksum(join(instancePath, 'mods', existingName), 'sha1').catch(() => '')).toLowerCase() === match.sha1.toLowerCase()
        : false
      if (!existingValid) {
        try {
          this.log(`[autoMods] Downloading and verifying ${mod.name} ${match.modVersion} for ${asString(instance.name) || instancePath}`)
          await installService.installInstanceFiles({
            path: instancePath,
            oldFiles: [],
            files: [instanceFile],
          })
          existingMods.set(expectedFile, match.fileName)
          this.log(`[autoMods] Installed ${match.fileName}; old versions can now be removed`)
        } catch (err) {
          // Keep every old JAR untouched when download, size/hash validation,
          // or the final transactional commit fails.
          this.warn(`[autoMods] Failed to install ${mod.name}; keeping the previous version: ${(err as Error).message}`)
          continue
        }
      }

      // The expected JAR is now present. Cleanup happens afterwards, and a
      // failed cleanup is retried on the next sync instead of risking no mod.
      for (const file of oldFiles) {
        try {
          await remove(join(instancePath, 'mods', file))
          existingMods.delete(file.toLowerCase())
          this.log(`[autoMods] Removed old ${file} from ${asString(instance.name) || instancePath}`)
        } catch (err) {
          this.warn(`[autoMods] Failed to remove old ${file}: ${(err as Error).message}`)
        }
      }
    }
  }

  /**
   * Stable description of everything this service owns for a prepared
   * profile. A backend auto-mod update changes the fingerprint immediately,
   * while unrelated news/store refreshes do not invalidate useful work.
   */
  #preparationFingerprint(rawInstance: unknown): string {
    const instance = asObject(rawInstance)
    const runtime = asObject(instance.runtime)
    const minecraft = asString(runtime.minecraft)
    const loader = this.#instanceLoader(runtime)
    const autoMods = loader
      ? this.#config.autoMods.flatMap((mod) => {
          const match = this.#findMatchingVersion(mod, minecraft, loader)
          return match ? [`${mod.id}:${match.fileName}:${match.sha1}`] : []
        }).sort()
      : []
    return JSON.stringify({
      version: asString(instance.version),
      runtime: Object.entries(runtime).sort(([a], [b]) => a.localeCompare(b)),
      autoMods,
    })
  }

  /**
   * Downloads the selected profile's heavy dependencies ahead of Play.
   *
   * Jobs are keyed by profile path, so the selection watcher, repeated UI
   * renders and a near-simultaneous Play click all await the same operation.
   * Successful work is cached briefly; launch-time validation remains the
   * final safety net if a player edits files outside the launcher afterwards.
   */
  prepareInstance(instancePath: string): Promise<void> {
    const normalizedPath = instancePath.trim()
    if (!normalizedPath) return Promise.resolve()
    const active = this.#instancePreparations.get(normalizedPath)
    if (active) return active

    const preparation = this.#prepareInstanceInternal(normalizedPath)
      .finally(() => { this.#instancePreparations.delete(normalizedPath) })
    this.#instancePreparations.set(normalizedPath, preparation)
    return preparation
  }

  async #prepareInstanceInternal(instancePath: string): Promise<void> {
    const instanceService = await this.app.registry.get(InstanceService)
    const initial = instanceService.state.all[instancePath]
    if (!initial || asString((initial as Record<string, unknown>).edition) === 'bedrock') return

    const initialFingerprint = this.#preparationFingerprint(initial)
    const cached = this.#preparedInstances.get(instancePath)
    if (
      cached?.fingerprint === initialFingerprint
      && Date.now() - cached.preparedAt < PREPARED_INSTANCE_TTL_MS
    ) return

    const initialRecord = initial as unknown as Record<string, unknown>
    const requestedRuntime = { ...asObject(initialRecord.runtime) }
    const requestedVersion = asString(initialRecord.version) || undefined
    this.log(`[prepare] Preparing selected profile ${asString(initialRecord.name) || instancePath}`)

    const versionInstallService = await this.app.registry.get(VersionInstallService)
    const installed = await versionInstallService.installInstance({
      type: 'instance',
      instancePath,
      runtime: requestedRuntime,
      selectedVersion: requestedVersion,
    } as Parameters<VersionInstallService['installInstance']>[0])

    const latest = instanceService.state.all[instancePath]
    if (!latest) return
    const latestRecord = latest as unknown as Record<string, unknown>
    const latestRuntime = asObject(latestRecord.runtime)
    const runtimeUnchanged = Object.entries(requestedRuntime).every(
      ([key, value]) => latestRuntime[key] === value,
    )
    if (asString(latestRecord.version) !== (requestedVersion ?? '') || !runtimeUnchanged) {
      this.warn(`[prepare] Profile changed while preparing; leaving the new selection untouched: ${instancePath}`)
      return
    }
    if (asString(latestRecord.version) !== installed.version) {
      await instanceService.editInstance({ instancePath, version: installed.version })
    }

    // Only await this profile. A periodic all-profile sweep can continue in the
    // background, while the per-profile lock still prevents duplicate writes.
    const installService = await this.app.registry.get(InstanceInstallService)
    await this.#syncAutoModsForInstance(instancePath, instanceService.state.all[instancePath], installService)
    await this.#syncManagedContentForInstance(instancePath, instanceService.state.all[instancePath], installService)

    const prepared = instanceService.state.all[instancePath]
    if (prepared) {
      this.#preparedInstances.set(instancePath, {
        fingerprint: this.#preparationFingerprint(prepared),
        preparedAt: Date.now(),
      })
    }
    this.log(`[prepare] Selected profile is ready: ${instancePath}`)
  }
}
