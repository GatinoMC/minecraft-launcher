<!--
  MineLatino left rail: the launcher's whole navigation in one column — the
  five content destinations (Jugar / Anuncios / Actualizaciones / Tienda /
  Clasificaciones), the player's three most-played profiles, and the session
  actions at the bottom (options, launcher self-update, sign out).

  Injects `kInstances` from the main window context; "most played" is simply
  the instance list sorted by the `playtime` the runtime accumulates per
  profile.
-->
<template>
  <nav
    class="ml-side visible-scroll flex flex-col gap-4 overflow-y-auto p-3"
    :class="{ 'ml-side--collapsed': collapsed }"
    :aria-label="t('MineLatinoPlay.startTitle')"
  >
    <button
      type="button"
      class="ml-side-toggle ml-side-item"
      :aria-label="t('MineLatinoShell.navigation')"
      :title="t('MineLatinoShell.navigation')"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <span class="ml-side-icon"><v-icon size="18" aria-hidden="true">{{ collapsed ? 'chevron_right' : 'chevron_left' }}</v-icon></span>
      <span class="ml-side-label">{{ t('MineLatinoShell.navigation') }}</span>
    </button>
    <!-- The five content destinations. -->
    <div class="flex flex-col gap-1">
      <div class="ml-side-title">
        {{ t('MineLatinoShell.navigation') }}
      </div>
      <RouterLink
        v-for="item in nav"
        :key="item.key"
        class="ml-side-item"
        :class="{ 'ml-side-item--active': isActive(item.to) }"
        :to="item.to"
        :title="t(`MineLatinoNav.${item.key}`)"
        :aria-label="t(`MineLatinoNav.${item.key}`)"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        :data-testid="`minelatino-nav-${item.key}`"
      >
        <span class="ml-side-icon">
          <v-icon size="18" aria-hidden="true">
            {{ item.icon }}
          </v-icon>
        </span>
        <span class="ml-side-label">{{ t(`MineLatinoNav.${item.key}`) }}</span>
      </RouterLink>
    </div>

    <!-- The three profiles the player has spent the most time in. -->
    <div class="flex flex-col gap-1">
      <div class="ml-side-title">
        {{ t('MineLatinoShell.mostPlayed') }}
      </div>
      <template v-if="topPlayed.length > 0">
        <button
          v-for="inst in topPlayed"
          :key="inst.path"
          type="button"
          class="ml-side-profile"
          :class="{ 'ml-side-profile--active': inst.path === selectedInstance }"
          :title="inst.name"
          @click="select(inst.path)"
        >
          <img
            class="ml-side-profile-icon"
            :src="iconOf(inst)"
            :alt="inst.name"
            draggable="false"
          >
          <span class="ml-side-profile-text min-w-0 flex-grow">
            <span class="ml-side-profile-name">{{ inst.name }}</span>
            <span class="ml-side-profile-time">{{ playtimeOf(inst) }}</span>
          </span>
        </button>
      </template>
      <div v-else class="ml-side-empty">
        {{ t('MineLatinoShell.mostPlayedEmpty') }}
      </div>
    </div>

    <div class="flex-grow" />

    <!-- Session actions, pinned to the bottom of the rail. -->
    <div class="ml-side-sep" role="presentation" />
    <div class="flex flex-col gap-1">
      <button
        type="button"
        class="ml-side-item"
        data-testid="minelatino-options"
        :title="t('MineLatinoShell.options')"
        :aria-label="t('MineLatinoShell.options')"
        @click="router.push('/setting')"
      >
        <span class="ml-side-icon">
          <v-icon size="18" aria-hidden="true">
            settings
          </v-icon>
        </span>
        <span class="ml-side-label">{{ t('MineLatinoShell.options') }}</span>
      </button>

      <RouterLink
        class="ml-side-item"
        to="/minelatino/actualizar"
        data-testid="minelatino-update"
        :title="t('MineLatinoNav.actualizar')"
        :aria-label="t('MineLatinoNav.actualizar')"
      >
        <span class="ml-side-icon">
          <v-icon size="18" aria-hidden="true">
            system_update
          </v-icon>
        </span>
        <span class="ml-side-label">{{ t('MineLatinoNav.actualizar') }}</span>
        <span
          v-if="updateAvailable"
          class="ml-side-dot"
          :title="updateHint"
          aria-hidden="true"
        />
      </RouterLink>

      <button
        type="button"
        class="ml-side-item ml-side-item--danger"
        :disabled="!isSignedIn"
        data-testid="minelatino-logout"
        :title="t('MineLatinoShell.logout')"
        :aria-label="t('MineLatinoShell.logout')"
        @click="logoutDialog = true"
      >
        <span class="ml-side-icon">
          <v-icon size="18" aria-hidden="true">
            logout
          </v-icon>
        </span>
        <span class="ml-side-label">{{ t('MineLatinoShell.logout') }}</span>
      </button>
    </div>

    <!-- XMCL has no session token to drop: signing out removes the account
         from the launcher, hence the confirmation. -->
    <SimpleDialog
      v-model="logoutDialog"
      :title="t('MineLatinoShell.logoutTitle')"
      :width="360"
      @confirm="onLogout"
    >
      {{ t('MineLatinoShell.logoutText') }}
    </SimpleDialog>
  </nav>
</template>
<script lang="ts" setup>
import SimpleDialog from '@/components/SimpleDialog.vue'
import { useLocalStorage } from '@vueuse/core'
import { useService } from '@/composables'
import { kInstances } from '@/composables/instances'
import { useUpdateSettings } from '@/composables/setting'
import { kUserContext } from '@/composables/user'
import { TimeUnit, getHumanizeDuration } from '@/util/date'
import { getInstanceIcon } from '@/util/favicon'
import { injection } from '@/util/inject'
import { UserServiceKey } from '@xmcl/runtime-api'
import type { UserProfile } from '@xmcl/runtime-api'
import type { Instance } from '@xmcl/instance'

const { t } = useI18n()
const collapsed = useLocalStorage('minelatino.sidebar.collapsed', false)
const router = useRouter()
const route = useRoute()
const { instances, selectedInstance } = injection(kInstances)
const { userProfile } = injection(kUserContext)
const { removeUser } = useService(UserServiceKey)

const nav = [
  { key: 'jugar', icon: 'play_arrow', to: '/minelatino/jugar' },
  { key: 'perfiles', icon: 'dashboard_customize', to: '/minelatino/perfiles' },
  { key: 'anuncios', icon: 'campaign', to: '/minelatino/anuncios' },
  { key: 'actualizaciones', icon: 'new_releases', to: '/minelatino/actualizaciones' },
  { key: 'tienda', icon: 'storefront', to: '/minelatino/tienda' },
  { key: 'cosmeticos', icon: 'checkroom', to: '/minelatino/cosmeticos' },
  { key: 'clasificaciones', icon: 'emoji_events', to: '/minelatino/clasificaciones' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}

function select(path: string) {
  selectedInstance.value = path
  router.push('/minelatino/jugar')
}

function iconOf(inst: Instance) {
  return getInstanceIcon(inst, undefined)
}

/** "3 horas" style label, mirroring the instance page's playtime item. */
function playtimeOf(inst: Instance) {
  if (!inst.playtime) return t('instance.neverPlayed')
  const [text, value, unit] = getHumanizeDuration(inst.playtime)
  switch (unit) {
    case TimeUnit.Hour:
      return t('duration.hour', { duration: text }, { plural: value })
    case TimeUnit.Minute:
      return t('duration.minute', { duration: text }, { plural: value })
    case TimeUnit.Second:
      return t('duration.second', { duration: text }, { plural: value })
    case TimeUnit.Day:
    default:
      return t('duration.day', { duration: text }, { plural: value })
  }
}

/** The three profiles with the most accumulated play time. */
const topPlayed = computed(() =>
  instances.value
    .filter(i => i.playtime > 0)
    .sort((a, b) => b.playtime - a.playtime)
    .slice(0, 3),
)

// Same shared settings state the updater writes to, so the dot reflects the
// startup check without this rail fetching anything of its own.
const { updateStatus, updateInfo } = useUpdateSettings()
const updateAvailable = computed(() => updateStatus.value !== 'none' && !!updateInfo.value?.newUpdate)
const updateHint = computed(() => updateInfo.value?.name || t('MineLatinoUpdate.available'))

const isSignedIn = computed(() => !!userProfile.value.id)
const logoutDialog = ref(false)

async function onLogout() {
  const id = userProfile.value.id
  if (!id) return
  await removeUser({ id } as UserProfile)
  logoutDialog.value = false
}
</script>

<style scoped>
.ml-side {
  width: 224px;
  flex-grow: 0;
  flex-shrink: 0;
  border-right: 1px solid var(--ml-border);
  background-color: var(--ml-panel);
}

.ml-side-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: var(--ml-radius-sm);
  color: var(--ml-dim);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
  background: none;
  transition:
    background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.ml-side-item:hover {
  background-color: var(--ml-raise);
  color: var(--ml-text);
}

/* Icon tile: flat dark well, accent when active. */
.ml-side-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background-color: var(--ml-well);
  flex-grow: 0;
  flex-shrink: 0;
  transition: background-color 0.16s ease;
}

.ml-side-item:hover .ml-side-icon {
  background-color: var(--ml-border-soft);
}

.ml-side-item:active {
  transform: none;
  filter: brightness(0.95);
}

.ml-side-item:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-side-item--active {
  background-color: rgba(232, 163, 46, 0.12);
  border-color: var(--ml-accent-border);
  color: var(--ml-accent-text);
}

/* Accent tick in the rail's gutter. */
.ml-side-item--active::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  width: 3px;
  height: 18px;
  transform: translateY(-50%);
  border-radius: 999px;
  background-color: var(--ml-accent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--ml-accent) 60%, transparent);
}

.ml-side-item--active .ml-side-icon {
  background-color: color-mix(in srgb, var(--ml-accent) 18%, var(--ml-well));
}

.ml-side-item--danger:hover {
  background-color: color-mix(in srgb, rgb(var(--v-theme-error)) 12%, transparent);
  color: rgb(var(--v-theme-error));
}

.ml-side-item[disabled] {
  opacity: 0.45;
  cursor: default;
  pointer-events: none;
}

.ml-side-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Live "new launcher version" dot on the Actualizar row. */
.ml-side-dot {
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: 50%;
  background-color: var(--ml-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ml-accent) 25%, transparent);
  flex-grow: 0;
  flex-shrink: 0;
}

/* Hairline separator. */
.ml-side-sep {
  height: 1px;
  margin: 2px 6px;
  background-color: var(--ml-border-soft);
}

.ml-side-title {
  padding: 0 10px 2px;
  font-family: var(--ml-font-head);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ml-faint);
  border-bottom: 2px solid var(--ml-accent-border);
  padding-bottom: 4px;
  margin-bottom: 4px;
}

.ml-side-empty {
  padding: 6px 10px;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--ml-faint);
}

.ml-side-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--ml-radius-sm);
  border: 1px solid transparent;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.ml-side-profile:hover {
  background-color: var(--ml-raise);
}

.ml-side-profile:active {
  filter: brightness(0.95);
}

.ml-side-profile:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-side-profile--active {
  border-color: var(--ml-accent-border);
  background-color: rgba(232, 163, 46, 0.08);
}

.ml-side-profile-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: var(--ml-well);
  box-shadow: 0 0 0 1px var(--ml-border-soft);
}

.ml-side-profile-text {
  display: flex;
  flex-direction: column;
}

.ml-side-profile-name {
  font-size: 0.85rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-side-profile-time {
  font-size: 0.72rem;
  color: var(--ml-faint);
}
</style>
