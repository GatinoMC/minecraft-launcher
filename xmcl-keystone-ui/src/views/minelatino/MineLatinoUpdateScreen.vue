<!--
  MineLatino "Actualizar" screen: the launcher's own self-update surface.

  It reuses XMCL's in-place updater (asar swap on quit) rather than sending the
  player to re-download the installer. `useUpdateSettings()` drives the whole
  `none -> pending -> ready` state machine that `BaseService` already maintains
  (it auto-checks on startup), and the manifest it reads is published on the
  MineLatino GitHub releases, so "connect to GitHub" needs no new mechanism —
  only this screen to make it one tap away.

  `kEnvironment` + `kSettingsState` are provided by `windows/main/Context.ts`, so
  this works anywhere under the shell without depending on `Setting.vue`.
-->
<template>
  <div
    v-if="isConfigured"
    data-testid="minelatino-update-screen"
    class="ml-screen flex flex-col gap-4 p-4"
  >
    <div class="ml-update-card">
      <div class="ml-update-head">
        <v-icon class="ml-update-icon" size="40" aria-hidden="true"> system_update </v-icon>
        <div class="ml-update-headtext">
          <h2 class="ml-update-title">
            {{ t('MineLatinoUpdate.title') }}
          </h2>
          <p class="ml-update-subtitle">
            {{ t('MineLatinoUpdate.subtitle') }}
          </p>
        </div>
      </div>

      <div class="ml-update-version">
        <span class="ml-update-version-label">{{ t('MineLatinoUpdate.currentVersion') }}</span>
        <span class="ml-update-version-value">v{{ version }}</span>
      </div>

      <!-- One line that always says where the launcher stands right now. -->
      <div class="ml-update-status">
        <template v-if="checkingUpdate">
          <v-progress-circular indeterminate size="20" width="2" />
          <span>{{ t('MineLatinoUpdate.checking') }}</span>
        </template>
        <template v-else-if="updateStatus === 'ready'">
          <v-icon color="success" aria-hidden="true">download_done</v-icon>
          <span>{{ t('MineLatinoUpdate.ready') }}</span>
        </template>
        <template v-else-if="isManual && hasNewUpdate">
          <v-icon color="warning" aria-hidden="true">open_in_new</v-icon>
          <span>{{ t('setting.maunalUpdateHint') }}</span>
        </template>
        <template v-else-if="hasNewUpdate">
          <v-icon color="primary" aria-hidden="true">new_releases</v-icon>
          <span>
            {{ t('MineLatinoUpdate.available') }}
            <b v-if="updateInfo"> · {{ updateInfo.name }}</b>
          </span>
        </template>
        <template v-else>
          <v-icon color="success" aria-hidden="true">check_circle</v-icon>
          <span>{{ t('MineLatinoUpdate.latest') }}</span>
        </template>
      </div>

      <!-- Release notes, when the manifest carried a body worth showing. -->
      <div v-if="releaseNotes" class="ml-update-notes">
        <div class="ml-update-notes-title">
          {{ t('MineLatinoUpdate.releaseNotes') }}
        </div>
        <div class="markdown-body" v-html="releaseNotes" />
      </div>

      <div class="ml-update-actions">
        <v-btn
          v-if="updateStatus === 'ready'"
          color="primary"
          :loading="installing"
          data-testid="minelatino-update-install"
          @click="quitAndInstall()"
        >
          <v-icon start aria-hidden="true">refresh</v-icon>
          {{ t('MineLatinoUpdate.installRestart') }}
        </v-btn>
        <v-btn
          v-else-if="hasNewUpdate && !isManual"
          color="primary"
          :loading="downloadingUpdate"
          :disabled="checkingUpdate"
          data-testid="minelatino-update-download"
          @click="downloadUpdate()"
        >
          <v-icon start aria-hidden="true">cloud_download</v-icon>
          {{ downloadingUpdate ? t('MineLatinoUpdate.downloading') : t('MineLatinoUpdate.downloadUpdate') }}
        </v-btn>
        <v-btn
          v-else
          variant="tonal"
          :loading="checkingUpdate"
          data-testid="minelatino-update-check"
          @click="checkUpdate()"
        >
          <v-icon start aria-hidden="true">refresh</v-icon>
          {{ t('MineLatinoUpdate.check') }}
        </v-btn>

        <v-spacer />

        <v-btn variant="text" @click="openInBrowser(RELEASES_URL)">
          <v-icon start aria-hidden="true">signpost</v-icon>
          {{ t('MineLatinoUpdate.openRelease') }}
        </v-btn>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { kMineLatino } from '@/composables/minelatino'
import { useMarkdown } from '@/composables/markdown'
import { useUpdateSettings } from '@/composables/setting'
import { injection } from '@/util/inject'

const { t } = useI18n()
const { isConfigured, openInBrowser } = injection(kMineLatino)
const { render } = useMarkdown()
const {
  version, updateStatus, updateInfo, checkingUpdate, downloadingUpdate, installing,
  checkUpdate, downloadUpdate, quitAndInstall,
} = useUpdateSettings()

/** MineLatino's own releases, never the upstream XMCL repository. */
const RELEASES_URL = 'https://github.com/FredyGraces20/MineLatino-Launcher/releases'

const hasNewUpdate = computed(() => updateStatus.value !== 'none' && !!updateInfo.value?.newUpdate)
// A `manual` operation has no in-place asar to swap, so download/install are
// hidden and the player is pointed at the GitHub release instead.
const isManual = computed(() => updateInfo.value?.operation === 'manual')

const releaseNotes = computed(() => {
  const body = updateInfo.value?.body ?? ''
  if (!body) return ''
  // Strip the XMCL changelog's anchor links so headings render as plain text.
  const transformed = body.replace(/## \[(.+)\]\(#.+\)/g, (str, v) => `## ${v}`)
  return render(transformed)
})

onMounted(() => {
  // Refresh the manifest on entry so the status reflects the latest release even
  // if the startup check ran a while ago. `BaseService` short-circuits this in a
  // dev server, where it is a harmless no-op.
  checkUpdate()
})
</script>

<style scoped>
.ml-screen {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

.ml-update-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  border-radius: var(--ml-radius);
  border: 1px solid var(--ml-border);
  background-color: var(--ml-panel);
}

.ml-update-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.ml-update-icon {
  color: var(--ml-accent-text);
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-update-title {
  font-family: var(--ml-font-head);
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--ml-text);
}

.ml-update-subtitle {
  font-size: 0.9rem;
  color: var(--ml-dim);
  line-height: 1.35;
}

.ml-update-version {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}

.ml-update-version-label {
  color: var(--ml-faint);
}

.ml-update-version-value {
  font-weight: 700;
  color: var(--ml-text);
}

.ml-update-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--ml-radius-sm);
  font-size: 0.95rem;
  color: var(--ml-dim);
  background-color: var(--ml-well);
  border: 1px solid var(--ml-border-soft);
}

.ml-update-notes {
  max-height: 40vh;
  overflow: auto;
  padding: 12px 14px;
  border-radius: var(--ml-radius-sm);
  border: 1px solid var(--ml-border-soft);
  background-color: var(--ml-well);
}

.ml-update-notes-title {
  font-family: var(--ml-font-head);
  font-weight: 700;
  font-size: 0.9rem;
  margin-bottom: 6px;
  color: var(--ml-text);
}

.ml-update-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
