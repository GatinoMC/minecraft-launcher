<!--
  MineLatino "Anuncios" screen: a full-screen wrapper around the reused
  `MineLatinoNews.vue` Discord feed, with a Discord invite call-to-action above
  it. The feed keeps its own refresh/empty/lightbox behaviour; the wrapper only
  gives it room to breathe by lifting its `max-height` cap to the viewport.
  `kMineLatino` comes from the shell.
-->
<template>
  <div
    v-if="isConfigured"
    data-testid="minelatino-news-screen"
    class="ml-screen flex flex-col gap-3 p-4"
  >
    <div v-if="newsInviteUrl" class="ml-screen-actions">
      <v-btn
        variant="tonal"
        color="#5865F2"
        size="small"
        @click="openInBrowser(newsInviteUrl)"
      >
        <v-icon start aria-hidden="true"> xmcl:discord </v-icon>
        {{ t('MineLatinoHome.joinDiscord') }}
      </v-btn>
    </div>

    <MineLatinoNews class="ml-screen-panel" />
  </div>
</template>
<script lang="ts" setup>
import { kMineLatino } from '@/composables/minelatino'
import { injection } from '@/util/inject'
import MineLatinoNews from './MineLatinoNews.vue'

const { t } = useI18n()
const { newsInviteUrl, isConfigured, openInBrowser } = injection(kMineLatino)
</script>

<style scoped>
.ml-screen {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.ml-screen-actions {
  display: flex;
  justify-content: flex-end;
}

/* The reused panel caps its scroll area for the dashboard; on its own screen it
   should use the available height instead. */
.ml-screen :deep(.ml-scroll) {
  max-height: calc(100vh - 200px);
}
</style>
