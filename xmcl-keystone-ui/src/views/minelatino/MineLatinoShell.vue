<!--
  MineLatino shell: the root of the branded interface, laid out as a classic
  game-launcher frame — brand logo and name on a top bar, a left rail with the
  whole navigation (Jugar / Anuncios / Actualizaciones / Tienda, the most
  played profiles and the session actions), the routed screen in the middle,
  and the player's profile panel on the right.

  It owns the single `useMineLatino()` subscription for the whole subtree and
  `provide`s it, so every child (Start / Jugar / Tienda / Anuncios /
  Actualizaciones / Actualizar) plus the reused `MineLatinoNews` /
  `MineLatinoUpdates` / `MineLatinoPresets` panels inject the same state
  instead of re-fetching. `windows/main/Context.ts` only routes here when
  `isMineLatinoConfigured`, and an unbranded build never mounts this.
-->
<template>
  <div
    class="ml-shell flex max-h-full min-h-0 flex-1 flex-col"
    :class="shellPosterClasses"
    :data-poster="posterKey || undefined"
    :style="{ scrollbarGutter: 'stable' }"
  >
    <div v-if="posterStyle" class="ml-shell-poster absolute inset-0" :style="posterStyle" aria-hidden="true" />
    <!-- Brand first: logo and name pinned to the top-left corner. -->
    <header class="ml-topbar flex flex-grow-0 flex-shrink-0 items-center gap-3 px-4">
      <img
        class="ml-topbar-logo"
        :src="logoSrc"
        :alt="brandName"
        draggable="false"
      >
      <span class="ml-topbar-name">{{ brandName }}</span>
      <span v-if="branding?.tagline" class="ml-topbar-tagline">
        {{ branding.tagline }}
      </span>
    </header>

    <div
      class="ml-body relative flex min-h-0 flex-1 overflow-hidden"
      :class="{ 'ml-body--poster': posterKey, 'ml-body--play': isPlayRoute }"
    >
      <MineLatinoSidebar />

      <main
        class="visible-scroll min-w-0 flex-1 overflow-y-auto"
        :class="{ 'ml-main--play': isPlayRoute }"
      >
        <router-view v-slot="{ Component }">
          <transition name="ml-page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>

      <MineLatinoProfilePanel />
    </div>
  </div>
</template>
<script lang="ts" setup>
import bundledLogo from '@/assets/minelatino-logo.png'
import communityBackground from '@/assets/minelatino-community-background.png'
import cosmeticsBackground from '@/assets/minelatino-cosmetics-background.png'
import playBackground from '@/assets/minelatino-play-background.png'
import updatesBackground from '@/assets/minelatino-updates-background.png'
import { kMineLatino, useMineLatino } from '@/composables/minelatino'
import MineLatinoProfilePanel from './MineLatinoProfilePanel.vue'
import MineLatinoSidebar from './MineLatinoSidebar.vue'
import './minelatino-theme.css'

const state = useMineLatino()
const route = useRoute()

type PosterKey = 'play' | 'updates' | 'community' | 'cosmetics'

const communityRoutes = new Set([
  '/minelatino',
  '/minelatino/perfiles',
  '/minelatino/anuncios',
  '/minelatino/tienda',
  '/minelatino/clasificaciones',
])

const posterKey = computed<PosterKey | undefined>(() => {
  if (route.path === '/minelatino/jugar') return 'play'
  if (route.path === '/minelatino/actualizaciones' || route.path === '/minelatino/actualizar') return 'updates'
  if (route.path === '/minelatino/cosmeticos') return 'cosmetics'
  if (communityRoutes.has(route.path)) return 'community'
  return undefined
})
const posterAssets: Record<PosterKey, string> = {
  play: playBackground,
  updates: updatesBackground,
  community: communityBackground,
  cosmetics: cosmeticsBackground,
}
const posterStyle = computed(() => posterKey.value
  ? { backgroundImage: `url("${posterAssets[posterKey.value]}")` }
  : undefined)
const shellPosterClasses = computed(() => posterKey.value
  ? ['ml-shell--poster', `ml-shell--${posterKey.value}`]
  : [])
const isPlayRoute = computed(() => posterKey.value === 'play')
// One subscription shared by the whole subtree (see the comment above).
provide(kMineLatino, { ...state, accentColor: computed(() => '#ffc65b') })

const { branding } = state

const brandName = 'GatinoLauncher'
const logoSrc = bundledLogo

</script>

<style scoped>
.ml-shell {
  position: relative;
  overflow: hidden;
  /* Falls back to the theme primary when the backend sends no accent colour. */
  --ml-accent: #ffc65b;
}

.ml-main--play {
  overflow: visible;
}

.ml-shell-poster {
  z-index: 0;
  background-size: cover;
  background-position: center;
  pointer-events: none;
}

.ml-shell > .ml-topbar,
.ml-shell > .ml-body {
  position: relative;
  z-index: 1;
}

.ml-topbar {
  height: 52px;
  border-bottom: 2px solid var(--ml-accent-border);
  background-color: var(--ml-panel);
}

.ml-topbar-logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: var(--ml-well);
  box-shadow: 0 0 0 1px var(--ml-border);
}

.ml-topbar-name {
  font-family: var(--ml-font-head);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--ml-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-topbar-tagline {
  font-size: 0.78rem;
  color: var(--ml-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-body {
  background-color: var(--ml-bg);
}

.ml-body--poster {
  background-color: transparent;
}

</style>
