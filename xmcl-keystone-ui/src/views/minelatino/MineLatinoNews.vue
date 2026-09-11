<template>
  <v-card
    class="ml-panel flex h-full flex-col"
  >
    <v-card-item class="pb-2">
      <v-card-title class="flex items-center gap-2 text-base">
        <v-icon size="small" color="#5865F2"> xmcl:discord </v-icon>
        {{ t('MineLatinoHome.news') }}
        <v-chip
          v-if="news.stale && news.items.length > 0"
          size="x-small"
          color="warning"
          variant="tonal"
          :title="news.error || t('MineLatinoHome.offlineHint')"
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
          @click="refreshNews()"
        >
          <v-icon aria-hidden="true"> refresh </v-icon>
        </v-btn>
        <v-btn
          v-if="newsInviteUrl"
          icon
          size="small"
          variant="text"
          :aria-label="t('MineLatinoHome.openDiscord')"
          @click="openInBrowser(newsInviteUrl)"
        >
          <v-icon aria-hidden="true"> open_in_new </v-icon>
        </v-btn>
      </v-card-title>
    </v-card-item>

    <v-card-text class="ml-scroll flex-grow overflow-y-auto pt-0">
      <v-skeleton-loader
        v-if="isValidating && news.items.length === 0"
        type="list-item-avatar-two-line@3"
      />

      <div v-else-if="news.items.length === 0" class="ml-empty">
        <v-icon size="36" color="grey"> forum </v-icon>
        <div class="mt-2 text-body-2 text-grey">
          {{ news.error ? t('MineLatinoHome.newsError') : t('MineLatinoHome.newsEmpty') }}
        </div>
        <v-btn
          v-if="newsInviteUrl"
          class="mt-3"
          size="small"
          variant="tonal"
          color="primary"
          @click="openInBrowser(newsInviteUrl)"
        >
          <v-icon start aria-hidden="true"> xmcl:discord </v-icon>
          {{ t('MineLatinoHome.joinDiscord') }}
        </v-btn>
      </div>

      <!--
        No `v-else` on the `v-for` below: when `news.items` is empty the loop
        renders nothing by itself, so the skeleton and the empty state are the
        only branches that need a condition. Mixing `v-else` with `v-for` on one
        node also makes `v-if` win the priority race, which the lint rules reject.
      -->
      <article
        v-for="item in news.items"
        :key="item.id"
        class="ml-message"
      >
        <v-avatar size="36" class="ml-avatar" color="#5865F2">
          <img
            v-if="item.authorAvatar"
            :src="item.authorAvatar"
            :alt="item.author"
            draggable="false"
          />
          <span v-else>{{ item.author.charAt(0).toUpperCase() }}</span>
        </v-avatar>

        <div class="min-w-0 flex-grow">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="ml-author">{{ item.author }}</span>
            <span
              class="ml-time"
              :title="absoluteTime(item.timestamp)"
            >{{ relativeTime(item.timestamp) }}</span>
            <v-chip
              v-if="item.isAnnouncement"
              size="x-small"
              color="primary"
              variant="tonal"
            >
              {{ t('MineLatinoHome.announcement') }}
            </v-chip>
          </div>

          <!--
            Rendered by our own escape-first Discord subset, never by the shared
            `useMarkdown()` helper, which runs with `html: true` and would let a
            message inject markup into the launcher.
          -->
          <div
            v-if="item.content"
            class="ml-content"
            v-html="render(item.content)"
          />

          <div v-if="item.images.length > 0" class="ml-images">
            <img
              v-for="src in item.images"
              :key="src"
              :src="src"
              class="ml-image"
              loading="lazy"
              draggable="false"
              :alt="t('MineLatinoHome.attachment')"
              @click="lightbox = src"
            />
          </div>

          <div
            v-for="(embed, index) in item.embeds"
            :key="`${item.id}-embed-${index}`"
            class="ml-embed"
            :style="{ 'border-left-color': embedColor(embed.color) }"
          >
            <div v-if="embed.title" class="ml-embed-title">
              <a
                v-if="embed.url"
                :href="embed.url"
                target="browser"
                rel="noopener noreferrer"
              >{{ embed.title }}</a>
              <template v-else>{{ embed.title }}</template>
            </div>
            <div v-if="embed.description" class="ml-content" v-html="render(embed.description)" />
            <div v-if="embed.fields.length > 0" class="ml-embed-fields">
              <div v-for="(field, i) in embed.fields" :key="i" class="ml-embed-field">
                <div class="ml-embed-field-name">{{ field.name }}</div>
                <div class="ml-content" v-html="render(field.value)" />
              </div>
            </div>
            <img
              v-if="embed.image"
              :src="embed.image"
              class="ml-image ml-image-wide"
              loading="lazy"
              draggable="false"
              :alt="t('MineLatinoHome.attachment')"
              @click="lightbox = embed.image ?? ''"
            />
          </div>

          <div class="mt-1">
            <v-btn
              size="x-small"
              variant="text"
              class="ml-link-btn px-1"
              @click="openInBrowser(item.url)"
            >
              <v-icon start size="x-small" aria-hidden="true"> north_east </v-icon>
              {{ t('MineLatinoHome.openInDiscord') }}
            </v-btn>
          </div>
        </div>
      </article>
    </v-card-text>

    <v-dialog v-model="isLightboxOpen" width="auto" content-class="ml-lightbox">
      <v-card color="transparent" elevation="0">
        <img v-if="lightbox" :src="lightbox" class="ml-lightbox-img" :alt="t('MineLatinoHome.attachment')" />
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="isLightboxOpen = false">
            {{ t('MineLatinoHome.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
<script lang="ts" setup>
import { kMineLatino, useRelativeTime } from '@/composables/minelatino'
import { injection } from '@/util/inject'
import { renderDiscordMarkdown } from '@/util/minelatinoMarkdown'
import type { MineLatinoNewsEmbed } from '@xmcl/runtime-api'

const { t, locale } = useI18n()
const { news, newsInviteUrl, isValidating, refreshNews, openInBrowser } = injection(kMineLatino)
const { from: relativeTime, absolute: absoluteTime } = useRelativeTime()

const lightbox = ref('')
const isLightboxOpen = computed({
  get: () => !!lightbox.value,
  set: (open: boolean) => {
    if (!open) lightbox.value = ''
  },
})

/**
 * Discord stores embed colours as a 24-bit integer; `0` is a legitimate
 * (black) colour, so only `undefined` means "no colour".
 */
function embedColor(color?: number) {
  return color === undefined ? '#5865F2' : `#${color.toString(16).padStart(6, '0')}`
}

const render = (source: string) =>
  renderDiscordMarkdown(source, {
    locale: locale.value,
    userMention: t('MineLatinoHome.mentionUser'),
    roleMention: t('MineLatinoHome.mentionRole'),
    channelMention: t('MineLatinoHome.mentionChannel'),
  })
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

.ml-message {
  display: flex;
  gap: 12px;
  padding: 10px 4px;
  border-radius: 8px;
}

.ml-message + .ml-message {
  border-top: 1px solid var(--ml-border-soft);
}

.ml-message:hover {
  background-color: var(--ml-raise);
}

.ml-avatar {
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-author {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--ml-text);
}

.ml-time {
  font-size: 0.75rem;
  color: var(--ml-faint);
}

.ml-content {
  font-size: 0.9rem;
  line-height: 1.45;
  white-space: normal;
  overflow-wrap: anywhere;
  color: var(--ml-dim);
}

.ml-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.ml-image {
  max-width: 180px;
  max-height: 140px;
  border-radius: 6px;
  cursor: zoom-in;
  object-fit: cover;
}

.ml-image-wide {
  max-width: 100%;
  cursor: zoom-in;
}

.ml-embed {
  margin-top: 6px;
  padding: 8px 10px;
  border-left: 3px solid #5865f2;
  border-radius: 4px;
  background-color: var(--ml-well);
}

.ml-embed-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 2px;
}

.ml-embed-title a {
  color: var(--ml-accent-text);
}

.ml-embed-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}

.ml-embed-field {
  flex: 1 1 40%;
  min-width: 140px;
}

.ml-embed-field-name {
  font-weight: 600;
  font-size: 0.85rem;
}

.ml-link-btn {
  min-width: 0;
  opacity: 0.7;
}

.ml-link-btn:hover {
  opacity: 1;
}

.ml-lightbox-img {
  max-width: 80vw;
  max-height: 80vh;
  display: block;
  border-radius: 6px;
}

/* The rendered HTML comes from v-html, so scoped rules need :deep(). */
.ml-content :deep(a) {
  color: var(--ml-accent-text);
  text-decoration: none;
}

.ml-content :deep(a:hover) {
  text-decoration: underline;
}

.ml-content :deep(strong) {
  font-weight: 700;
}

.ml-content :deep(.ml-md-heading) {
  display: block;
  font-size: 1.05rem;
  margin: 4px 0;
}

.ml-content :deep(.ml-md-quote) {
  margin: 4px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--ml-border);
  color: var(--ml-dim);
}

.ml-content :deep(.ml-md-list) {
  margin: 4px 0;
  padding-left: 20px;
}

.ml-content :deep(.ml-md-pre) {
  margin: 4px 0;
  padding: 8px 10px;
  border-radius: 4px;
  background-color: var(--ml-well);
  overflow-x: auto;
  font-family: 'Roboto Mono', monospace;
  font-size: 0.82rem;
}

.ml-content :deep(.ml-md-code) {
  padding: 1px 4px;
  border-radius: 3px;
  background-color: var(--ml-well);
  font-family: 'Roboto Mono', monospace;
  font-size: 0.82rem;
}

.ml-content :deep(.ml-md-emoji) {
  width: 22px;
  height: 22px;
  vertical-align: -5px;
  object-fit: contain;
}

.ml-content :deep(.ml-md-mention) {
  padding: 0 3px;
  border-radius: 3px;
  background-color: rgba(232, 163, 46, 0.15);
  color: var(--ml-accent-text);
  font-weight: 500;
}

.ml-content :deep(.ml-md-spoiler) {
  padding: 0 3px;
  border-radius: 3px;
  background-color: var(--ml-border);
  color: transparent;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.ml-content :deep(.ml-md-spoiler:hover) {
  background-color: var(--ml-border-soft);
  color: inherit;
}

.ml-content :deep(.ml-md-timestamp) {
  padding: 0 2px;
  border-radius: 3px;
  background-color: var(--ml-well);
  font-size: 0.85em;
}
</style>
