import type { ModFile } from '@/util/mod'
import type {
  MineLatinoConfig,
  MineLatinoLink,
  MineLatinoNewsResult,
  MineLatinoService,
  MineLatinoServiceEventMap,
  MineLatinoStoreProduct,
  MineLatinoStoreProductsResult,
  MineLatinoStoreResult,
  MineLatinoUpdateItem,
  MineLatinoUpdatesResult,
  MineLatinoWebWindowInfo,
} from '@xmcl/runtime-api'
import { AUTHORITY_DEV, AUTHORITY_MICROSOFT, MineLatinoServiceKey } from '@xmcl/runtime-api'
import { useLocalStorage } from '@vueuse/core'
import { InjectionKey, computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { useService } from './service'

export const kMineLatino: InjectionKey<ReturnType<typeof useMineLatino>> = Symbol('kMineLatino')

// Shown before the first response lands, and whenever the backend has never
// been reachable. `stale: true` makes the UI render the "sin conexión" badge
// instead of an empty state that looks like a bug.
const EMPTY_NEWS: MineLatinoNewsResult = {
  items: [],
  fetchedAt: 0,
  stale: true,
  source: 'discord',
}
const EMPTY_UPDATES: MineLatinoUpdatesResult = {
  items: [],
  fetchedAt: 0,
  stale: true,
  provider: 'none',
}
const EMPTY_STORE: MineLatinoStoreResult = {
  categories: [],
  fetchedAt: 0,
  stale: true,
}

/** The window id the store button reuses, so a second click focuses it. */
const STORE_WINDOW_ID = 'minelatino-store'

/**
 * Whether a config carries anything worth the dedicated MineLatino surfaces
 * (hub, store, feeds).
 *
 * Shared by the home hub's own visibility and the first-run routing decision in
 * `windows/main/Context.ts`, so the two can never disagree: a launcher that
 * routes to the hub must also render it, and one that hides the hub must fall
 * back to the stock instances page. The bundled `FALLBACK_CONFIG` already
 * satisfies this (store url + server host + updates feed), so a branded build
 * shows the hub even before the backend is reached, while a stripped config
 * keeps the upstream `/me` experience.
 */
export function isMineLatinoConfigured(config?: MineLatinoConfig): boolean {
  if (!config) return false
  return !!config.store.url
    || config.news.enabled
    || config.updates.enabled
    || config.links.length > 0
    || !!config.server.host
}

/**
 * Subscribe to a typed service event for the lifetime of the calling
 * component. Detaching on unmount keeps zombie listeners from piling up while
 * the player navigates away from the home screen.
 */
function useServiceEvent<K extends keyof MineLatinoServiceEventMap>(
  service: MineLatinoService,
  event: K,
  listener: (payload: MineLatinoServiceEventMap[K]) => void,
) {
  onMounted(() => { service.on(event, listener) })
  onUnmounted(() => { service.removeListener(event, listener) })
}

/** The MineLatino server a launch may join and/or list in `servers.dat`. */
export interface MineLatinoLaunchServer {
  host: string
  /**
   * Omitted for 25565, which both `--quickPlayMultiplayer` and `servers.dat`
   * already treat as the default.
   */
  port?: number
  /** Display name of the `servers.dat` row. */
  name: string
  /** Bare base64 PNG for the `servers.dat` row, when the config supplied one. */
  icon?: string
  /**
   * When false the entry still lands in `servers.dat` so the server shows up in
   * the multiplayer list, but launching does not join it directly.
   */
  autoJoin: boolean
}

/**
 * `servers.dat` stores the icon as a bare base64 PNG. The config may instead
 * carry an `http(s)` URL, which that file format cannot express, so a URL
 * yields no icon rather than a row the game would fail to decode.
 */
function normalizeServerIcon(icon?: string): string | undefined {
  const value = icon?.trim()
  if (!value) return undefined
  const dataUri = /^data:image\/[\w+.-]+;base64,(.+)$/i.exec(value)
  if (dataUri) return dataUri[1]
  // Any other scheme (http, https, file...) is unusable here.
  if (/^[\w+\-.]+:\/\//i.test(value)) return undefined
  return value
}

/**
 * The MineLatino server for the instance about to launch, or `undefined` when
 * the backend has not been given a real address yet.
 *
 * Kept outside `useMineLatino()` on purpose: the launch funnel
 * (`composables/instanceLaunch.ts`) is not a component, so it has no
 * `onMounted` to subscribe in. `getConfig()` is served from the main process's
 * in-memory copy, so this costs one IPC round-trip per launch and never blocks
 * on the network.
 *
 * `LaunchService` turns `host`/`port` into both `--quickPlayMultiplayer` (1.20+)
 * and `--server`/`--port` (1.19 and older). Minecraft logs and ignores whichever
 * pair it does not understand, so one override spans every version.
 */
export async function getAutoJoinServer(
  service: MineLatinoService,
): Promise<MineLatinoLaunchServer | undefined> {
  try {
    const { host, port, name, icon, autoJoin } = (await service.getConfig()).server
    // A placeholder host must never reach the command line or `servers.dat`.
    if (!host) return undefined
    const entry: MineLatinoLaunchServer = { host, name: name || host, autoJoin }
    if (port && port !== 25565) entry.port = port
    const normalizedIcon = normalizeServerIcon(icon)
    if (normalizedIcon) entry.icon = normalizedIcon
    return entry
  }
  catch {
    // Auto-join is a convenience. A dead IPC channel must not stop the player
    // from launching the game.
    return undefined
  }
}

/**
 * The non-premium caveat is surfaced once. Remembering the dismissal in
 * `localStorage` stops it nagging on every login while still showing it again
 * after the player clears their launcher data.
 */
const offlineWarningDismissed = useLocalStorage('minelatinoOfflineWarningDismissed', false)

/**
 * The MineLatino config, kept fresh for the lifetime of the calling component.
 *
 * Shared by the two policy consumers that live outside the home screen's
 * subtree — the login form and the required-mods dialog — where nothing
 * provides `kMineLatino` and `injection()` would throw. The config is read
 * during setup rather than in `onMounted` so the first paint already reflects
 * the operator's policy instead of flashing the unfiltered state for a frame.
 */
export function useMineLatinoConfig() {
  const service = useService(MineLatinoServiceKey)
  const config = shallowRef<MineLatinoConfig | undefined>()

  const apply = (next: MineLatinoConfig) => { config.value = next }
  service.getConfig().then(apply).catch(() => {})
  useServiceEvent(service, 'config', apply)

  return config
}

/**
 * Whether `mod` satisfies one entry of `server.requiredMods`.
 *
 * Operators write whatever they recognise into that list — a Modrinth project
 * id, a slug (`sodium`) or a plain mod id — so every identity XMCL already
 * extracted from the jar is accepted. Matching loosely in one direction is safe:
 * the worst case is a warning that stays hidden, never a false alarm blocking
 * the launch.
 */
function satisfiesRequiredMod(mod: ModFile, required: string) {
  const needle = required.trim().toLowerCase()
  if (!needle) return false
  if (mod.modrinth?.projectId.toLowerCase() === needle) return true
  if (mod.modId.toLowerCase() === needle) return true
  if (mod.name.toLowerCase() === needle) return true
  // `sodium-0.6.0+mc1.21.1.jar` must still satisfy a `sodium` requirement.
  const fileName = mod.fileName.toLowerCase().replace(/\.(jar|zip)$/, '')
  return fileName === needle || fileName.startsWith(`${needle}-`)
}

/**
 * The `server.requiredMods` entries no enabled mod satisfies.
 *
 * Disabled mods do not count: the game will not load them, so the server would
 * still reject the player.
 */
export function findMissingRequiredMods(
  requiredMods: readonly string[] | undefined,
  mods: readonly ModFile[],
) {
  if (!requiredMods || requiredMods.length === 0) return []
  return requiredMods.filter(r => !mods.some(m => m.enabled && satisfiesRequiredMod(m, r)))
}

/**
 * The account policy the operator configured: which login types are offered,
 * and the one-time warning that goes with non-premium ones.
 */
export function useMineLatinoAuth() {
  const config = useMineLatinoConfig()

  /**
   * Whether the login form may offer `authority`.
   *
   * Only the two built-in modes `auth.modes` has vocabulary for are judged.
   * Mojang and third-party yggdrasil services fall through to XMCL's own
   * `useAllowThirdparty` rules untouched.
   */
  function isAuthorityAllowed(authority: string) {
    if (authority !== AUTHORITY_MICROSOFT && authority !== AUTHORITY_DEV) return true
    const modes = config.value?.auth.modes
    // No config yet means "no opinion". An empty list is read the same way
    // rather than as "nobody may log in", which would lock the player out of the
    // launcher entirely because of a misconfigured backend.
    if (!modes || modes.length === 0) return true
    if (authority === AUTHORITY_DEV) {
      // `allowOffline` is a server-side gate, not a launcher preference: unless
      // the server runs `online-mode=false` or a hybrid auth plugin,
      // non-premium players are rejected with "Failed to verify username".
      return modes.includes('offline') && (config.value?.server.allowOffline ?? false)
    }
    return modes.includes('microsoft')
  }

  /**
   * Only worth showing when offline accounts are actually on offer, so a
   * premium-only deployment never nags about a mode it does not expose.
   */
  const showOfflineWarning = computed(
    () => !!config.value?.server.allowOffline && !offlineWarningDismissed.value,
  )

  function dismissOfflineWarning() {
    offlineWarningDismissed.value = true
  }

  return { isAuthorityAllowed, showOfflineWarning, dismissOfflineWarning }
}

/**
 * Holds the MineLatino home-screen state.
 *
 * All fetching happens in the Electron main process (see
 * `xmcl-electron-app/main/minelatino/`), which is what makes browser CORS
 * irrelevant and keeps the Discord bot token off the client. The service is
 * stale-while-revalidate, so the first `get*` call resolves immediately with
 * whatever is cached on disk and freshness arrives through the events below.
 */
export function useMineLatino() {
  const service = useService(MineLatinoServiceKey)

  const config = shallowRef<MineLatinoConfig | undefined>()
  const news = shallowRef<MineLatinoNewsResult>(EMPTY_NEWS)
  const updates = shallowRef<MineLatinoUpdatesResult>(EMPTY_UPDATES)
  const storeCatalog = shallowRef<MineLatinoStoreResult>(EMPTY_STORE)
  /** Products per selected category id, kept so switching back is instant. */
  const storeProducts = shallowRef<Record<number, MineLatinoStoreProductsResult>>({})
  const selectedStoreCategory = shallowRef<number | null>(null)
  const storeLoading = shallowRef(false)
  const storeProductsLoading = shallowRef(false)
  const webWindows = shallowRef<MineLatinoWebWindowInfo[]>([])
  const isValidating = shallowRef(false)
  const backendUrl = shallowRef('')

  useServiceEvent(service, 'config', (fresh) => { config.value = fresh })
  useServiceEvent(service, 'news', (fresh) => { news.value = fresh })
  useServiceEvent(service, 'updates', (fresh) => { updates.value = fresh })
  useServiceEvent(service, 'store', (fresh) => { storeCatalog.value = fresh })
  useServiceEvent(service, 'webWindows', (fresh) => { webWindows.value = fresh })

  /**
   * Pulls every feed. The service never rejects — it falls back to its disk
   * cache and marks the payload `stale` — so the only failure mode left here
   * is the IPC channel itself dying.
   */
  async function mutate() {
    isValidating.value = true
    try {
      const [nextConfig, nextNews, nextUpdates, nextStore] = await Promise.all([
        service.getConfig(),
        service.getNews(),
        service.getUpdates(),
        service.getStore(),
      ])
      config.value = nextConfig
      news.value = nextNews
      updates.value = nextUpdates
      storeCatalog.value = nextStore
    } finally {
      isValidating.value = false
    }
  }

  onMounted(() => {
    mutate()
    service.getBackendUrl().then((url) => { backendUrl.value = url }).catch(() => {})
    service.getWebWindows().then((list) => { webWindows.value = list }).catch(() => {})
  })

  const branding = computed(() => config.value?.branding)
  const server = computed(() => config.value?.server)
  const store = computed(() => config.value?.store)
  const presets = computed(() => config.value?.presets ?? [])
  const links = computed(() => config.value?.links ?? [])
  const maintenance = computed(() => config.value?.maintenance)

  /**
   * Backend-driven accent colour, or `undefined` so every consumer falls back
   * to the launcher's own theme primary.
   *
   * It is handed to Vuetify's `color` prop (which accepts any CSS colour, see
   * `StoreProjectGallery`) and to the `--ml-accent` custom property, rather
   * than written into the theme, so rebranding cannot leak into other views.
   */
  const accentColor = computed(() => branding.value?.accentColor || undefined)

  /** The preset the Play button offers when the player has no profile yet. */
  const recommendedPreset = computed(() => presets.value.find(p => p.recommended) ?? presets.value[0])

  const newsEnabled = computed(() => config.value?.news.enabled ?? true)
  const updatesEnabled = computed(() => config.value?.updates.enabled ?? true)
  const newsInviteUrl = computed(() => config.value?.news.inviteUrl ?? '')
  /** Overrides the panel title with the name of the website section. */
  const updatesSourceLabel = computed(() => config.value?.updates.sourceLabel ?? '')
  const updatesInBrowser = computed(() => config.value?.updates.openInExternalBrowser ?? false)

  /** Auto-join needs a real address; a placeholder host must not be passed on. */
  const autoJoinAddress = computed(() => {
    const host = server.value?.host ?? ''
    if (!host) return ''
    const port = server.value?.port
    // 25565 is the default, and `--quickPlayMultiplayer` accepts a bare host.
    return port && port !== 25565 ? `${host}:${port}` : host
  })
  const canAutoJoin = computed(() => !!server.value?.autoJoin && !!autoJoinAddress.value)

  /**
   * Bedrock players cannot be launched from a Java launcher, so the best the
   * home screen can do is hand them the official deep link.
   */
  const bedrockDeepLink = computed(() => {
    const host = server.value?.host
    if (!host) return ''
    const port = server.value?.bedrockPort ?? 19132
    const name = server.value?.name || 'MineLatino'
    return `minecraft://?addExternalServer=${encodeURIComponent(name)}|${encodeURIComponent(`${host}:${port}`)}`
  })

  const hasStore = computed(() => !!store.value?.url)
  const storeTabs = computed(() => store.value?.tabs ?? [])
  const isStoreOpen = computed(() => webWindows.value.some(w => w.id === STORE_WINDOW_ID))

  /** The catalog's first level: the shop's top-level game-mode categories. */
  const storeCategories = computed(() => storeCatalog.value.categories)
  /** Products of the selected mode; empty until one is chosen. */
  const selectedStoreProducts = computed(() => {
    const id = selectedStoreCategory.value
    return id == null ? [] : storeProducts.value[id]?.items ?? []
  })
  /** The selected mode's full result (total/stale/error) for its header. */
  const selectedStoreProductsResult = computed(() => {
    const id = selectedStoreCategory.value
    return id == null ? undefined : storeProducts.value[id]
  })

  /**
   * Three random shop products for the home carousel's third page.
   *
   * Kept in its own ref on purpose: rolling it through `selectedStoreCategory`
   * would yank the Tienda screen's selection to a category the player never
   * picked. The roll samples up to three random categories (the main process
   * caches each one) and then shuffles their products, so the page shows a
   * varied slice of the shop instead of always the first category's items.
   */
  const featuredProducts = shallowRef<MineLatinoStoreProduct[]>([])
  async function refreshFeatured() {
    const categories = storeCatalog.value.categories
    if (categories.length === 0) {
      featuredProducts.value = []
      return
    }
    const sample = [...categories].sort(() => Math.random() - 0.5).slice(0, 3)
    const results = await Promise.all(sample.map(c => service.getStoreProducts(c.id).catch(() => undefined)))
    featuredProducts.value = results
      .flatMap(r => r?.items ?? [])
      .sort(() => Math.random() - 0.5)
      .slice(0, 6)
  }

  /**
   * Whether the backend handed over anything worth a dedicated home section.
   * Delegates to `isMineLatinoConfigured` so the hub's own visibility and the
   * first-run routing in `Context.ts` stay in lockstep.
   */
  const isConfigured = computed(() => isMineLatinoConfigured(config.value))

  // Roll the carousel's products once the catalog first lands (disk cache or
  // network). Watching the length keeps a later background refresh from
  // reshuffling the page under the player's eyes.
  watch(() => storeCatalog.value.categories.length, (len) => {
    if (len > 0 && featuredProducts.value.length === 0) void refreshFeatured()
  }, { immediate: true })

  /**
   * The window title follows the backend's brand name.
   *
   * This lives in the renderer rather than the main process because Electron
   * replaces the `BrowserWindow` title with the document title as soon as the
   * page loads, so a `win.setTitle()` from `main` would only be overwritten
   * again. `src/index.html` carries the same default for the frames shown
   * before the config arrives, and an unconfigured launcher keeps that
   * default rather than renaming itself.
   */
  watch(() => branding.value?.name, (name) => {
    if (name && isConfigured.value) document.title = name
  }, { immediate: true })

  function openInBrowser(url: string) {
    if (!url) return
    window.open(url, 'browser')
  }

  /**
   * Opens the store in its own `BrowserWindow`. A real window rather than an
   * iframe because stores send `X-Frame-Options`/`frame-ancestors` and would
   * render blank, and because payments plus 3-D Secure redirects need to
   * navigate freely.
   */
  async function openStore() {
    const url = store.value?.url
    if (!url) return
    if (store.value?.openInExternalBrowser) {
      openInBrowser(url)
      return
    }
    await service.openWebWindow({
      id: STORE_WINDOW_ID,
      title: server.value?.name || branding.value?.name || 'MineLatino',
      url,
    })
  }

  /** Extra windows from `store.tabs` (vote, wiki, map, Discord...). */
  async function openTab(link: MineLatinoLink) {
    if (!link.url) return
    const id = `minelatino-tab-${link.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'link'}`
    await service.openWebWindow({ id, title: link.label, url: link.url })
  }

  async function closeStore() {
    await service.closeWebWindow(STORE_WINDOW_ID)
  }

  /**
   * "Leer más" on a changelog entry. Opens inside the launcher unless the
   * operator set `updates.openInExternalBrowser`, which is the escape hatch for
   * sites that refuse embedded webviews.
   */
  async function openUpdate(item: MineLatinoUpdateItem) {
    if (!item.link) return
    if (updatesInBrowser.value) {
      openInBrowser(item.link)
      return
    }
    await service.openWebWindow({
      id: `minelatino-update-${item.id}`,
      title: item.title,
      url: item.link,
    })
  }

  /** Copies the server address (or the Bedrock deep link) for the player. */
  function copyText(value: string) {
    if (!value) return false
    windowController.writeClipboard(value)
    return true
  }

  function refreshNews() {
    return service.getNews(true).then((result) => { news.value = result }).catch(() => {})
  }

  function refreshUpdates() {
    return service.getUpdates(true).then((result) => { updates.value = result }).catch(() => {})
  }

  /** Re-pull the catalog's categories (the manual refresh on the Tienda screen). */
  function refreshStore() {
    storeLoading.value = true
    return service.getStore(true)
      .then((result) => { storeCatalog.value = result })
      .catch(() => {})
      .finally(() => { storeLoading.value = false })
  }

  /**
   * Selecting a game mode shows its products. The first selection fetches them
   * (the main process caches per category too); switching back is instant.
   */
  function selectStoreCategory(id: number) {
    selectedStoreCategory.value = id
    if (storeProducts.value[id]) return Promise.resolve()
    storeProductsLoading.value = true
    return service.getStoreProducts(id)
      .then((result) => { storeProducts.value = { ...storeProducts.value, [id]: result } })
      .catch(() => {})
      .finally(() => { storeProductsLoading.value = false })
  }

  /**
   * Opens a product's shop page in its own window (or the system browser when
   * the operator forced external), reusing the store's web-window pool.
   */
  function openProduct(product: MineLatinoStoreProduct) {
    if (!product.permalink) return
    if (store.value?.openInExternalBrowser) {
      openInBrowser(product.permalink)
      return
    }
    void service.openWebWindow({
      id: `minelatino-product-${product.id}`,
      title: product.name,
      url: product.permalink,
    })
  }

  return {
    // state
    config,
    news,
    updates,
    storeCatalog,
    storeProducts,
    selectedStoreCategory,
    storeLoading,
    storeProductsLoading,
    webWindows,
    isValidating,
    backendUrl,
    // derived
    branding,
    server,
    store,
    presets,
    links,
    maintenance,
    accentColor,
    recommendedPreset,
    newsEnabled,
    updatesEnabled,
    newsInviteUrl,
    updatesSourceLabel,
    updatesInBrowser,
    autoJoinAddress,
    canAutoJoin,
    bedrockDeepLink,
    hasStore,
    storeTabs,
    isStoreOpen,
    storeCategories,
    selectedStoreProducts,
    selectedStoreProductsResult,
    featuredProducts,
    isConfigured,
    // actions
    mutate,
    refreshNews,
    refreshUpdates,
    refreshStore,
    selectStoreCategory,
    openProduct,
    openStore,
    closeStore,
    openTab,
    openUpdate,
    openInBrowser,
    copyText,
  }
}

/**
 * "hace 3 min" style label for the news cards.
 *
 * `Intl.RelativeTimeFormat` is used instead of a hand-rolled table so the
 * wording follows whatever locale the player picked in settings.
 */
export function useRelativeTime() {
  const { locale } = useI18n()
  // Re-rendered once a minute; without a tick the labels would freeze at
  // whatever they were when the card first mounted.
  const now = shallowRef(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => { now.value = Date.now() }, 60_000)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  function from(iso: string) {
    const time = Date.parse(iso)
    if (Number.isNaN(time)) return ''
    const diff = (time - now.value) / 1000
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['year', 60 * 60 * 24 * 365],
      ['month', 60 * 60 * 24 * 30],
      ['day', 60 * 60 * 24],
      ['hour', 60 * 60],
      ['minute', 60],
    ]
    try {
      const format = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
      for (const [unit, seconds] of units) {
        if (Math.abs(diff) >= seconds || unit === 'minute') {
          return format.format(Math.round(diff / seconds), unit)
        }
      }
    } catch {
      // Fall through to the absolute date below.
    }
    try {
      return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(time))
    } catch {
      return new Date(time).toISOString().slice(0, 10)
    }
  }

  /** Full date used as the `title` tooltip next to the relative label. */
  function absolute(iso: string) {
    const time = Date.parse(iso)
    if (Number.isNaN(time)) return ''
    try {
      return new Intl.DateTimeFormat(locale.value, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(time))
    } catch {
      return new Date(time).toISOString()
    }
  }

  return { from, absolute, locale }
}
