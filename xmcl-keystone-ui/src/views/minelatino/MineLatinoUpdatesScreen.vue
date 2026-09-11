<!--
  MineLatino "Actualizaciones" screen: a full-screen wrapper around the reused
  `MineLatinoUpdates.vue` changelog feed. The panel keeps its own
  refresh/empty/open behaviour; the wrapper only lifts its `max-height` cap so
  the list fills the dedicated screen. `kMineLatino` comes from the shell.
-->
<template>
  <div
    v-if="isConfigured"
    data-testid="minelatino-updates-screen"
    class="ml-screen flex flex-col gap-3 p-4"
  >
    <MineLatinoUpdates class="ml-screen-panel" />
  </div>
</template>
<script lang="ts" setup>
import { kMineLatino } from '@/composables/minelatino'
import { injection } from '@/util/inject'
import MineLatinoUpdates from './MineLatinoUpdates.vue'

const { isConfigured } = injection(kMineLatino)
</script>

<style scoped>
.ml-screen {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

/* The reused panel caps its scroll area for the dashboard; on its own screen it
   should use the available height instead. */
.ml-screen :deep(.ml-scroll) {
  max-height: calc(100vh - 180px);
}
</style>
