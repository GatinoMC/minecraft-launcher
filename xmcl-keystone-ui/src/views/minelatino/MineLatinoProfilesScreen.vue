<!--
  MineLatino "Perfiles" screen: lists all instances as cards and lets the user
  create new profiles with an integrated Modrinth mod/resourcepack/shader
  browser (replicating the Modrinth app experience).
-->
<template>
  <div
    class="ml-profiles flex flex-col gap-3 p-4 h-full"
    data-testid="minelatino-profiles-screen"
  >
    <div class="ml-profiles-head flex flex-grow-0 items-center gap-3">
      <v-icon size="22" :color="accentColor || 'primary'" aria-hidden="true">
        dashboard_customize
      </v-icon>
      <div class="min-w-0">
        <div class="ml-profiles-title">
          {{ t('MineLatinoProfiles.title') }}
        </div>
        <div class="ml-profiles-subtitle">
          {{ t('MineLatinoProfiles.subtitle') }}
        </div>
      </div>
      <div class="flex-grow" />
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        @click="showCreateDialog = true"
      >
        <v-icon start size="16">add</v-icon>
        {{ t('MineLatinoProfiles.create') }}
      </v-btn>
    </div>

    <!-- Instance grid -->
    <div v-if="instances.length > 0" class="ml-profiles-grid flex-grow overflow-y-auto">
      <div
        v-for="inst in instances"
        :key="inst.path"
        class="ml-profile-card rounded-xl pa-3 flex items-center gap-3 cursor-pointer"
        :class="{ 'ml-profile-card--selected': inst.path === selectedInstance }"
        @click="selectInstance(inst.path)"
      >
        <div class="ml-profile-icon flex-shrink-0">
          <v-avatar size="48" rounded="lg" color="rgba(255,255,255,0.06)">
            <v-img :src="iconOf(inst)" />
          </v-avatar>
        </div>
        <div class="min-w-0 flex-grow">
          <div class="text-sm font-semibold truncate" style="color: var(--ml-text)">{{ inst.name }}</div>
          <div class="text-xs truncate" style="color: var(--ml-dim)">
            {{ inst.runtime?.minecraft || '' }}
            <template v-if="inst.runtime?.forge"> &middot; Forge</template>
            <template v-else-if="inst.runtime?.fabricLoader"> &middot; Fabric</template>
            <template v-else-if="inst.runtime?.neoForged"> &middot; NeoForge</template>
            <template v-else-if="inst.runtime?.quiltLoader"> &middot; Quilt</template>
          </div>
          <div v-if="inst.playtime" class="text-xs mt-0.5" style="color: var(--ml-dim)">
            <v-icon size="12" class="mr-0.5">schedule</v-icon>
            {{ formatPlaytime(inst.playtime) }}
          </div>
        </div>
        <v-icon v-if="inst.path === selectedInstance" size="18" color="primary">check_circle</v-icon>
        <v-btn
          icon
          variant="text"
          size="x-small"
          color="error"
          class="ml-profile-delete"
          :aria-label="t('MineLatinoProfiles.delete')"
          @click.stop="confirmDelete(inst)"
        >
          <v-icon size="18">delete</v-icon>
        </v-btn>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="flex-grow flex flex-col items-center justify-center gap-3 text-center">
      <v-icon size="48" color="grey">dashboard_customize</v-icon>
      <div class="text-sm" style="color: var(--ml-dim)">{{ t('MineLatinoProfiles.empty') }}</div>
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        @click="showCreateDialog = true"
      >
        <v-icon start size="16">add</v-icon>
        {{ t('MineLatinoProfiles.create') }}
      </v-btn>
    </div>

    <!-- Creation dialog -->
    <MineLatinoCreateProfileDialog
      v-model="showCreateDialog"
      @created="onCreated"
    />

    <!-- Delete confirmation dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title class="text-base font-semibold">
          {{ t('MineLatinoProfiles.deleteTitle') }}
        </v-card-title>
        <v-card-text>
          {{ t('MineLatinoProfiles.deleteConfirm', { name: pendingDelete?.name || '' }) }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDeleteDialog = false">
            {{ t('MineLatinoProfiles.deleteCancel') }}
          </v-btn>
          <v-btn color="error" variant="flat" @click="doDelete">
            {{ t('MineLatinoProfiles.deleteConfirmBtn') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { injection } from '@/util/inject'
import { kInstances } from '@/composables/instances'
import { kMineLatino } from '@/composables/minelatino'
import { getInstanceIcon } from '@/util/favicon'
import MineLatinoCreateProfileDialog from '@/components/MineLatinoCreateProfileDialog.vue'
import type { Instance } from '@xmcl/instance'

const { t } = useI18n()
const { accentColor } = injection(kMineLatino)
const { instances, selectedInstance, remove } = injection(kInstances)

const router = useRouter()
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const pendingDelete = ref<Instance | null>(null)

function selectInstance(instancePath: string) {
  selectedInstance.value = instancePath
  router.push('/minelatino/jugar')
}

function onCreated(newPath: string) {
  selectedInstance.value = newPath
  router.push('/minelatino/jugar')
}

function confirmDelete(inst: Instance) {
  pendingDelete.value = inst
  showDeleteDialog.value = true
}

async function doDelete() {
  if (!pendingDelete.value) return
  await remove(pendingDelete.value.path, true)
  showDeleteDialog.value = false
  pendingDelete.value = null
}

function formatPlaytime(ms: number): string {
  const hours = ms / 3_600_000
  if (hours >= 100) return `${Math.round(hours)} h`
  if (hours >= 1) return `${hours.toFixed(1)} h`
  const minutes = ms / 60_000
  return `${Math.round(minutes)} min`
}

function iconOf(inst: Instance) {
  return getInstanceIcon(inst, undefined)
}
</script>

<style scoped>
.ml-profiles {
  box-sizing: border-box;
}

.ml-profiles-title {
  font-family: var(--ml-font-head);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--ml-text);
}

.ml-profiles-subtitle {
  font-size: 0.8rem;
  color: var(--ml-dim);
}

.ml-profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  align-content: start;
  min-height: 0;
}

.ml-profile-card {
  background: var(--ml-panel);
  border: 1px solid var(--ml-border);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.ml-profile-card:hover {
  background: var(--ml-raise);
  border-color: var(--ml-accent);
}

.ml-profile-card--selected {
  border-color: var(--ml-accent);
  background: var(--ml-raise);
}

.ml-profile-delete {
  opacity: 0.72;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.ml-profile-card:hover .ml-profile-delete,
.ml-profile-delete:focus-visible {
  opacity: 1;
}
</style>
