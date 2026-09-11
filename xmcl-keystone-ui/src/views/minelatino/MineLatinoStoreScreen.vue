<!--
  MineLatino "Tienda" screen: the shop catalog.

  The shop (`minelatino.shop`) is a WooCommerce store, proxied by the backend
  (`/api/store` + `/api/store/products`) into a small stable shape. This screen
  shows the top-level categories (game modes); picking one lists its products,
  and picking a product opens its shop page in its own `BrowserWindow` (the same
  pool `openStore()` uses) — never an iframe, because shops send `X-Frame-Options`
  and payments need to navigate freely. When the catalog is disabled or empty the
  screen falls back to the single "open store" hero. `kMineLatino` comes from the
  shell.
-->
<template>
  <div
    v-if="isConfigured"
    data-testid="minelatino-store-screen"
    class="ml-screen flex flex-col gap-3 p-4"
  >
    <v-card
      class="ml-panel flex flex-col h-full"
    >
      <div class="ml-hero">
        <v-icon size="40" :color="accentColor || 'primary'" aria-hidden="true">
          storefront
        </v-icon>
        <div class="ml-hero-text">
          <h2 class="ml-hero-title">
            {{ storeName }}
          </h2>
          <p class="ml-hero-subtitle">
            {{ t('MineLatinoStore.subtitle') }}
          </p>
        </div>
        <div class="flex-grow" />
        <v-btn
          v-if="hasStore"
          :color="accentColor || 'primary'"
          :variant="isStoreOpen ? 'tonal' : 'flat'"
          data-testid="minelatino-store-open"
          @click="isStoreOpen ? closeStore() : openStore()"
        >
          <v-icon start aria-hidden="true">
            {{ isStoreOpen ? 'close' : 'storefront' }}
          </v-icon>
          {{ isStoreOpen ? t('MineLatinoHome.closeStore') : t('MineLatinoHome.store') }}
        </v-btn>
      </div>

      <div
        v-if="storeTabs.length > 0 || links.length > 0"
        class="ml-links"
      >
        <v-btn
          v-for="tab in storeTabs"
          :key="`tab-${tab.url}`"
          variant="tonal"
          :color="accentColor"
          size="small"
          @click="openTab(tab)"
        >
          <v-icon v-if="tab.icon" start aria-hidden="true"> {{ tab.icon }} </v-icon>
          {{ tab.label }}
        </v-btn>
        <v-btn
          v-for="link in links"
          :key="`link-${link.url}`"
          variant="text"
          size="small"
          @click="openTab(link)"
        >
          <v-icon v-if="link.icon" start aria-hidden="true"> {{ link.icon }} </v-icon>
          {{ link.label }}
        </v-btn>
      </div>

      <v-divider />

      <v-card-item class="pb-2">
        <v-card-title class="flex items-center gap-2 text-base">
          <v-icon size="small" :color="accentColor || 'primary'"> category </v-icon>
          {{ t('MineLatinoStore.categories') }}
          <v-chip
            v-if="catalogStale"
            size="x-small"
            color="warning"
            variant="tonal"
            :title="storeCatalog.error || t('MineLatinoHome.offlineHint')"
          >
            {{ t('MineLatinoHome.offline') }}
          </v-chip>
          <div class="flex-grow" />
          <v-btn
            icon
            size="small"
            variant="text"
            :loading="storeLoading"
            :aria-label="t('MineLatinoHome.refresh')"
            @click="refreshStore()"
          >
            <v-icon aria-hidden="true"> refresh </v-icon>
          </v-btn>
        </v-card-title>
      </v-card-item>

      <v-card-text class="ml-scroll flex-grow overflow-y-auto pt-0">
        <v-skeleton-loader v-if="catalogLoading" type="chip@8" />

        <div v-else-if="catalogError" class="ml-empty">
          <v-icon size="36" color="grey"> storefront </v-icon>
          <div class="mt-2 text-body-2 text-grey">
            {{ t('MineLatinoStore.catalogError') }}
          </div>
        </div>

        <div v-else-if="catalogEmpty" class="ml-empty">
          <v-icon size="36" color="grey"> storefront </v-icon>
          <div class="mt-2 text-body-2 text-grey">
            {{ t('MineLatinoStore.catalogEmpty') }}
          </div>
          <v-btn
            v-if="hasStore"
            class="mt-3"
            :color="accentColor || 'primary'"
            variant="tonal"
            @click="openStore()"
          >
            <v-icon start aria-hidden="true"> storefront </v-icon>
            {{ t('MineLatinoHome.store') }}
          </v-btn>
        </div>

        <template v-else>
          <div class="ml-cats">
            <button
              v-for="cat in storeCategories"
              :key="cat.id"
              type="button"
              class="ml-cat"
              :class="{ 'ml-cat-active': cat.id === selectedStoreCategory }"
              :data-testid="`minelatino-store-category-${cat.id}`"
              @click="selectStoreCategory(cat.id)"
            >
              <span class="ml-cat-name">{{ cat.name }}</span>
              <span v-if="cat.count" class="ml-cat-count">{{ cat.count }}</span>
            </button>
          </div>

          <div v-if="hasSelection" class="ml-products-head">
            <span class="ml-products-title">{{ selectedCategoryName }}</span>
            <span v-if="productsTotal" class="ml-products-count">
              {{ t('MineLatinoStore.productCount', { count: productsTotal }) }}
            </span>
          </div>

          <v-skeleton-loader v-if="storeProductsLoading" type="card@3" />

          <div v-else-if="!hasSelection" class="ml-empty ml-empty-sm">
            <v-icon size="32" color="grey"> touch_app </v-icon>
            <div class="mt-2 text-body-2 text-grey">
              {{ t('MineLatinoStore.chooseCategory') }}
            </div>
          </div>

          <div v-else-if="productsError" class="ml-empty ml-empty-sm">
            <v-icon size="32" color="grey"> error_outline </v-icon>
            <div class="mt-2 text-body-2 text-grey">
              {{ t('MineLatinoStore.productsError') }}
            </div>
          </div>

          <div v-else-if="selectedStoreProducts.length === 0" class="ml-empty ml-empty-sm">
            <v-icon size="32" color="grey"> inventory_2 </v-icon>
            <div class="mt-2 text-body-2 text-grey">
              {{ t('MineLatinoStore.productsEmpty') }}
            </div>
          </div>

          <div v-else class="ml-grid">
            <div
              v-for="product in selectedStoreProducts"
              :key="product.id"
              class="ml-product"
              role="button"
              tabindex="0"
              :data-testid="`minelatino-store-product-${product.id}`"
              :aria-label="`${product.name} — ${t('MineLatinoStore.openProduct')}`"
              @click="openProduct(product)"
              @keydown.enter="openProduct(product)"
              @keydown.space.prevent="openProduct(product)"
            >
              <div class="ml-product-thumb">
                <img
                  v-if="product.image"
                  :src="product.image"
                  :alt="product.name"
                  loading="lazy"
                  draggable="false"
                  v-fallback-img="BuiltinImages.minecraft"
                >
                <v-icon v-else size="28" color="grey"> image </v-icon>
              </div>
              <div class="ml-product-body">
                <div class="ml-product-name">
                  {{ product.name }}
                </div>
                <div v-if="product.shortDescription" class="ml-product-desc">
                  {{ product.shortDescription }}
                </div>
                <div class="ml-product-foot">
                  <span v-if="product.onSale" class="ml-badge ml-badge-sale">
                    {{ t('MineLatinoStore.sale') }}
                  </span>
                  <span v-if="!product.inStock" class="ml-badge ml-badge-oos">
                    {{ t('MineLatinoStore.outOfStock') }}
                  </span>
                  <div class="flex-grow" />
                  <span v-if="product.onSale && product.regularPriceText" class="ml-price-old">
                    {{ product.regularPriceText }}
                  </span>
                  <span v-if="product.priceText" class="ml-price">
                    {{ product.priceText }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </div>
</template>
<script lang="ts" setup>
import { kMineLatino } from '@/composables/minelatino'
import { BuiltinImages } from '@/constant'
import { vFallbackImg } from '@/directives/fallbackImage'
import { injection } from '@/util/inject'

const { t } = useI18n()
const {
  branding,
  server,
  links,
  accentColor,
  hasStore,
  storeTabs,
  isStoreOpen,
  isConfigured,
  openStore,
  closeStore,
  openTab,
  storeCatalog,
  storeCategories,
  storeLoading,
  selectedStoreCategory,
  selectedStoreProducts,
  selectedStoreProductsResult,
  storeProductsLoading,
  selectStoreCategory,
  refreshStore,
  openProduct,
} = injection(kMineLatino)

const storeName = computed(
  () => server.value?.name || branding.value?.name || t('MineLatinoNav.tienda'),
)
const hasSelection = computed(() => selectedStoreCategory.value != null)
const selectedCategoryName = computed(
  () => storeCategories.value.find(c => c.id === selectedStoreCategory.value)?.name ?? '',
)
const productsTotal = computed(
  () => selectedStoreProductsResult.value?.total ?? selectedStoreProducts.value.length,
)

// `fetchedAt === 0` means no response has landed yet, so the first paint shows a
// skeleton instead of flashing the empty state before `mutate()` resolves.
const catalogLoading = computed(
  () => (storeLoading.value || storeCatalog.value.fetchedAt === 0)
    && storeCategories.value.length === 0
    && !storeCatalog.value.error,
)
const catalogStale = computed(
  () => storeCatalog.value.stale && storeCategories.value.length > 0,
)
const catalogError = computed(
  () => storeCategories.value.length === 0 && !!storeCatalog.value.error,
)
const catalogEmpty = computed(
  () => !catalogLoading.value && storeCategories.value.length === 0 && !storeCatalog.value.error,
)
const productsError = computed(
  () => selectedStoreProducts.value.length === 0 && !!selectedStoreProductsResult.value?.error,
)
</script>

<style scoped>
.ml-screen {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  height: 100%;
  box-sizing: border-box;
}

.ml-panel {
  border-radius: var(--ml-radius);
  overflow: hidden;
  background: var(--ml-panel);
  border: 1px solid var(--ml-border);
}

.ml-scroll {
  min-height: 0;
}

.ml-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 16px;
}

.ml-hero-text {
  min-width: 0;
}

.ml-hero-title {
  font-family: var(--ml-font-head);
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--ml-text);
}

.ml-hero-subtitle {
  font-size: 0.86rem;
  color: var(--ml-dim);
  max-width: 52ch;
  margin-top: 2px;
}

.ml-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 20px 14px;
}

.ml-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 6px;
}

.ml-cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--ml-border);
  background-color: transparent;
  color: var(--ml-dim);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.ml-cat:hover {
  border-color: var(--ml-accent-border);
  color: var(--ml-text);
}

.ml-cat:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 2px;
}

.ml-cat-active {
  background-color: var(--ml-cta);
  border-color: var(--ml-cta-lip);
  color: var(--ml-cta-text);
}

.ml-cat-count {
  font-size: 0.72rem;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.ml-products-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 12px 0 8px;
}

.ml-products-title {
  font-family: var(--ml-font-head);
  font-size: 1rem;
  font-weight: 600;
  color: var(--ml-text);
}

.ml-products-count {
  font-size: 0.8rem;
  color: var(--ml-faint);
}

.ml-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.ml-product {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: var(--ml-radius-sm);
  border: 1px solid var(--ml-border-soft);
  background-color: var(--ml-raise);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.ml-product:hover {
  border-color: var(--ml-accent-border);
  transform: translateY(-4px);
  box-shadow: 0 10px 24px -12px rgba(187, 128, 29, 0.18);
}

.ml-product:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-product-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--ml-well);
}

.ml-product-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ml-product-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.ml-product-name {
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.25;
  color: var(--ml-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ml-product-desc {
  font-size: 0.78rem;
  color: var(--ml-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ml-product-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--ml-border-soft);
}

.ml-badge {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 6px;
  border-radius: 5px;
}

.ml-badge-sale {
  background-color: rgba(232, 163, 46, 0.15);
  color: var(--ml-accent-text);
}

.ml-badge-oos {
  background-color: var(--ml-well);
  color: var(--ml-faint);
}

.ml-price {
  font-weight: 800;
  font-size: 1rem;
  color: var(--ml-accent-text);
}

.ml-price-old {
  font-size: 0.78rem;
  color: var(--ml-faint);
  text-decoration: line-through;
}

.ml-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.ml-empty-sm {
  padding: 22px 16px;
}
</style>
