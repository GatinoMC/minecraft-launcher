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
    :style="{ scrollbarGutter: 'stable' }"
  >
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

    <div class="ml-body flex min-h-0 flex-1">
      <MineLatinoSidebar />

      <main class="visible-scroll min-w-0 flex-1 overflow-y-auto">
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
import { kMineLatino, useMineLatino } from '@/composables/minelatino'
import MineLatinoProfilePanel from './MineLatinoProfilePanel.vue'
import MineLatinoSidebar from './MineLatinoSidebar.vue'
import './minelatino-theme.css'

const { t } = useI18n()

const state = useMineLatino()
// One subscription shared by the whole subtree (see the comment above).
provide(kMineLatino, { ...state, accentColor: computed(() => '#53dfed') })

const { branding } = state

const brandName = computed(() => branding.value?.name || t('MineLatinoPlay.startTitle'))
const logoSrc = computed(() => branding.value?.logoUrl || bundledLogo)

</script>

<style scoped>
.ml-shell {
  /* Falls back to the theme primary when the backend sends no accent colour. */
  --ml-accent: #53dfed;
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
</style>
