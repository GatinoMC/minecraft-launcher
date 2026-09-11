<!--
  MineLatino "Clasificaciones" screen: tabs for the staff-site ranking and the
  playtime leaderboard.

  The "Ranking" tab loads `staff.minelatino.net/clasificacion` in an inline
  Electron `<webview>` (not an iframe) because the site answers with
  `X-Frame-Options: DENY` / CSP `frame-ancestors 'self'`. The webview is a
  top-level guest WebContents that ignores those framing headers. `insertCSS()`
  on `dom-ready` hides the site's own chrome (global navbar + footer) so ONLY
  the ranking is visible and interactive.

  The "Horas jugadas" tab fetches the playtime leaderboard from the backend
  and renders a styled list with the top 50 players.
-->
<template>
  <div
    class="ml-class flex flex-col gap-3 p-4"
    data-testid="minelatino-clasificaciones-screen"
  >
    <div class="ml-class-head flex flex-grow-0 items-center gap-3">
      <v-icon size="22" :color="accentColor || 'primary'" aria-hidden="true">
        emoji_events
      </v-icon>
      <div class="min-w-0">
        <div class="ml-class-title">
          {{ t('MineLatinoClasificaciones.title') }}
        </div>
        <div class="ml-class-subtitle">
          {{ t('MineLatinoClasificaciones.subtitle') }}
        </div>
      </div>
      <div class="flex-grow" />
      <v-btn
        v-if="activeTab === 'ranking'"
        icon
        size="small"
        variant="text"
        data-testid="minelatino-clasificaciones-refresh"
        :aria-label="t('MineLatinoClasificaciones.retry')"
        @click="reload"
      >
        <v-icon aria-hidden="true"> refresh </v-icon>
      </v-btn>
      <v-btn
        v-else
        icon
        size="small"
        variant="text"
        data-testid="minelatino-clasificaciones-playtime-refresh"
        :aria-label="t('MineLatinoClasificaciones.retry')"
        :disabled="playtimeLoading"
        @click="fetchPlaytimeLeaderboard"
      >
        <v-icon aria-hidden="true"> refresh </v-icon>
      </v-btn>
      <v-btn
        v-if="activeTab === 'ranking'"
        icon
        size="small"
        variant="text"
        data-testid="minelatino-clasificaciones-external"
        :aria-label="t('MineLatinoClasificaciones.openExternal')"
        @click="openExternal"
      >
        <v-icon aria-hidden="true"> open_in_new </v-icon>
      </v-btn>
    </div>

    <v-tabs
      v-model="activeTab"
      density="compact"
      color="primary"
      class="ml-class-tabs"
    >
      <v-tab value="ranking">
        <v-icon start size="16" aria-hidden="true"> leaderboard </v-icon>
        {{ t('MineLatinoClasificaciones.tabs.ranking') }}
      </v-tab>
      <v-tab value="playtime">
        <v-icon start size="16" aria-hidden="true"> schedule </v-icon>
        {{ t('MineLatinoClasificaciones.tabs.playtime') }}
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab" class="ml-class-window flex-grow">
      <!-- Ranking tab: staff-site webview -->
      <v-window-item value="ranking" class="ml-class-frame h-full">
        <div ref="host" class="ml-class-host" />

        <transition name="fade-transition">
          <div v-if="loading && !error" class="ml-class-overlay">
            <v-progress-circular
              indeterminate
              size="28"
              width="3"
              :color="accentColor || 'primary'"
            />
            <span class="ml-class-overlay-text">{{ t('MineLatinoClasificaciones.loading') }}</span>
          </div>
        </transition>

        <div v-if="error" class="ml-class-overlay">
          <v-icon size="36" color="grey" aria-hidden="true"> wifi_off </v-icon>
          <div class="ml-class-overlay-text">
            {{ t('MineLatinoClasificaciones.error') }}
          </div>
          <v-btn
            class="mt-3"
            size="small"
            variant="tonal"
            :color="accentColor || 'primary'"
            @click="reload"
          >
            <v-icon start aria-hidden="true"> refresh </v-icon>
            {{ t('MineLatinoClasificaciones.retry') }}
          </v-btn>
        </div>
      </v-window-item>

      <!-- Playtime tab: leaderboard from backend -->
      <v-window-item value="playtime" class="ml-class-frame h-full">
        <div class="ml-pt flex flex-col h-full">
          <div class="ml-pt-head px-4 py-2">
            <span class="ml-pt-head-rank">{{ t('MineLatinoClasificaciones.playtimeRank') }}</span>
            <span class="ml-pt-head-name">{{ t('MineLatinoClasificaciones.playtimeName') }}</span>
            <span class="ml-pt-head-hours">{{ t('MineLatinoClasificaciones.playtimeHours') }}</span>
          </div>

          <div class="ml-pt-list flex-grow overflow-y-auto px-2 pb-2">
            <!-- Loading -->
            <div v-if="playtimeLoading && playtimeEntries.length === 0" class="ml-pt-state">
              <v-progress-circular
                indeterminate
                size="28"
                width="3"
                :color="accentColor || 'primary'"
              />
              <span class="ml-pt-state-text">{{ t('MineLatinoClasificaciones.playtimeLoading') }}</span>
            </div>

            <!-- Error -->
            <div v-else-if="playtimeErrorState && playtimeEntries.length === 0" class="ml-pt-state">
              <v-icon size="36" color="grey" aria-hidden="true"> wifi_off </v-icon>
              <span class="ml-pt-state-text">{{ t('MineLatinoClasificaciones.playtimeError') }}</span>
              <v-btn
                class="mt-3"
                size="small"
                variant="tonal"
                :color="accentColor || 'primary'"
                @click="fetchPlaytimeLeaderboard"
              >
                <v-icon start aria-hidden="true"> refresh </v-icon>
                {{ t('MineLatinoClasificaciones.retry') }}
              </v-btn>
            </div>

            <!-- Empty -->
            <div v-else-if="playtimeEntries.length === 0" class="ml-pt-state">
              <v-icon size="36" color="grey" aria-hidden="true"> schedule </v-icon>
              <span class="ml-pt-state-text">{{ t('MineLatinoClasificaciones.playtimeEmpty') }}</span>
            </div>

            <!-- Entries -->
            <template v-else>
              <div
                v-for="entry in playtimeEntries"
                :key="entry.rank"
                class="ml-pt-row"
                :class="{
                  'ml-pt-row--gold': entry.rank === 1,
                  'ml-pt-row--silver': entry.rank === 2,
                  'ml-pt-row--bronze': entry.rank === 3,
                }"
              >
                <span class="ml-pt-row-rank">
                  <v-icon v-if="entry.rank === 1" size="18" color="#FFD700" aria-hidden="true"> emoji_events </v-icon>
                  <v-icon v-else-if="entry.rank === 2" size="18" color="#C0C0C0" aria-hidden="true"> emoji_events </v-icon>
                  <v-icon v-else-if="entry.rank === 3" size="18" color="#CD7F32" aria-hidden="true"> emoji_events </v-icon>
                  <span v-else>{{ entry.rank }}</span>
                </span>
                <span class="ml-pt-row-name">{{ entry.name }}</span>
                <span class="ml-pt-row-hours">{{ formatHours(entry.playtime) }}</span>
              </div>
            </template>
          </div>
        </div>
      </v-window-item>
    </v-window>
  </div>
</template>
<script lang="ts" setup>
import type { MineLatinoPlaytimeLeaderboardEntry } from '@xmcl/runtime-api'
import { MineLatinoServiceKey } from '@xmcl/runtime-api'
import { injection } from '@/util/inject'
import { useService } from '@/composables/service'
import { kMineLatino } from '@/composables/minelatino'

const { t } = useI18n()
const { accentColor, openInBrowser } = injection(kMineLatino)
const service = useService(MineLatinoServiceKey)

/**
 * The staff-site ranking page, opened with the default modality/category/page.
 * The embedded filters and pagination rewrite these query params, so the player
 * keeps full control of the ranking from inside the launcher.
 */
const CLASIFICACIONES_URL = 'https://staff.minelatino.net/clasificacion?modalidad=survival-clasico&categoria=blocks&pagina=1'

/**
 * Hides the staff site's global navbar and footer so only the ranking shows.
 * Both a class and a structural (`body > nav` / `body > footer`) selector are
 * used so a minor class rename on the site cannot resurface its chrome. Injected
 * on every `dom-ready` because a full navigation (a filter or pagination reload)
 * swaps the document and clears previously injected CSS.
 */
const HIDE_CHROME_CSS = `
nav.navbar,
footer.modern-footer,
body > nav,
body > footer {
  display: none !important;
}
`

/** The slice of the Electron `<webview>` element this screen drives. */
interface WebviewElement extends HTMLElement {
  src: string
  insertCSS(css: string): Promise<string>
  reload(): void
}

const activeTab = ref<'ranking' | 'playtime'>('ranking')

const host = ref<HTMLElement>()
const loading = ref(true)
const error = ref(false)
let webview: WebviewElement | undefined

// Playtime leaderboard state
const playtimeEntries = ref<MineLatinoPlaytimeLeaderboardEntry[]>([])
const playtimeLoading = ref(false)
const playtimeErrorState = ref(false)

function formatHours(ms: number): string {
  const hours = ms / 3_600_000
  if (hours >= 100) return `${Math.round(hours)} h`
  return `${hours.toFixed(1)} h`
}

async function fetchPlaytimeLeaderboard() {
  playtimeLoading.value = true
  playtimeErrorState.value = false
  try {
    playtimeEntries.value = await service.getPlaytimeLeaderboard()
  } catch {
    playtimeErrorState.value = true
  } finally {
    playtimeLoading.value = false
  }
}

// Fetch leaderboard when switching to the playtime tab
watch(activeTab, (tab) => {
  if (tab === 'playtime' && playtimeEntries.value.length === 0 && !playtimeLoading.value) {
    void fetchPlaytimeLeaderboard()
  }
})

function reload() {
  if (!webview) return
  error.value = false
  loading.value = true
  webview.reload()
}

function openExternal() {
  openInBrowser(CLASIFICACIONES_URL)
}

onMounted(() => {
  if (!host.value) return

  const el = document.createElement('webview') as unknown as WebviewElement
  // A dedicated partition isolates the guest from the launcher's own session
  // (no shared cookies/storage) while persisting whatever the ranking page
  // needs to render.
  el.setAttribute('partition', 'persist:minelatino-clasificaciones')
  el.src = CLASIFICACIONES_URL
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.border = 'none'
  el.style.display = 'inline-flex'

  el.addEventListener('did-start-loading', () => {
    loading.value = true
    error.value = false
  })
  el.addEventListener('did-stop-loading', () => { loading.value = false })
  el.addEventListener('dom-ready', () => {
    loading.value = false
    // Show only the ranking; re-applied on each load (see HIDE_CHROME_CSS).
    el.insertCSS(HIDE_CHROME_CSS).catch(() => {})
  })
  el.addEventListener('did-fail-load', (event) => {
    const e = event as Event & { errorCode: number, isMainFrame: boolean }
    // -3 (ERR_ABORTED) fires for benign sub-resource/redirect aborts; only a
    // main-frame failure is a real error worth the retry screen.
    if (e.isMainFrame && e.errorCode !== -3) {
      loading.value = false
      error.value = true
    }
  })

  host.value.appendChild(el)
  webview = el
})
</script>

<style scoped>
.ml-class {
  width: 100%;
  /* Fill the shell's routed middle column exactly. That column already accounts
     for the global system bar and the shell's own 56px top bar, so `100%`
     (resolved against its definite flex height) gives the embedded page a real
     height without a magic pixel offset — and the column never scrolls. */
  height: 100%;
  box-sizing: border-box;
}

.ml-class-title {
  font-family: var(--ml-font-head);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--ml-text);
}

.ml-class-subtitle {
  font-size: 0.8rem;
  color: var(--ml-dim);
}

.ml-class-tabs {
  flex-grow: 0;
}

.ml-class-window {
  position: relative;
  min-height: 0;
  flex: 1 1 0;
}

.ml-class-window :deep(.v-window__container) {
  height: 100%;
}

.ml-class-window :deep(.v-window-item) {
  height: 100%;
}

.ml-class-frame {
  position: relative;
  min-height: 0;
  border-radius: var(--ml-radius);
  overflow: hidden;
  border: 1px solid var(--ml-border);
  background-color: var(--ml-panel);
}

.ml-class-host {
  position: absolute;
  inset: 0;
}

.ml-class-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 24px;
  background-color: var(--ml-panel);
}

.ml-class-overlay-text {
  font-size: 0.86rem;
  color: var(--ml-dim);
}

/* ── Playtime leaderboard ─────────────────────────────────────────────────── */

.ml-pt {
  /* inherits from parent */
}

.ml-pt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--ml-border);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ml-dim);
}

.ml-pt-head-rank {
  width: 36px;
  text-align: center;
  flex-shrink: 0;
}

.ml-pt-head-name {
  flex: 1;
  min-width: 0;
}

.ml-pt-head-hours {
  width: 80px;
  text-align: right;
  flex-shrink: 0;
}

.ml-pt-list {
  /* scrollbar styling handled by global ml-scroll */
}

.ml-pt-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
}

.ml-pt-state-text {
  font-size: 0.86rem;
  color: var(--ml-dim);
}

.ml-pt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: var(--ml-radius-sm, 6px);
  font-size: 0.88rem;
  transition: background-color 0.15s ease;
}

.ml-pt-row:hover {
  background-color: var(--ml-raise, rgba(255, 255, 255, 0.04));
}

.ml-pt-row--gold {
  background-color: rgba(255, 215, 0, 0.08);
}

.ml-pt-row--gold:hover {
  background-color: rgba(255, 215, 0, 0.14);
}

.ml-pt-row--silver {
  background-color: rgba(192, 192, 192, 0.06);
}

.ml-pt-row--silver:hover {
  background-color: rgba(192, 192, 192, 0.12);
}

.ml-pt-row--bronze {
  background-color: rgba(205, 127, 50, 0.06);
}

.ml-pt-row--bronze:hover {
  background-color: rgba(205, 127, 50, 0.12);
}

.ml-pt-row-rank {
  width: 36px;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
  color: var(--ml-dim);
}

.ml-pt-row--gold .ml-pt-row-rank {
  color: #FFD700;
}

.ml-pt-row--silver .ml-pt-row-rank {
  color: #C0C0C0;
}

.ml-pt-row--bronze .ml-pt-row-rank {
  color: #CD7F32;
}

.ml-pt-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ml-text);
  font-weight: 500;
}

.ml-pt-row--gold .ml-pt-row-name {
  color: #FFD700;
  font-weight: 700;
}

.ml-pt-row--silver .ml-pt-row-name {
  color: #E0E0E0;
  font-weight: 600;
}

.ml-pt-row--bronze .ml-pt-row-name {
  color: #CD7F32;
  font-weight: 600;
}

.ml-pt-row-hours {
  width: 80px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--ml-dim);
  font-weight: 500;
}

.ml-pt-row--gold .ml-pt-row-hours {
  color: #FFD700;
}

.ml-pt-row--silver .ml-pt-row-hours {
  color: #C0C0C0;
}

.ml-pt-row--bronze .ml-pt-row-hours {
  color: #CD7F32;
}
</style>
