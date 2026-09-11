<template>
  <v-card
    v-if="items.length > 0"
    class="ml-panel"
    data-testid="minelatino-presets"
  >
    <v-card-item class="pb-2">
      <v-card-title class="flex items-center gap-2 text-base">
        <v-icon size="small" :color="accentColor || 'primary'"> tune </v-icon>
        {{ t('MineLatinoPreset.title') }}
      </v-card-title>
      <v-card-subtitle class="pt-1 text-caption">
        {{ t('MineLatinoPreset.subtitle') }}
      </v-card-subtitle>
    </v-card-item>

    <v-card-text class="pt-0">
      <v-alert
        v-if="error"
        class="mb-3"
        type="error"
        variant="tonal"
        density="compact"
        closable
        data-testid="minelatino-preset-error"
        @click:close="clearError"
      >
        {{ error }}
      </v-alert>

      <!-- A mod that Modrinth could not resolve is not fatal, but the player has
           to know which ones are missing before joining the server. -->
      <v-alert
        v-if="skipped.length > 0"
        class="mb-3"
        type="warning"
        variant="tonal"
        density="compact"
        closable
        data-testid="minelatino-preset-skipped"
        @click:close="clearSkipped"
      >
        {{ t('MineLatinoPreset.skippedMods', { mods: skipped.join(', ') }) }}
      </v-alert>

      <div class="ml-presets">
        <div
          v-for="item in items"
          :key="item.preset.id"
          class="ml-preset"
          :data-testid="`minelatino-preset-${item.preset.id}`"
        >
          <div class="ml-preset-head">
            <v-icon size="20" :color="accentColor || 'primary'" aria-hidden="true">
              {{ item.preset.icon || 'extension' }}
            </v-icon>
            <span class="ml-preset-name">{{ item.preset.name }}</span>
            <v-chip
              v-if="item.preset.recommended"
              size="x-small"
              variant="tonal"
              :color="accentColor || 'primary'"
            >
              {{ t('MineLatinoPreset.recommended') }}
            </v-chip>
          </div>

          <div v-if="item.preset.description" class="ml-preset-desc">
            {{ item.preset.description }}
          </div>

          <div class="ml-preset-meta">
            <span class="ml-tag">Minecraft {{ item.preset.minecraftVersion }}</span>
            <span v-if="item.preset.loader !== 'vanilla'" class="ml-tag">
              {{ loaderLabel(item.preset.loader) }}
            </span>
            <span
              v-if="item.preset.mods.length > 0"
              class="ml-tag"
              :title="modList(item.preset)"
            >
              {{ t('MineLatinoPreset.mods', { count: item.preset.mods.length }) }}
            </span>
          </div>

          <v-btn
            v-if="!item.path"
            class="mt-2"
            size="small"
            variant="flat"
            :color="accentColor || 'primary'"
            :loading="creating === item.preset.id"
            :disabled="!!creating && creating !== item.preset.id"
            data-testid="minelatino-preset-create"
            @click="create(item.preset)"
          >
            <v-icon v-if="creating !== item.preset.id" start aria-hidden="true"> add </v-icon>
            {{ creating === item.preset.id
              ? t('MineLatinoPreset.creating')
              : t('MineLatinoPreset.create') }}
          </v-btn>
          <v-btn
            v-else
            class="mt-2"
            size="small"
            variant="tonal"
            data-testid="minelatino-preset-use"
            @click="select(item.preset)"
          >
            <v-icon start aria-hidden="true"> check </v-icon>
            {{ t('MineLatinoPreset.use') }}
          </v-btn>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
<script lang="ts" setup>
import { kMineLatino } from '@/composables/minelatino'
import { useMineLatinoPreset } from '@/composables/minelatinoPreset'
import { injection } from '@/util/inject'
import type { MineLatinoLoader, MineLatinoPreset } from '@xmcl/runtime-api'

const { t } = useI18n()
const { presets, accentColor } = injection(kMineLatino)

const { items, creating, error, skipped, create, select } = useMineLatinoPreset(presets)

function clearError() {
  error.value = ''
}

function clearSkipped() {
  skipped.value = []
}

/** Loader names are proper nouns, so they are not translated. */
const LOADER_LABELS: Record<MineLatinoLoader, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge',
}

function loaderLabel(loader: MineLatinoLoader) {
  return LOADER_LABELS[loader] ?? loader
}

/** Tooltip listing the starter mods behind the "N mods" tag. */
function modList(preset: MineLatinoPreset) {
  return preset.mods.map(m => m.projectId).join(', ')
}
</script>

<style scoped>
.ml-panel {
  border-radius: var(--ml-radius);
  background: var(--ml-panel);
  border: 1px solid var(--ml-border);
}

.ml-presets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.ml-preset {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: var(--ml-radius-sm);
  border: 1px solid var(--ml-border-soft);
  background-color: var(--ml-raise);
}

.ml-preset-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ml-preset-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--ml-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-preset-desc {
  margin-top: 4px;
  font-size: 0.8rem;
  line-height: 1.35;
  color: var(--ml-dim);
}

.ml-preset-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.ml-tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  background-color: rgba(232, 163, 46, 0.12);
  color: var(--ml-accent-text);
}
</style>
