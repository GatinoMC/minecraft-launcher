<template>
  <v-card
    class="ml-panel flex h-full flex-col"
  >
    <v-card-item class="pb-2">
      <v-card-title class="flex items-center gap-2 text-base">
        <v-icon size="small" :color="accentColor || 'primary'"> new_releases </v-icon>
        {{ updatesSourceLabel || t('MineLatinoHome.updates') }}
        <v-chip
          v-if="updates.stale && updates.items.length > 0"
          size="x-small"
          color="warning"
          variant="tonal"
          :title="updates.error || t('MineLatinoHome.offlineHint')"
        >
          {{ t('MineLatinoHome.offline') }}
        </v-chip>
        <div class="flex-grow" />
        <v-btn
          icon
          size="small"
          variant="text"
          :loading="isValidating"
          :aria-label="t('MineLatinoHome.refresh')"
          @click="refreshUpdates()"
        >
          <v-icon aria-hidden="true"> refresh </v-icon>
        </v-btn>
      </v-card-title>
    </v-card-item>

    <v-card-text class="ml-scroll flex-grow overflow-y-auto pt-0">
      <v-skeleton-loader
        v-if="isValidating && updates.items.length === 0"
        type="list-item-avatar-two-line@3"
      />

      <div v-else-if="updates.items.length === 0" class="ml-empty">
        <v-icon size="36" color="grey"> article </v-icon>
        <div class="mt-2 text-body-2 text-grey">
          {{ updates.error ? t('MineLatinoHome.updatesError') : t('MineLatinoHome.updatesEmpty') }}
        </div>
      </div>

      <!-- Empty `items` renders nothing here, so no `v-else` is needed. -->
      <div
        v-for="item in updates.items"
        :key="item.id"
        class="ml-entry"
        role="button"
        tabindex="0"
        @click="openUpdate(item)"
        @keydown.enter="openUpdate(item)"
        @keydown.space.prevent="openUpdate(item)"
      >
        <div class="ml-thumb">
          <img
            v-if="item.image"
            :src="item.image"
            :alt="item.title"
            loading="lazy"
            draggable="false"
            v-fallback-img="BuiltinImages.minecraft"
          />
          <v-icon v-else size="24" color="grey"> image </v-icon>
        </div>
        <div class="min-w-0 flex-grow">
          <div class="ml-entry-title">{{ item.title }}</div>
          <div class="ml-entry-date" :title="absoluteTime(item.date)">
            {{ relativeTime(item.date) }}
          </div>
          <div v-if="item.excerpt" class="ml-entry-excerpt">{{ item.excerpt }}</div>
        </div>
        <v-icon class="ml-entry-arrow" size="small" aria-hidden="true">
          chevron_right
        </v-icon>
      </div>
    </v-card-text>
  </v-card>
</template>
<script lang="ts" setup>
import { kMineLatino, useRelativeTime } from '@/composables/minelatino'
import { BuiltinImages } from '@/constant'
import { vFallbackImg } from '@/directives/fallbackImage'
import { injection } from '@/util/inject'

const { t } = useI18n()
const {
  updates,
  updatesSourceLabel,
  accentColor,
  isValidating,
  refreshUpdates,
  openUpdate,
} = injection(kMineLatino)
const { from: relativeTime, absolute: absoluteTime } = useRelativeTime()
</script>

<style scoped>
.ml-panel {
  border-radius: var(--ml-radius);
  min-height: 240px;
  background: var(--ml-panel);
  border: 1px solid var(--ml-border);
}

.ml-scroll {
  max-height: 520px;
}

.ml-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.ml-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 8px;
  cursor: pointer;
}

.ml-entry + .ml-entry {
  border-top: 1px solid var(--ml-border-soft);
}

.ml-entry:hover {
  background-color: var(--ml-raise);
}

.ml-entry:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-thumb {
  width: 56px;
  height: 56px;
  flex-grow: 0;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--ml-well);
}

.ml-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ml-entry-title {
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.25;
  color: var(--ml-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ml-entry-date {
  font-size: 0.72rem;
  color: var(--ml-faint);
  margin-top: 1px;
}

.ml-entry-excerpt {
  font-size: 0.8rem;
  color: var(--ml-dim);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ml-entry-arrow {
  flex-grow: 0;
  flex-shrink: 0;
  color: var(--ml-faint);
  transition: color 0.2s ease, transform 0.2s ease;
}

/* Hovering a row is the affordance that the whole row is clickable. */
.ml-entry:hover .ml-entry-arrow {
  color: var(--ml-accent-text);
  transform: translateX(2px);
}
</style>
