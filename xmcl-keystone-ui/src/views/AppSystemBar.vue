<template>
  <v-system-bar
    v-roving-tabindex
    topbar
    window
    role="toolbar"
    :aria-label="systemBarAriaLabel"
    class="moveable static! flex w-full grow-0 gap-1 p-0 text-[.875rem]! bg-[transparent]! dark:color-[#ffffffb3] pr-0 max-h-[30px]"
    :style="{ 'backdrop-filter': `blur(${blurAppBar}px)` }"
  >
    <span
      v-if="back"
      class="flex shrink grow-0 p-0 h-full items-center"
    >
      <div
        v-if="shouldShiftBackControl"
        class="w-[80px]"
      />
      <button
        type="button"
        v-ripple
        class="system-bar-back-btn non-moveable flex cursor-pointer select-none items-center h-full w-[80px]"
        :aria-label="backAriaLabel"
        @click="onBack"
      >
        <v-icon size="small" aria-hidden="true">
          arrow_back
        </v-icon>
      </button>
    </span>
    <slot />

    <AppAudioPlayer
      v-if="!noDebug"
      class="ml-22"
    />

    <div class="flex-grow"/>

    <AppSystemBarBadge
      v-if="gamepadConnected"
      v-shared-tooltip.bottom="() => gamepadLabel"
      icon="sports_esports"
      :text="gamepadLabel"
      :aria-label="gamepadLabel"
      can-hide-text
      class="gamepad-badge"
      @click="openPalette"
    />

    <AppSystemBarBadge
      v-if="!noTask"
      v-shared-tooltip.bottom="() => taskTooltip"
      icon="assignment"
      :can-hide-text="!taskInlineText"
      :text="taskInlineText"
      @click="showTaskDialog()"
    />
    <!--
      "Ayuda": the MineLatino AI assistant in its own window. `injectCss`
      strips the site navbar/footer so only the chat is left (see
      ASSISTANT_CHAT_ONLY_CSS below).
    -->
    <AppSystemBarBadge
      v-shared-tooltip.bottom="() => assistantTooltip"
      icon="smart_toy"
      :text="t('help')"
      :aria-label="assistantTooltip"
      can-hide-text
      @click="openAssistant"
    />
    <!--
      "Discord": the invite link, handed to the system browser so the
      installed Discord app can take over the `discord://` redirect.
    -->
    <AppSystemBarBadge
      v-shared-tooltip.bottom="() => discordTooltip"
      icon="xmcl:discord"
      :text="t('MineLatinoHome.discord')"
      :aria-label="discordTooltip"
      can-hide-text
      @click="openDiscord"
    />

    <span
      v-roving-tabindex
      class="flex h-full shrink grow-0 p-0"
      role="group"
      :aria-label="windowControlsAriaLabel"
    >
      <button
        v-if="!hideWindowControl"
        type="button"
        v-ripple
        :aria-label="minimizeAriaLabel"
        class="non-moveable system-btn"
        @click="minimize"
      >
        <v-icon size="small" aria-hidden="true">minimize</v-icon>
      </button>
      <button
        v-if="!hideWindowControl"
        type="button"
        v-ripple
        :aria-label="maximizeAriaLabel"
        class="non-moveable system-btn"
        @click="maximize"
      >
        <v-icon size="small" aria-hidden="true">crop_din</v-icon>
      </button>
      <button
        v-if="!hideWindowControl"
        type="button"
        v-ripple
        :aria-label="closeAriaLabel"
        class="non-moveable system-btn system-btn--close"
        @click="close"
      >
        <v-icon size="small" aria-hidden="true">close</v-icon>
      </button>
    </span>
  </v-system-bar>
</template>
<script lang="ts" setup>
import { useDialog } from '../composables/dialog'
import { useTaskCount } from '../composables/task'
import { useGamepad } from '@/composables/gamepad'

import { injection } from '@/util/inject'
import { useWindowStyle } from '@/composables/windowStyle'
import AppSystemBarBadge from '@/components/AppSystemBarBadge.vue'
import AppAudioPlayer from '@/components/AppAudioPlayer.vue'
import { kTheme } from '@/composables/theme'
import { useCommandPaletteVisible } from '@/composables/commandPalette'
import { kNetworkStatus } from '@/composables/useNetworkStatus'
import { vRovingTabindex } from '@/directives/rovingTabindex'
import { vSharedTooltip } from '@/directives/sharedTooltip'
import { getExpectedSize } from '@/util/size'

import { MineLatinoServiceKey } from '@xmcl/runtime-api'
import { useService } from '@/composables/service'

const props = defineProps<{
  noUser?: boolean
  noTask?: boolean
  noDebug?: boolean
  back?: boolean
}>()

const { blurAppBar } = injection(kTheme)
const { maximize, minimize, close, hide } = windowController
const { shouldShiftBackControl, hideWindowControl } = useWindowStyle()
const { show: showTaskDialog } = useDialog('task')
const { t } = useI18n()
const { count } = useTaskCount()
// Optional: the standalone multiplayer/app windows don't provide network status.
const networkStatus = inject(kNetworkStatus, undefined)?.status ?? ref(null)
const mineLatinoService = useService(MineLatinoServiceKey)

const taskSpeedText = computed(() => networkStatus.value?.downloadSpeed
  ? `${getExpectedSize(networkStatus.value.downloadSpeed)}/s`
  : '')
const taskCountText = computed(() => count.value === 0
  ? t('task.empty')
  : t('task.nTaskRunning', { count: count.value }))
const taskInlineText = computed(() => {
  if (count.value === 0) return ''
  return taskSpeedText.value || taskCountText.value
})
const taskTooltip = computed(() => {
  if (count.value === 0) return t('task.empty')
  if (taskSpeedText.value) return `${taskCountText.value} · ${taskSpeedText.value}`
  return taskCountText.value
})

const paletteShown = useCommandPaletteVisible()
const { connected: gamepadConnected, name: gamepadName } = useGamepad()
const gamepadLabel = computed(() => gamepadName.value || t('gamepad.connected'))
const openPalette = () => { paletteShown.value = true }

/** MineLatino Discord invite. */
const DISCORD_URL = 'https://ds.minelatino.com'
const ASSISTANT_URL = 'https://staff.minelatino.net/asistente'
const ASSISTANT_WINDOW_ID = 'minelatino-asistente'

/**
 * `/asistente` ships the whole staff site with the chat in the middle, so every
 * sibling of the chat section is hidden and that section is stretched to fill
 * the window.
 *
 * Only *direct* `<body>` children are targeted: the chat's own title bar is a
 * `<header class="assistant-header">`, its input row a `<footer class="composer">`,
 * and the site footer nests `<section>`/`<nav>` of its own — bare tag selectors
 * would delete the chat along with the chrome. The hidden `<meta>`, `<link>`,
 * `<style>` and `<script>` siblings are not rendered anyway and keep working,
 * which matters because the chat reads `meta[name=csrf-token]` before POSTing.
 */
const ASSISTANT_CHAT_ONLY_CSS = `
html, body {
  height: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
body > *:not(section.assistant-section) {
  display: none !important;
}
body > section.assistant-section {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
}
body > section.assistant-section > .assistant-shell {
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  min-height: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  grid-template-rows: auto minmax(0, 1fr) auto !important;
}
`

const assistantTooltip = computed(() => t('MineLatinoAssistant.tooltip'))
const discordTooltip = computed(() => t('MineLatinoHome.joinDiscord'))

function openAssistant() {
  // Reuses the store/vote window: an already-open assistant is just focused.
  mineLatinoService.openWebWindow({
    id: ASSISTANT_WINDOW_ID,
    title: t('MineLatinoAssistant.title'),
    url: ASSISTANT_URL,
    injectCss: ASSISTANT_CHAT_ONLY_CSS,
  }).catch(() => {})
}

function openDiscord() {
  // ElectronController's windowOpenHandler sends any non-`app` host to
  // `shell.openExternal`, so this lands in the system browser and from there
  // in the installed Discord app.
  window.open(DISCORD_URL, 'browser')
}

const router = useRouter()
const onBack = () => {
  router.back()
}

const systemBarAriaLabel = 'Window'
const backAriaLabel = computed(() => t('shared.back'))
const minimizeAriaLabel = 'Minimize'
const maximizeAriaLabel = 'Maximize'
const closeAriaLabel = 'Close'
const windowControlsAriaLabel = 'Window controls'
</script>
<style lang="css" scoped>
/* Keep a long controller name from pushing/overflowing the bar. */
.gamepad-badge {
  max-width: 180px;
  overflow: hidden;
}
.gamepad-badge :deep(.whitespace-nowrap) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.system-btn {
  @apply  h-full top-0 mr-0 flex cursor-pointer select-none items-center justify-center px-3 py-1 after:hidden! w-[40px] min-w-[40px];
  font-size: 16px !important;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
  background: transparent;
  border: 0;
  color: inherit;
  appearance: none;
}

.system-btn:hover {
  background: rgba(255, 255, 255, 0.5);
}

.system-btn--close:hover {
  background: rgb(209, 12, 12);
}

.system-bar-back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.system-btn:focus-visible,
.system-bar-back-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.7);
  outline-offset: -2px;
}

.system-bar-back-btn {
  background: transparent;
  border: 0;
  color: inherit;
  appearance: none;
  justify-content: center;
}
</style>
