import { GenericEventEmitter } from '../events'
import { ServiceKey } from './Service'

/**
 * Contract for the MineLatino home screen.
 *
 * Every value here is served by the MineLatino backend (`launcher-backend/`) so
 * the server address, store URL, branding and enabled features can change
 * without shipping a new installer. The shapes mirror
 * `launcher-backend/src/types.ts`; keep the two in sync. Additive changes are
 * safe, renames are not, because the launcher may be running against an older
 * backend.
 */

export type MineLatinoLoader = 'vanilla' | 'fabric' | 'neoforge' | 'forge' | 'quilt'

export type MineLatinoAuthMode = 'microsoft' | 'offline'

export type MineLatinoUpdatesProvider = 'wordpress' | 'json' | 'none'

export interface MineLatinoLink {
  label: string
  url: string
  /** Material icon name rendered by the launcher. */
  icon?: string
}

export interface MineLatinoBranding {
  name: string
  tagline: string
  logoUrl?: string
  backgroundUrl?: string
  /** CSS colour used for accents, e.g. `#f5a623`. */
  accentColor?: string
}

export interface MineLatinoServerConfig {
  name: string
  /** Empty when the backend has not been given a real address yet. */
  host: string
  port: number
  /** Geyser/Bedrock port, used only to build the `minecraft://` deep link. */
  bedrockPort?: number
  /** 64x64 png as a data URI or URL, written into the instance `servers.dat`. */
  icon?: string
  /** When true the launcher passes `--quickPlayMultiplayer host:port`. */
  autoJoin: boolean
  /**
   * Whether non-premium (offline) accounts are offered. Only meaningful when
   * the server is `online-mode=false` or runs a hybrid auth plugin.
   */
  allowOffline: boolean
  /** Modrinth project ids the server needs; the launcher warns before Play. */
  requiredMods?: string[]
}

export interface MineLatinoPresetMod {
  /** Modrinth project id or slug, e.g. `sodium`. */
  projectId: string
  /** Pin a version; omit to take the newest one compatible with the loader. */
  version?: string
}

export interface MineLatinoPreset {
  /** Stable key reused as the instance name so it is created only once. */
  id: string
  name: string
  description?: string
  minecraftVersion: string
  loader: MineLatinoLoader
  /** Omit to let the launcher pick the newest loader for the MC version. */
  loaderVersion?: string
  mods: MineLatinoPresetMod[]
  /** Material icon name shown on the preset card. */
  icon?: string
  /** The preset the Play button offers when the player has no profile yet. */
  recommended?: boolean
}

export interface MineLatinoStoreConfig {
  url: string
  /** Stores that reject embedded webviews can be forced into the system browser. */
  openInExternalBrowser: boolean
  /** Extra windows shown next to the store button (vote, wiki, map...). */
  tabs: MineLatinoLink[]
}

export interface MineLatinoConfig {
  schemaVersion: number
  branding: MineLatinoBranding
  server: MineLatinoServerConfig
  store: MineLatinoStoreConfig
  news: {
    enabled: boolean
    limit: number
    /** Discord invite link shown next to the news feed. */
    inviteUrl?: string
  }
  updates: {
    enabled: boolean
    limit: number
    provider: MineLatinoUpdatesProvider
    /** Optional human label, e.g. the name of the website section. */
    sourceLabel?: string
    /**
     * Send "Leer m\u00e1s" to the system browser instead of an in-launcher window.
     * Useful when the website rejects embedded webviews.
     */
    openInExternalBrowser?: boolean
  }
  auth: {
    modes: MineLatinoAuthMode[]
  }
  /** Ready-made instances offered as "Crear perfil MineLatino". */
  presets: MineLatinoPreset[]
  links: MineLatinoLink[]
  maintenance: {
    enabled: boolean
    message: string
  }
  /** Launcher versions below this are told to update before playing. */
  minLauncherVersion: string
  /** Mods the launcher auto-installs into every matching instance. */
  autoMods: MineLatinoAutoMod[]
}

/**
 * A mod the launcher installs automatically into every matching instance.
 * Unlike presets (which only apply at creation time and resolve from Modrinth),
 * autoMods are direct-download JARs placed into existing and new instances
 * whose Minecraft version and loader match.
 */
export interface MineLatinoAutoMod {
  id: string
  name: string
  versions: MineLatinoAutoModVersion[]
}

export interface MineLatinoAutoModVersion {
  modVersion: string
  minecraftVersions: string[]
  loader: 'fabric' | 'forge' | 'neoforge'
  downloadUrl: string
  sha1: string
  fileName: string
  fileSize: number
}

export interface MineLatinoNewsEmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface MineLatinoNewsEmbed {
  title?: string
  description?: string
  url?: string
  /** Discord embed colour as a 24-bit integer. */
  color?: number
  image?: string
  thumbnail?: string
  fields: MineLatinoNewsEmbedField[]
}

export interface MineLatinoNewsItem {
  id: string
  author: string
  authorAvatar: string
  /** ISO-8601 timestamp. */
  timestamp: string
  content: string
  /** Direct URLs of image attachments. */
  images: string[]
  embeds: MineLatinoNewsEmbed[]
  /** `https://discord.com/channels/<guild>/<channel>/<message>` */
  url: string
  /** True when the message was published from an announcement channel. */
  isAnnouncement: boolean
}

export interface MineLatinoNewsResult {
  items: MineLatinoNewsItem[]
  /** Epoch ms of the moment the data was fetched from Discord. */
  fetchedAt: number
  /**
   * True when the backend or Discord failed and this is the last known copy.
   * The home screen renders a "sin conexión" badge instead of an error.
   */
  stale: boolean
  source: 'discord'
  error?: string
}

export interface MineLatinoUpdateItem {
  id: string
  title: string
  /** ISO-8601 timestamp. */
  date: string
  link: string
  excerpt: string
  image?: string
}

export interface MineLatinoUpdatesResult {
  items: MineLatinoUpdateItem[]
  fetchedAt: number
  stale: boolean
  provider: MineLatinoUpdatesProvider
  error?: string
}

/** One top-level shop category (a game mode) the catalog's first level offers. */
export interface MineLatinoStoreCategory {
  id: number
  name: string
  slug: string
  /** Number of products under this category. */
  count: number
  image?: string
}

/**
 * One product. `permalink` is the shop page opened in a launcher window when the
 * player picks it; prices are pre-formatted by the backend.
 */
export interface MineLatinoStoreProduct {
  id: number
  name: string
  slug: string
  permalink: string
  shortDescription: string
  image?: string
  /** Formatted current price, e.g. `$499`. Empty when the product has none. */
  priceText: string
  /** Formatted pre-discount price, present only when it differs from `priceText`. */
  regularPriceText?: string
  onSale: boolean
  inStock: boolean
}

export interface MineLatinoStoreResult {
  categories: MineLatinoStoreCategory[]
  fetchedAt: number
  /** True when the backend or shop failed and this is the last known copy. */
  stale: boolean
  error?: string
}

export interface MineLatinoStoreProductsResult {
  /** The category these products belong to. */
  category: number
  items: MineLatinoStoreProduct[]
  /** Full product count for the category, which may exceed `items.length`. */
  total: number
  fetchedAt: number
  stale: boolean
  error?: string
}

export interface MineLatinoCosmeticsAccount {
  accountId: string
  email: string
  nick: string
  status: 'active' | 'suspended' | 'deleted'
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface MineLatinoAccountCredentials {
  email: string
  password: string
  nick?: string
}

export interface MineLatinoPaymentProvider {
  id: 'manual' | 'paypal' | 'binance' | 'mercadopago'
  name: string
  enabled: boolean
  instructions: string | null
}

export interface MineLatinoCosmeticOrder {
  id: string
  cosmeticId: string
  cosmeticName: string | null
  provider: MineLatinoPaymentProvider['id']
  amountMinor: number
  currency: string
  status: 'pending' | 'paid' | 'cancelled'
  paymentReference: string | null
  createdAt: number
  updatedAt: number
  deliveredAt: number | null
  cancelledAt: number | null
}

export interface MineLatinoWebWindowOptions {
  /** Reused when the window is already open, so a second click focuses it. */
  id: string
  title?: string
  url: string
  /** Force the system browser for stores that refuse embedded webviews. */
  externalBrowser?: boolean
  /**
   * Extra stylesheet injected into the page, re-applied on every navigation
   * so a site that re-renders keeps honouring it. Used to show only part of a
   * page (e.g. the assistant chat without its navbar/footer).
   *
   * Ignored when `externalBrowser` is set, since the system browser owns the
   * page and nothing can be injected into it.
   */
  injectCss?: string
}

export interface MineLatinoWebWindowInfo {
  id: string
  title: string
  url: string
}

/**
 * One entry in the playtime leaderboard, served by the backend's
 * `GET /api/playtime/leaderboard`.
 */
export interface MineLatinoPlaytimeLeaderboardEntry {
  rank: number
  name: string
  /** Total playtime in milliseconds. */
  playtime: number
  updatedAt: string
}

/**
 * Fired when a background refresh produces new data, so the home screen updates
 * without a manual reload.
 */
export interface MineLatinoServiceEventMap {
  'config': MineLatinoConfig
  'news': MineLatinoNewsResult
  'updates': MineLatinoUpdatesResult
  'store': MineLatinoStoreResult
  'webWindows': MineLatinoWebWindowInfo[]
}

export interface MineLatinoService extends GenericEventEmitter<MineLatinoServiceEventMap> {
  /**
   * The launcher configuration. Returns the copy cached on disk when the
   * backend is unreachable, and the bundled default when there is no cache
   * either, so the home screen always has something to render.
   */
  getConfig(force?: boolean): Promise<MineLatinoConfig>

  /** Latest Discord announcements. Never rejects: falls back to the cache. */
  getNews(force?: boolean): Promise<MineLatinoNewsResult>

  /** Latest website publications. Never rejects: falls back to the cache. */
  getUpdates(force?: boolean): Promise<MineLatinoUpdatesResult>

  /**
   * The shop catalog's top-level categories (game modes). Never rejects: falls
   * back to the cache, and an empty list means "show only the store link".
   */
  getStore(force?: boolean): Promise<MineLatinoStoreResult>

  /**
   * The products under one category, fetched on demand when the player picks a
   * game mode. Never rejects: falls back to whatever the backend returned last.
   */
  getStoreProducts(category: number, force?: boolean): Promise<MineLatinoStoreProductsResult>

  /** The backend this launcher talks to, shown in diagnostics. */
  getBackendUrl(): Promise<string>

  /**
   * Opens the store (or any configured tab) in its own window. A real
   * `BrowserWindow` is used rather than an iframe because stores send
   * `X-Frame-Options` and would render blank; it also lets payments and
   * 3-D Secure redirects work.
   */
  openWebWindow(options: MineLatinoWebWindowOptions): Promise<void>

  closeWebWindow(id: string): Promise<void>

  getWebWindows(): Promise<MineLatinoWebWindowInfo[]>

  /**
   * Fetches the playtime leaderboard from the backend. Never rejects: returns
   * an empty array on failure.
   */
  getPlaytimeLeaderboard(): Promise<MineLatinoPlaytimeLeaderboardEntry[]>

  /**
   * Ensures every matching instance has the latest autoMods installed.
   * Called automatically after each config refresh and can also be triggered
   * manually (e.g. right after creating a new instance).
   */
  syncAutoMods(): Promise<void>

  getCosmeticsAccount(): Promise<MineLatinoCosmeticsAccount | undefined>
  registerCosmeticsAccount(input: Required<MineLatinoAccountCredentials>): Promise<MineLatinoCosmeticsAccount>
  loginCosmeticsAccount(input: MineLatinoAccountCredentials): Promise<MineLatinoCosmeticsAccount>
  requestCosmeticsPasswordReset(email: string): Promise<{ delivery: 'email' | 'support' }>
  resetCosmeticsPassword(input: { email: string; code: string; password: string }): Promise<void>
  changeCosmeticsPassword(input: { currentPassword: string; password: string }): Promise<void>
  updateCosmeticsAccount(input: { email?: string; nick?: string; currentPassword: string }): Promise<MineLatinoCosmeticsAccount>
  deleteCosmeticsAccount(currentPassword: string): Promise<void>
  logoutCosmeticsAccount(): Promise<void>
  getCosmeticsPaymentProviders(): Promise<MineLatinoPaymentProvider[]>
  getCosmeticsOrders(): Promise<MineLatinoCosmeticOrder[]>
  createCosmeticsOrder(input: { cosmeticId: string; provider: MineLatinoPaymentProvider['id']; idempotencyKey: string }): Promise<MineLatinoCosmeticOrder>
  cancelCosmeticsOrder(orderId: string): Promise<MineLatinoCosmeticOrder>
}

export const MineLatinoServiceKey: ServiceKey<MineLatinoService> = 'MineLatinoService'
