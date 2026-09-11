<!--
  MineLatino home: a carousel that rotates through the three things the
  community publishes — the latest 3 announcements, the latest 6 server
  updates and 6 random products from the shop — changing page every few
  seconds (paused while the pointer is over it), with dots and arrows for
  manual navigation.

  Injects `kMineLatino` from `MineLatinoShell.vue` (never re-subscribes), and
  renders nothing when the backend sent no MineLatino config, so an unbranded
  build that somehow lands here stays blank instead of showing empty chrome.
-->
<template>
  <section
    v-if="isConfigured"
    data-testid="minelatino-start"
    class="ml-home flex h-full min-h-0 flex-col p-4"
  >
    <div
      class="ml-carousel relative flex min-h-0 flex-1 flex-col"
      @mouseenter="paused = true"
      @mouseleave="paused = false"
    >
      <transition name="ml-slide" mode="out-in">
        <div :key="page" class="flex min-h-0 flex-1 flex-col gap-3">
          <!-- Page header: what this slide is about plus where to see all. -->
          <div class="flex flex-grow-0 flex-shrink-0 items-center gap-2">
            <v-icon :color="accentColor || 'primary'" aria-hidden="true">
              {{ current.icon }}
            </v-icon>
            <span class="ml-carousel-title">{{ current.title }}</span>
            <div class="flex-grow" />
            <v-btn size="small" variant="text" :color="accentColor || 'primary'" @click="router.push(current.to)">
              {{ t('MineLatinoHome.viewAll') }}
              <v-icon end size="small" aria-hidden="true"> arrow_forward </v-icon>
            </v-btn>
          </div>

          <!-- Cards per page (3 news, 6 updates, 6 products), whatever the feed holds. -->
          <div class="ml-carousel-grid min-h-0 flex-1">
            <template v-if="page === 0">
              <template v-if="latestNews.length > 0">
                <article
                  v-for="item in latestNews"
                  :key="item.id"
                  class="ml-card"
                  role="button"
                  tabindex="0"
                  @click="openInBrowser(item.url)"
                  @keydown.enter="openInBrowser(item.url)"
                >
                  <img
                    v-if="item.images[0] || item.embeds[0]?.image"
                    class="ml-card-media"
                    :src="item.images[0] || item.embeds[0]?.image"
                    loading="lazy"
                    draggable="false"
                    :alt="item.author"
                  >
                  <div class="ml-card-body">
                    <div class="flex items-center gap-2">
                      <v-avatar size="26" color="#5865F2">
                        <img v-if="item.authorAvatar" :src="item.authorAvatar" :alt="item.author" draggable="false">
                        <span v-else>{{ item.author.charAt(0).toUpperCase() }}</span>
                      </v-avatar>
                      <span class="ml-card-title">{{ item.author }}</span>
                      <span class="ml-card-time" :title="absoluteTime(item.timestamp)">{{ relativeTime(item.timestamp) }}</span>
                    </div>
                    <div class="ml-card-text ml-clamp">
                      {{ plain(item.content) || item.embeds[0]?.title || '' }}
                    </div>
                  </div>
                </article>
              </template>
              <div v-else class="ml-carousel-empty">
                <v-icon size="36" color="grey"> forum </v-icon>
                <div class="mt-2 text-body-2 text-grey">
                  {{ news.error ? t('MineLatinoHome.newsError') : t('MineLatinoHome.newsEmpty') }}
                </div>
              </div>
            </template>

            <template v-else-if="page === 1">
              <template v-if="latestUpdates.length > 0">
                <article
                  v-for="item in latestUpdates"
                  :key="item.id"
                  class="ml-card"
                  role="button"
                  tabindex="0"
                  @click="openUpdate(item)"
                  @keydown.enter="openUpdate(item)"
                >
                  <img
                    v-if="item.image"
                    class="ml-card-media"
                    :src="item.image"
                    loading="lazy"
                    draggable="false"
                    :alt="item.title"
                  >
                  <div class="ml-card-body">
                    <div class="ml-card-title ml-clamp-1">
                      {{ item.title }}
                    </div>
                    <div class="ml-card-time">{{ relativeTime(item.date) }}</div>
                    <div class="ml-card-text ml-clamp">
                      {{ item.excerpt }}
                    </div>
                  </div>
                </article>
              </template>
              <div v-else class="ml-carousel-empty">
                <v-icon size="36" color="grey"> new_releases </v-icon>
                <div class="mt-2 text-body-2 text-grey">
                  {{ updates.error ? t('MineLatinoHome.updatesError') : t('MineLatinoHome.updatesEmpty') }}
                </div>
              </div>
            </template>

            <template v-else>
              <template v-if="featuredProducts.length > 0">
                <article
                  v-for="product in featuredProducts"
                  :key="product.id"
                  class="ml-card"
                  role="button"
                  tabindex="0"
                  @click="openProduct(product)"
                  @keydown.enter="openProduct(product)"
                >
                  <img
                    v-if="product.image"
                    class="ml-card-media"
                    :src="product.image"
                    loading="lazy"
                    draggable="false"
                    :alt="product.name"
                  >
                  <div class="ml-card-body">
                    <div class="ml-card-title ml-clamp-1">
                      {{ product.name }}
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="ml-card-price">{{ product.priceText }}</span>
                      <span v-if="product.onSale && product.regularPriceText" class="ml-card-price-old">
                        {{ product.regularPriceText }}
                      </span>
                      <v-chip v-if="product.onSale" size="x-small" color="error" variant="tonal">
                        {{ t('MineLatinoStore.sale') }}
                      </v-chip>
                    </div>
                    <div class="ml-card-text ml-clamp">
                      {{ product.shortDescription }}
                    </div>
                  </div>
                </article>
              </template>
              <div v-else class="ml-carousel-empty">
                <v-icon size="36" color="grey"> storefront </v-icon>
                <div class="mt-2 text-body-2 text-grey">
                  {{ t('MineLatinoHome.featuredEmpty') }}
                </div>
              </div>
            </template>
          </div>
        </div>
      </transition>

      <!-- Manual navigation: arrows on the edges, dots under the grid. -->
      <button
        type="button"
        class="ml-arrow ml-arrow--left"
        :aria-label="t('MineLatinoHome.prev')"
        @click="goPage(page - 1)"
      >
        <v-icon aria-hidden="true"> chevron_left </v-icon>
      </button>
      <button
        type="button"
        class="ml-arrow ml-arrow--right"
        :aria-label="t('MineLatinoHome.next')"
        @click="goPage(page + 1)"
      >
        <v-icon aria-hidden="true"> chevron_right </v-icon>
      </button>

      <div class="ml-dots flex flex-grow-0 flex-shrink-0 items-center justify-center gap-2 pt-3">
        <button
          v-for="(meta, index) in pages"
          :key="meta.key"
          type="button"
          class="ml-dot"
          :class="{ 'ml-dot--on': index === page }"
          :aria-label="meta.title"
          :aria-current="index === page"
          @click="goPage(index)"
        />
      </div>
    </div>
  </section>
</template>
<script lang="ts" setup>
import { kMineLatino, useRelativeTime } from '@/composables/minelatino'
import { injection } from '@/util/inject'

const { t } = useI18n()
const router = useRouter()
const {
  news,
  updates,
  featuredProducts,
  accentColor,
  isConfigured,
  openInBrowser,
  openUpdate,
  openProduct,
} = injection(kMineLatino)
const { from: relativeTime, absolute: absoluteTime } = useRelativeTime()

const latestNews = computed(() => news.value.items.slice(0, 3))
const latestUpdates = computed(() => updates.value.items.slice(0, 6))

const pages = computed(() => [
  { key: 'news', icon: 'campaign', title: t('MineLatinoHome.news'), to: '/minelatino/anuncios' },
  { key: 'updates', icon: 'new_releases', title: t('MineLatinoHome.updates'), to: '/minelatino/actualizaciones' },
  { key: 'store', icon: 'storefront', title: t('MineLatinoHome.store'), to: '/minelatino/tienda' },
])
const current = computed(() => pages.value[page.value])

/**
 * The carousel turns pages on its own every few seconds; hovering the slide
 * freezes it so nobody loses the card they were reading mid-sentence.
 */
const PAGE_COUNT = 3
const ROTATE_MS = 3500
const page = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function arm() {
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (!paused.value) page.value = (page.value + 1) % PAGE_COUNT
  }, ROTATE_MS)
}

function goPage(index: number) {
  page.value = (index + PAGE_COUNT) % PAGE_COUNT
  // Restart the countdown so a manual pick gets its full reading time.
  arm()
}

onMounted(arm)
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

/**
 * Discord markup stripped down to readable text for the card preview. The
 * full message (embeds, images, mentions) lives in the Anuncios screen; here
 * a clean plain-text teaser is what fits.
 */
function plain(source: string) {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[@#!][^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
</script>

<style scoped>
.ml-home {
  width: 100%;
}

.ml-carousel-title {
  font-family: var(--ml-font-head);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ml-text);
}

.ml-carousel-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.ml-carousel-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  border-radius: var(--ml-radius);
  border: 1px dashed var(--ml-border);
  text-align: center;
}

.ml-card {
  display: flex;
  flex-direction: column;
  min-height: 240px;
  border-radius: var(--ml-radius);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--ml-border);
  background-color: var(--ml-panel);
  transition: transform 0.2s ease, border-color 0.18s ease, box-shadow 0.2s ease;
}

.ml-card:hover {
  transform: translateY(-6px);
  border-color: var(--ml-accent-border);
  box-shadow: 0 12px 28px -8px rgba(187, 128, 29, 0.2);
}

.ml-card:active {
  transform: translateY(-2px);
  filter: brightness(0.97);
}

.ml-card:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 2px;
}

.ml-card-media {
  width: 100%;
  height: 120px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: var(--ml-well);
}

.ml-card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.ml-card-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ml-text);
}

.ml-card-time {
  font-size: 0.74rem;
  color: var(--ml-faint);
  margin-left: auto;
}

.ml-card-text {
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--ml-dim);
  overflow-wrap: anywhere;
}

.ml-card-price {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--ml-accent-text);
}

.ml-card-price-old {
  font-size: 0.8rem;
  color: var(--ml-faint);
  text-decoration: line-through;
}

/* Two-line / one-line clamps for the teaser text. */
.ml-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ml-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ml-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--ml-border);
  background-color: var(--ml-panel);
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease, transform 0.16s ease;
  z-index: 3;
}

.ml-carousel:hover .ml-arrow,
.ml-arrow:focus-visible {
  opacity: 1;
}

.ml-arrow:hover {
  background-color: var(--ml-raise);
  border-color: var(--ml-accent-border);
  transform: translateY(-50%) scale(1.06);
}

.ml-arrow:active {
  transform: translateY(-50%) scale(0.94);
}

.ml-arrow--left {
  left: -6px;
}

.ml-arrow--right {
  right: -6px;
}

.ml-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background-color: var(--ml-border);
  cursor: pointer;
  transition: width 0.25s ease, background-color 0.25s ease;
}

.ml-dot--on {
  width: 22px;
  background-color: var(--ml-accent);
}

.ml-dot:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 2px;
}

/* Slide change: the outgoing page drifts left while the new one arrives. */
.ml-slide-enter-active,
.ml-slide-leave-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}

.ml-slide-enter-from {
  opacity: 0;
  transform: translateX(28px);
}

.ml-slide-leave-to {
  opacity: 0;
  transform: translateX(-28px);
}

/* Narrow windows stack the three cards. */
@media (max-width: 900px) {
  .ml-carousel-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ml-card {
    min-height: 120px;
  }
}
</style>
