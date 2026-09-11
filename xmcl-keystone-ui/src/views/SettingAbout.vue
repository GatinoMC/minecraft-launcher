<template>
  <section class="about">
    <XmclAccountPanel class="mb-4" />
    <SettingCard>
      <div class="pa-4">
        <!-- Logo & Header info -->
        <div class="d-flex align-center flex-wrap gap-4 mb-6">
          <v-img
            :src="logo"
            alt="MineLatino Logo"
            width="64"
            height="64"
            class="mr-4 rounded-lg flex-grow-0 flex-shrink-0"
          ></v-img>
          <div>
            <a
              class="text-h5 font-weight-bold text-decoration-none"
              href="https://minelatino.com"
              target="_blank"
              v-shared-tooltip="() => productName"
            >
              {{ productName }}
            </a>
            <div v-if="version" class="text-caption opacity-70 mt-1">
              {{ t('setting.launcherVersion', { version }) }}
            </div>
          </div>
          <v-spacer />
          <div class="d-flex align-center gap-2">
            <v-icon color="primary" size="small">verified</v-icon>
            <div class="text-caption font-weight-medium">{{ t('setting.aboutLicense') }}</div>
          </div>
        </div>
        <div class="text-caption opacity-70 mb-6">
          NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
        </div>

        <div class="upstream-card mb-8 pa-4 pa-sm-5">
          <div class="upstream-card__icon" aria-hidden="true">
            <v-icon size="28">account_tree</v-icon>
          </div>
          <div class="upstream-card__content">
            <div class="d-flex align-center flex-wrap gap-2 mb-2">
              <div class="text-subtitle-1 font-weight-bold">
                {{ t('setting.baseProjectTitle') }}
              </div>
              <v-chip color="primary" size="small" variant="tonal">
                {{ t('setting.openSource') }}
              </v-chip>
            </div>
            <p class="text-body-2 opacity-90 mb-2">
              {{ t('setting.baseProjectDescription') }}
            </p>
            <p class="text-caption opacity-70 mb-4">
              {{ t('setting.baseProjectDisclaimer') }}
            </p>
            <div class="d-flex flex-wrap gap-2">
              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="code"
                @click="openInBrowser(XMCL_REPOSITORY_URL)"
              >
                {{ t('setting.viewXmclSource') }}
              </v-btn>
              <v-btn
                variant="text"
                prepend-icon="description"
                @click="openInBrowser(XMCL_LICENSE_URL)"
              >
                {{ t('setting.viewMitLicense') }}
              </v-btn>
            </div>
          </div>
        </div>

        <!-- Debug Info Box -->
        <div class="mb-8">
          <div class="text-subtitle-2 font-weight-bold mb-2 opacity-80">
            {{ t('setting.about') }}
          </div>
          <pre
            class="debug-info-code pa-4 text-caption font-mono"
          ><code>{{ debugInfo }}</code></pre>
        </div>
      </div>
    </SettingCard>
  </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import XmclAccountPanel from '@/components/XmclAccountPanel.vue'
import SettingCard from '@/components/SettingCard.vue'
import { kEnvironment } from '@/composables/environment'
import { kFlights } from '@/composables/flights'
import { useMineLatino } from '@/composables/minelatino'
import { vSharedTooltip } from '@/directives/sharedTooltip'
import { injection } from '@/util/inject'
import logo from '../assets/minelatino-logo.png'

const env = injection(kEnvironment)
const flights = injection(kFlights)

const debugInfo = computed(() => {
  return JSON.stringify({ ...env.value, flights }, null, 2)
})

const { t } = useI18n()
const version = computed(() => env.value?.version ?? '')

// The operator-configured name, with the product name as the offline fallback
// so the page never flashes the upstream launcher's identity.
const { branding, openInBrowser } = useMineLatino()
const productName = computed(() => branding.value?.name || 'MineLatino')
const XMCL_REPOSITORY_URL = 'https://github.com/Voxelum/x-minecraft-launcher'
const XMCL_LICENSE_URL = `${XMCL_REPOSITORY_URL}/blob/master/LICENSE`
</script>

<style scoped>
.upstream-card {
  display: flex;
  gap: 16px;
  border: 1px solid rgba(var(--v-theme-primary), 0.24);
  border-radius: var(--card-item-radius);
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.12), rgba(var(--v-theme-surface), 0.2));
}

.upstream-card__icon {
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.14);
}

.upstream-card__content {
  min-width: 0;
}

@media (max-width: 600px) {
  .upstream-card {
    flex-direction: column;
  }
}

.debug-info-code {
  background: rgba(0, 0, 0, 0.25);
  border: var(--card-subsection-border);
  border-radius: var(--card-item-radius);
  color: rgba(var(--v-theme-on-surface), 0.85);
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

:deep(.v-img__img) {
  object-fit: contain;
}
</style>
