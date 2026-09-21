<!--
  MineLatino "Jugar" screen: the server's own showcase — a frosted identity
  card with the live status (players + capacity bar, version, latency, MOTD
  and a copyable address) at the bottom right, the player's skin rendered live
  in 3D on a centered stage, and the "Empezar" button at the bottom left that
  launches the game straight into the server with the profile selected in the
  right-hand panel (the shared launch funnel in `instanceLaunch.ts` adds the
  auto-join flags).

  MineLatinoShell owns the shared still backdrop behind this screen and the
  "Jugando como" panel so the artwork stays continuous across both columns.
-->
<template>
  <section
    v-if="isConfigured"
    data-testid="minelatino-play"
    class="ml-play relative flex h-full min-h-[420px] flex-col overflow-hidden"
  >
    <v-alert
      v-if="maintenance && maintenance.enabled"
      class="relative m-4 mb-0"
      type="warning"
      variant="tonal"
      density="compact"
      :title="t('MineLatinoHome.maintenanceTitle')"
      :text="maintenance.message"
    />

    <!-- The player stays central while the server card and launch action
         anchor the two lower corners. -->
    <div class="ml-play-layout relative min-h-0 flex-1 p-6">
      <div class="ml-play-info flex min-w-0 flex-col">
        <!-- Server identity and live status in one frosted card. -->
        <div class="ml-play-idcard">
          <div class="flex min-w-0 items-center gap-4">
            <img
              class="ml-play-logo"
              :src="serverLogo"
              :alt="serverName"
              draggable="false"
              v-fallback-img="BuiltinImages.minecraft"
            >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="ml-play-title">
                  {{ serverName }}
                </h1>
                <span
                  class="ml-play-status"
                  :class="online ? 'ml-play-status--on' : 'ml-play-status--off'"
                >
                  <span class="ml-play-status-dot" aria-hidden="true" />
                  {{ online ? t('MineLatinoPlay.online') : t('MineLatinoPlay.offline') }}
                </span>
              </div>
              <div v-if="branding?.tagline" class="ml-play-tagline">
                {{ branding.tagline }}
              </div>
            </div>
            <button
              type="button"
              class="ml-play-refresh"
              :title="t('MineLatinoHome.refresh')"
              :aria-label="t('MineLatinoHome.refresh')"
              @click="refresh()"
            >
              <v-icon size="16" :class="{ 'animate-spin': pinging }" aria-hidden="true">
                refresh
              </v-icon>
            </button>
          </div>

          <!-- Live stats: how full the server is, what it runs, how far away. -->
          <div class="ml-play-stats">
            <div class="ml-play-stat ml-play-stat--wide">
              <div class="ml-play-stat-label">
                {{ t('MineLatinoPlay.playersOnline') }}
              </div>
              <div
                class="ml-play-stat-value"
                data-testid="minelatino-players"
                :title="playersValue"
              >
                <v-icon
                  size="14"
                  start
                  :class="{ 'animate-spin': pinging }"
                  aria-hidden="true"
                >
                  {{ pinging ? 'progress_activity' : 'group' }}
                </v-icon>
                {{ playersValue }}
              </div>
              <div class="ml-play-bar" aria-hidden="true">
                <div class="ml-play-bar-fill" :style="{ width: `${capacity}%` }" />
              </div>
            </div>
            <div class="ml-play-stat">
              <div class="ml-play-stat-label">
                {{ t('MineLatinoPlay.version') }}
              </div>
              <div class="ml-play-stat-value" :title="versionName">
                {{ versionName }}
              </div>
            </div>
            <div class="ml-play-stat">
              <div class="ml-play-stat-label">
                {{ t('MineLatinoPlay.latency') }}
              </div>
              <div class="ml-play-stat-value">
                {{ latencyLabel }}
              </div>
            </div>
            <div class="ml-play-stat">
              <div class="ml-play-stat-label">
                {{ t('MineLatinoPlay.playtime') }}
              </div>
              <div class="ml-play-stat-value">
                <v-icon size="14" start aria-hidden="true"> schedule </v-icon>
                {{ playtimeLabel }}
              </div>
            </div>
          </div>

          <!-- The server's own MOTD, rendered with its colours intact. -->
          <TextComponent
            v-if="status.description"
            :source="status.description"
            class="ml-play-motd"
          />

          <!-- Address with a copy button, so joining by hand is one click. -->
          <div v-if="address" class="ml-play-addr">
            <v-icon size="15" aria-hidden="true">
              dns
            </v-icon>
            <span class="ml-play-addr-text">{{ address }}</span>
            <button
              type="button"
              class="ml-play-copy"
              :class="{ 'ml-play-copy--done': copied }"
              :title="copied ? t('MineLatinoPlay.copied') : t('MineLatinoPlay.copyAddress')"
              :aria-label="t('MineLatinoPlay.copyAddress')"
              @click="copyAddress"
            >
              <v-icon size="15" aria-hidden="true">
                {{ copied ? 'check' : 'content_copy' }}
              </v-icon>
            </button>
          </div>
        </div>

      </div>

      <!-- "Empezar": bottom left, launches with the selected profile. -->
      <div class="ml-play-actions flex flex-wrap items-end gap-3">
        <v-btn
          v-if="!hasProfile"
          variant="tonal"
          :color="accentColor || 'primary'"
          data-testid="minelatino-add-version"
          @click="showAddInstance()"
        >
          <v-icon start aria-hidden="true"> add </v-icon>
          {{ t('MineLatinoPlay.addVersion') }}
        </v-btn>
        <v-btn
          size="x-large"
          rounded="pill"
          :color="accentColor || 'primary'"
          :disabled="!hasProfile"
          :loading="loading"
          class="ml-play-start pl-10 pr-10"
          data-testid="minelatino-start"
          @click="onStart"
        >
          <v-icon start aria-hidden="true"> play_arrow </v-icon>
          {{ t('MineLatinoPlay.empezar') }}
        </v-btn>
      </div>

      <!-- The player's own skin and active MineLatino wardrobe, centered over
           the world artwork. The canvas stays interactive for rotation/zoom. -->
      <div class="ml-play-stage">
        <div class="ml-play-stage-card">
          <div class="ml-play-stage-glow" aria-hidden="true" />
          <div class="ml-play-skin">
            <!-- v-if intentionally destroys SkinViewer so its WebGL context,
                 models and textures are released while Minecraft is open. -->
            <EquippedCosmeticsPreview
              v-if="!hasRunningInstance"
              :skin="skinUrl"
              :products="equippedCosmetics"
            />
          </div>
          <div class="ml-play-stage-floor" aria-hidden="true" />
          <!-- Nameplate: the player's own face cropped out of the skin texture. -->
          <div class="ml-play-nameplate">
            <span class="ml-play-face" :style="faceStyle" aria-hidden="true" />
            <span class="ml-play-nameplate-text">{{ playerName }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
<script lang="ts" setup>
import bundledLogo from '@/assets/minelatino-logo.png'
import steveSkin from '@/assets/steve_skin.png'
import TextComponent from '@/components/TextComponent'
import { type CosmeticProduct, useCosmeticsStore } from '@/composables/cosmeticsStore'
import { useDialog } from '@/composables/dialog'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kInstanceLaunchCoordinator } from '@/composables/instanceLaunchCoordinator'
import { kInstances } from '@/composables/instances'
import { kLaunchButton } from '@/composables/launchButton'
import { kMineLatino } from '@/composables/minelatino'
import { useMinecraftProtocol } from '@/composables/protocol'
import { useServerStatus } from '@/composables/serverStatus'
import { useService } from '@/composables/service'
import { kUserContext } from '@/composables/user'
import { BuiltinImages } from '@/constant'
import { vFallbackImg } from '@/directives/fallbackImage'
import { injection } from '@/util/inject'
import { MineLatinoServiceKey, type MineLatinoEquippedCosmetic } from '@xmcl/runtime-api'
import EquippedCosmeticsPreview from './EquippedCosmeticsPreview.vue'

const { t } = useI18n()
const {
  branding,
  server,
  maintenance,
  accentColor,
  isConfigured,
  copyText,
} = injection(kMineLatino)
const { instances, selectedInstance } = injection(kInstances)
const { hasRunningInstance } = injection(kInstanceLaunchCoordinator)
const { onClick, loading } = injection(kLaunchButton)
const { show: showAddInstance } = useDialog(AddInstanceDialogKey)
const { userProfile, gameProfile } = injection(kUserContext)
const service = useService(MineLatinoServiceKey)
const { products: cosmeticProducts, refresh: refreshCosmeticsCatalog } = useCosmeticsStore()
const equipped = ref<MineLatinoEquippedCosmetic[]>([])
const equippedCosmetics = computed(() => {
  const byId = new Map(cosmeticProducts.value.map(product => [product.id, product]))
  return equipped.value.map(item => byId.get(item.cosmeticId)).filter((product): product is CosmeticProduct => !!product)
})

async function refreshEquippedCosmetics() {
  if (hasRunningInstance.value) return
  try {
    const active = await service.getEquippedCosmetics({
      uuid: gameProfile.value?.id,
      name: playerName.value,
    })
    equipped.value = active
    if (active.length) await refreshCosmeticsCatalog()
  } catch (error) {
    equipped.value = []
    console.warn('[cosmetics] equipped wardrobe could not be loaded', error)
  }
}

const hasProfile = computed(() => !!selectedInstance.value)
const selected = computed(() => instances.value.find(i => i.path === selectedInstance.value))

/**
 * The signed-in player's own skin, rendered live in 3D at the centre; falls
 * back to the bundled Steve when there is no profile texture (offline or not
 * signed in). skinview3d infers the slim vs classic model from the image.
 */
const skinUrl = computed(() => gameProfile.value?.textures?.SKIN?.url || steveSkin)
const playerName = computed(() => gameProfile.value?.name || userProfile.value?.username || 'Steve')

/**
 * The nameplate face is the 8x8 head front of the skin texture, magnified
 * 3.25x (26px) with the pixel grid kept hard, Minecraft-style.
 */
const faceStyle = computed(() => ({ backgroundImage: `url("${skinUrl.value}")` }))

const serverName = computed(() =>
  server.value?.name || branding.value?.name || t('MineLatinoPlay.startTitle'),
)

/**
 * `server.icon` may arrive as a data URI, an http(s) URL or a bare base64 PNG
 * (the `servers.dat` flavour); anything else falls back to the brand logo.
 */
const serverLogo = computed(() => {
  const icon = server.value?.icon?.trim()
  if (icon) {
    if (/^data:image\//i.test(icon)) return icon
    if (/^https?:\/\//i.test(icon)) return icon
    if (!/^[\w+\-.]+:\/\//i.test(icon)) return `data:image/png;base64,${icon}`
  }
  return branding.value?.logoUrl || bundledLogo
})

// Live player count for the configured server, pinged through the shared
// cache so revisiting the panel within the TTL costs nothing.
const protocol = useMinecraftProtocol(computed(() => selected.value?.runtime.minecraft))
const serverRef = computed(() => ({ host: server.value?.host ?? '', port: server.value?.port }))
const { status, pinging, refresh, refreshIfStale } = useServerStatus(serverRef, protocol)
onMounted(() => {
  refreshIfStale()
  void refreshEquippedCosmetics()
  window.addEventListener('focus', refreshEquippedCosmetics)
})
onBeforeUnmount(() => window.removeEventListener('focus', refreshEquippedCosmetics))
watch(hasRunningInstance, (running) => {
  if (!running) void refreshEquippedCosmetics()
})
watch(() => [gameProfile.value?.id, playerName.value], () => {
  void refreshEquippedCosmetics()
})

const online = computed(() => status.value.players.online >= 0)

const playersValue = computed(() => {
  const players = status.value.players
  if (players.online < 0) {
    return pinging.value ? t('serverStatus.ping') : t('MineLatinoPlay.playersOffline')
  }
  return t('MineLatinoPlay.players', { online: players.online, max: players.max })
})

/** Fill of the capacity bar, clamped so a misreported max can't overflow it. */
const capacity = computed(() => {
  const { online: on, max } = status.value.players
  if (on < 0 || max <= 0) return 0
  return Math.min(100, Math.round((on / max) * 100))
})

const versionName = computed(() => (online.value ? status.value.version.name : '—'))
const latencyLabel = computed(() =>
  online.value ? t('MineLatinoPlay.pingMs', { ms: status.value.ping }) : '—',
)

/** Total playtime for the selected instance, formatted as hours with one decimal. */
const playtimeLabel = computed(() => {
  const ms = selected.value?.playtime ?? 0
  const hours = ms / 3_600_000
  return t('MineLatinoPlay.playtimeHours', { hours: hours.toFixed(1) })
})

const address = computed(() => {
  const host = server.value?.host?.trim()
  if (!host) return ''
  return `${host}:${server.value?.port ?? 25565}`
})

const copied = ref(false)
function copyAddress() {
  if (!copyText(address.value)) return
  copied.value = true
  setTimeout(() => { copied.value = false }, 4000)
}

function onStart() {
  void onClick()
}
</script>

<style scoped>
.ml-play-layout {
  min-height: 0;
  position: relative;
}

.ml-play-info {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: 0;
  width: min(420px, 54%);
  height: auto;
}

.ml-play-actions {
  position: absolute;
  z-index: 3;
  left: 0;
  bottom: 0;
}

/* Flat identity card matching the shop panel style. */
.ml-play-idcard {
  display: flex;
  flex-direction: column;
  align-self: flex-start;
  width: 100%;
  max-width: none;
  padding: 14px;
  border-radius: var(--ml-radius);
  border: 1px solid var(--ml-border);
  background-color: var(--ml-panel);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

/* Manual re-ping, kept from the old players chip and promoted to the card's
   corner so the live numbers can always be forced fresh. */
.ml-play-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  color: inherit;
  cursor: pointer;
  flex-grow: 0;
  flex-shrink: 0;
  transition: background-color 0.18s ease, transform 0.16s ease;
}

.ml-play-refresh:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.16);
}

.ml-play-refresh:active {
  transform: scale(0.92);
}

.ml-play-refresh:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 1px;
}

.ml-play-logo {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ml-accent) 45%, transparent),
    0 12px 28px -14px rgba(0, 0, 0, 0.8);
}

.ml-play-title {
  font-size: 1.42rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Live status pill next to the server name. */
.ml-play-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-play-status--on {
  color: rgb(var(--v-theme-success));
  background-color: color-mix(in srgb, rgb(var(--v-theme-success)) 15%, transparent);
  border-color: color-mix(in srgb, rgb(var(--v-theme-success)) 40%, transparent);
}

.ml-play-status--off {
  color: var(--color-secondary-text);
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  border-color: rgba(var(--v-theme-on-surface), 0.16);
}

.ml-play-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: currentColor;
  box-shadow: 0 0 8px currentColor;
}

.ml-play-status--on .ml-play-status-dot {
  animation: ml-dot-pulse 2.2s ease-in-out infinite;
}

@keyframes ml-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.65; }
}

.ml-play-tagline {
  margin-top: 2px;
  font-size: 0.9rem;
  color: var(--color-secondary-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Live stat tiles ── */
.ml-play-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 12px;
}

.ml-play-stat {
  min-width: 0;
  padding: 8px 9px;
  border-radius: var(--ml-radius-sm);
  border: 1px solid var(--ml-border-soft);
  background-color: var(--ml-well);
}

.ml-play-stat-label {
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-secondary-text);
}

.ml-play-stat-value {
  display: flex;
  align-items: center;
  margin-top: 3px;
  font-size: 0.95rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Capacity bar under the player count. */
.ml-play-bar {
  margin-top: 7px;
  height: 5px;
  border-radius: 999px;
  background-color: rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
}

.ml-play-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ml-accent) 65%, #ffffff),
    var(--ml-accent)
  );
  box-shadow: 0 0 8px color-mix(in srgb, var(--ml-accent) 55%, transparent);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.ml-play-motd {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-top: 12px;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--color-secondary-text);
  overflow: hidden;
}

/* Address row with the copy button. */
.ml-play-addr {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 6px 6px 6px 12px;
  border-radius: 10px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.18);
  background-color: rgba(var(--v-theme-on-surface), 0.03);
}

.ml-play-addr-text {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-play-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 7px;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  color: inherit;
  cursor: pointer;
  flex-grow: 0;
  flex-shrink: 0;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.16s ease;
}

.ml-play-copy:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.16);
}

.ml-play-copy:active {
  transform: scale(0.92);
}

.ml-play-copy:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 1px;
}

.ml-play-copy--done {
  color: rgb(var(--v-theme-success));
}

/* ── 3D skin stage ── */
.ml-play-stage {
  position: absolute;
  z-index: 1;
  top: 16px;
  bottom: 16px;
  left: 50%;
  width: clamp(300px, 46%, 390px);
  transform: translateX(-50%);
  display: flex;
  align-items: stretch;
  justify-content: center;
}

/* Flat stage card matching the shop panel style. */
.ml-play-stage-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: var(--ml-radius);
  border: 1px solid var(--ml-border);
  background: radial-gradient(ellipse at 50% 55%, rgba(65, 36, 19, 0.54), rgba(35, 24, 18, 0.18) 62%, transparent 78%);
  box-shadow: none;
  overflow: hidden;
}

.ml-play-stage-glow {
  position: absolute;
  inset: 10% 14%;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--ml-accent) 40%, transparent),
    transparent 72%
  );
  filter: blur(22px);
  animation: ml-stage-pulse 5.5s ease-in-out infinite;
}

.ml-play-skin {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 4px 8px 28px;
  animation: ml-skin-float 6s ease-in-out infinite;
}

/* Both maxes with auto sizes let the canvas shrink to fit either axis while
   keeping its aspect ratio, so short windows never clip the model. */
.ml-play-skin :deep(.equipped-cosmetics-preview) {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
}

/* Pedestal light the model stands on. */
.ml-play-stage-floor {
  position: absolute;
  bottom: 58px;
  left: 50%;
  width: 190px;
  height: 40px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--ml-accent) 55%, transparent),
    transparent 70%
  );
  filter: blur(7px);
  opacity: 0.55;
}

/* Nameplate: face crop + name, pinned to the bottom of the stage. */
.ml-play-nameplate {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 28px);
  padding: 5px 14px 5px 6px;
  border-radius: 999px;
  border: 1px solid var(--ml-border);
  background-color: var(--ml-raise);
  box-shadow: 0 4px 12px -6px rgba(0, 0, 0, 0.6);
  z-index: 2;
}

.ml-play-face {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background-size: 208px 208px;
  background-position: -26px -26px;
  image-rendering: pixelated;
  box-shadow: 0 0 0 1px var(--ml-border-soft);
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-play-nameplate-text {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ml-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes ml-skin-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}

@keyframes ml-stage-pulse {
  0%, 100% { opacity: 0.6; transform: scale(0.98); }
  50% { opacity: 0.9; transform: scale(1.04); }
}

/* Hero launch button: shop-style amber pill with hard lip. */
.ml-play-start {
  height: 56px;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: var(--ml-cta) !important;
  color: var(--ml-cta-text) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 5px 0 var(--ml-cta-lip) !important;
}

.ml-play-start:not(.v-btn--disabled):hover {
  background: var(--ml-cta-hover) !important;
  transform: translateY(2px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 3px 0 var(--ml-cta-lip) !important;
}

.ml-play-start:not(.v-btn--disabled):active {
  transform: translateY(4px) !important;
  box-shadow:
    inset 0 2px 4px rgba(0, 0, 0, 0.25),
    0 1px 0 var(--ml-cta-lip) !important;
  filter: brightness(0.96);
}

/* Keep the remaining player/status animation sensitive to OS preferences. */
@media (prefers-reduced-motion: reduce) {
  .ml-play-skin,
  .ml-play-stage-glow,
  .ml-play-status--on .ml-play-status-dot {
    animation: none;
  }
}

/* Medium windows balance the player against the server card without overlap. */
@media (max-width: 1500px) and (min-width: 901px) {
  .ml-play-stage {
    left: 32%;
  }
}

/* Narrow windows: shrink the stage, then drop it so the CTA stays reachable. */
@media (max-width: 1100px) {
  .ml-play-stage {
    width: min(260px, 44%);
  }
}

@media (max-width: 900px) {
  .ml-play-layout {
    gap: 12px;
  }

  .ml-play-stage {
    display: none;
  }

  .ml-play-info {
    right: 0;
    bottom: 60px;
    left: 0;
    width: auto;
  }

  .ml-play-idcard {
    max-width: none;
  }
}

@media (max-width: 700px) {
  .ml-play-stats {
    grid-template-columns: 1fr 1fr;
  }

  .ml-play-stat--wide {
    grid-column: 1 / -1;
  }
}

@media (max-height: 550px) {
  .ml-play-layout {
    padding: 8px;
  }

  .ml-play-idcard {
    padding: 10px;
  }

  .ml-play-logo {
    width: 38px;
    height: 38px;
    border-radius: 10px;
  }

  .ml-play-title {
    font-size: 1.1rem;
  }

  .ml-play-tagline,
  .ml-play-motd,
  .ml-play-addr {
    display: none;
  }

  .ml-play-stats {
    gap: 6px;
    margin-top: 8px;
  }

  .ml-play-stat {
    padding: 6px 8px;
  }

  .ml-play-stat-value {
    margin-top: 1px;
    font-size: 0.82rem;
  }

  .ml-play-bar {
    margin-top: 3px;
  }

  .ml-play-actions {
    margin-top: 8px;
  }

  .ml-play-start {
    height: 44px;
    min-width: 160px;
    font-size: 0.95rem;
  }
}
</style>
