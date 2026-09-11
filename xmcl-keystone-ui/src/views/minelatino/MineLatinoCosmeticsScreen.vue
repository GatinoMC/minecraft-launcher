<template>
  <section class="cosmetics-page visible-scroll">
    <header class="catalog-heading">
      <div><span class="eyebrow">MINELATINO · EXPRESA TU ESTILO</span><h1>Cosméticos</h1><p>Descubre tu próximo look. Pruébalo sobre tu skin antes de comprar.</p></div>
      <div class="header-actions"><MineLatinoCosmeticsAccount :suggested-nick="playerName" @changed="onAccountChanged" /><v-btn variant="tonal" prepend-icon="receipt_long" @click="openOrders">Mis órdenes</v-btn><v-btn variant="tonal" :loading="loading" @click="refresh">Actualizar</v-btn></div>
    </header>
    <div class="catalog-toolbar">
      <v-text-field v-model="search" label="Buscar cosmético" prepend-inner-icon="search" hide-details clearable density="compact" />
      <v-select v-model="slot" :items="categories" label="Categoría" hide-details density="compact" />
    </div>
    <v-alert v-if="error" type="warning" variant="tonal" class="my-4">{{ error }} <v-btn variant="text" @click="refresh">Reintentar</v-btn></v-alert>
    <p v-if="loading" role="status">Cargando cosméticos publicados…</p>
    <p v-else-if="!filtered.length && !error" class="empty-state">{{ products.length ? 'No hay cosméticos para esta búsqueda.' : 'Todavía no hay cosméticos publicados. Vuelve pronto.' }}</p>
    <div class="catalog-layout">
      <div class="product-grid">
        <button v-for="product in filtered" :key="product.id" type="button" class="product-card" @click="open(product)">
          <div class="product-art" :data-thumb-id="product.id"><CosmeticThumbnail :product="product" :alt="`Vista 3D de ${product.name}`" /><span>PROBAR EN 3D ↗</span></div>
          <div class="product-copy"><small>{{ cosmeticSlots[product.slot] }}</small><h2>{{ product.name }}</h2><strong>{{ priceLabel(product) }}</strong></div>
        </button>
      </div>
      <aside v-if="featured" class="fitting-room">
        <div class="fitting-room-heading">
          <span class="eyebrow">TU PROBADOR</span>
          <span class="fitting-room-count">{{ featuredIndex + 1 }} / {{ filtered.length }}</span>
        </div>
        <CosmeticPreview v-if="!dialog" :key="featured.id" :product="featured" :skin="skin" />
        <div class="fitting-room-navigation" aria-label="Cambiar cosmético del probador">
          <v-btn data-testid="cosmetics-preview-previous" icon="chevron_left" variant="tonal" size="small" :disabled="filtered.length < 2" aria-label="Cosmético anterior" @click="stepFeatured(-1)" />
          <span>{{ featured.name }}</span>
          <v-btn data-testid="cosmetics-preview-next" icon="chevron_right" variant="tonal" size="small" :disabled="filtered.length < 2" aria-label="Cosmético siguiente" @click="stepFeatured(1)" />
        </div>
        <p>{{ playerName }} · {{ cosmeticSlots[featured.slot] }}</p>
        <v-btn block color="primary" @click="open(featured)">Ver producto</v-btn>
      </aside>
    </div>
    <v-dialog v-model="dialog" max-width="900" scrollable>
      <v-card v-if="selected" class="product-dialog">
        <v-card-title class="dialog-heading"><span>{{ selected.name }}</span><v-btn icon="close" variant="text" aria-label="Cerrar vista previa" @click="dialog = false" /></v-card-title>
        <v-card-text>
          <div class="detail-grid">
            <div><CosmeticPreview v-if="dialog" :key="selected.id" :product="selected" :skin="skin" /><p class="preview-hint">Arrastra para girar · Rueda para acercar<br>Vista orientativa; requiere el mod para verse en el juego.</p></div>
            <div class="product-details">
              <span class="eyebrow">{{ cosmeticSlots[selected.slot] }} · COSMÉTICO DIGITAL</span>
              <h2>{{ selected.name }}</h2>
              <p class="description">{{ selected.description || 'Este cosmético todavía no tiene una descripción.' }}</p>
              <div class="price">{{ priceLabel(selected) }}</div>
              <div class="recipient"><small>Cuenta de entrega</small><strong>{{ account?.nick || 'Inicia sesión en Cuenta MineLatino' }}</strong><span>{{ account?.accountId || 'Las compras requieren una cuenta MineLatino' }}</span></div>
              <p class="preview-hint">La compra se vinculará a tu ID interno MineLatino. Funciona con cuentas premium y no premium, aunque otra persona utilice el mismo nick.</p>
              <v-btn block color="primary" :disabled="selected.amountMinor === null || !account" @click="openCheckout">Comprar · {{ selected.amountMinor === null ? 'Sin precio' : priceLabel(selected) }}</v-btn>
              <span class="payment-note">La entrega se realiza únicamente después de confirmar el pago.</span>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
    <v-dialog v-model="checkout" max-width="470">
      <v-card title="Finalizar compra" class="product-dialog">
        <v-card-text><v-alert v-if="checkoutError" type="error" variant="tonal" class="mb-4">{{ checkoutError }}</v-alert>
          <template v-if="createdOrder">
            <v-alert :type="createdOrder.status === 'paid' ? 'success' : 'info'" variant="tonal" class="mb-4">{{ createdOrder.status === 'paid' ? 'Cosmético entregado.' : 'Orden creada y pendiente de confirmación.' }}</v-alert>
            <div class="order-summary"><small>NÚMERO DE ORDEN</small><code>{{ createdOrder.id }}</code><strong>{{ createdOrder.cosmeticName || selected?.name }} · {{ formatOrderPrice(createdOrder) }}</strong></div>
            <p class="my-4">Envía el número de orden y tu referencia de pago al equipo de MineLatino. Cuando un administrador valide el pago, el cosmético aparecerá automáticamente en el mod.</p>
          </template>
          <template v-else>
            <p>{{ selected?.name }} · entrega a {{ account?.nick }}</p><p class="my-4">Selecciona el medio de pago. Por ahora puedes crear una orden manual para probar el sistema completo.</p>
            <v-btn v-for="provider in providers" :key="provider.id" :disabled="!provider.enabled" :loading="creatingOrder && selectedProvider === provider.id" block class="mb-2" @click="createOrder(provider.id)">{{ provider.name }}{{ provider.enabled ? '' : ' · Próximamente' }}</v-btn>
            <p class="preview-hint">Ningún cosmético se entrega con una orden pendiente. La entrega ocurre al confirmar el pago en la administración.</p>
          </template>
        </v-card-text>
        <v-card-actions><v-btn @click="checkout = false">Cerrar</v-btn><v-spacer /><v-btn v-if="createdOrder" variant="tonal" @click="openOrders">Ver mis órdenes</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="ordersDialog" max-width="700" scrollable>
      <v-card title="Mis órdenes" class="product-dialog">
        <v-card-text><v-alert v-if="ordersError" type="warning" variant="tonal" class="mb-3">{{ ordersError }}</v-alert>
          <p v-if="ordersLoading">Actualizando historial…</p><p v-else-if="!orders.length" class="empty-state">Todavía no tienes órdenes.</p>
          <div v-for="order in orders" :key="order.id" class="order-row"><div><strong>{{ order.cosmeticName || order.cosmeticId }}</strong><span>{{ new Date(order.createdAt).toLocaleString() }} · {{ formatOrderPrice(order) }}</span><code>{{ order.id }}</code></div><div class="order-state"><v-chip :color="order.status === 'paid' ? 'success' : order.status === 'cancelled' ? 'default' : 'warning'" size="small" variant="tonal">{{ orderStatus(order.status) }}</v-chip><v-btn v-if="order.status === 'pending'" size="small" variant="text" color="error" @click="cancelOrder(order.id)">Cancelar</v-btn></div></div>
        </v-card-text><v-card-actions><v-btn @click="ordersDialog = false">Cerrar</v-btn><v-spacer /><v-btn variant="tonal" :loading="ordersLoading" @click="loadOrders">Actualizar</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import steveSkin from '@/assets/steve_skin.png'
import { kUserContext } from '@/composables/user'
import { useService } from '@/composables/service'
import { injection } from '@/util/inject'
import { MineLatinoServiceKey, type MineLatinoCosmeticOrder, type MineLatinoCosmeticsAccount as CosmeticsAccount, type MineLatinoPaymentProvider } from '@xmcl/runtime-api'
import { CosmeticProduct, cosmeticSlots, priceLabel, useCosmeticsStore } from '@/composables/cosmeticsStore'
import { retainCarouselItemIndex, wrapCarouselIndex } from '@/util/cosmeticsCarousel'
import CosmeticPreview from './CosmeticPreview.vue'
import CosmeticThumbnail from './CosmeticThumbnail.vue'
import MineLatinoCosmeticsAccount from './MineLatinoCosmeticsAccount.vue'

const { gameProfile } = injection(kUserContext)
const service = useService(MineLatinoServiceKey)
const skin = computed(() => gameProfile.value?.textures?.SKIN?.url || steveSkin)
const playerName = computed(() => gameProfile.value?.name || 'Skin de ejemplo · Steve')
const { products, loading, error, refresh } = useCosmeticsStore()
const search = ref(''), slot = ref('ALL'), selected = ref<CosmeticProduct>(), dialog = ref(false), checkout = ref(false)
const account = ref<CosmeticsAccount>(), providers = ref<MineLatinoPaymentProvider[]>([]), orders = ref<MineLatinoCosmeticOrder[]>([])
const createdOrder = ref<MineLatinoCosmeticOrder>(), checkoutError = ref(''), creatingOrder = ref(false), selectedProvider = ref('')
const ordersDialog = ref(false), ordersLoading = ref(false), ordersError = ref('')
const categories = [{ title: 'Todos', value: 'ALL' }, ...Object.entries(cosmeticSlots).map(([value, title]) => ({ title, value }))]
const filtered = computed(() => products.value.filter(p => (slot.value === 'ALL' || slot.value === p.slot) && `${p.name} ${p.description}`.toLocaleLowerCase().includes((search.value || '').toLocaleLowerCase())))
const featuredIndex = ref(0)
const featured = computed(() => filtered.value[featuredIndex.value])
function stepFeatured(delta: number) { featuredIndex.value = wrapCarouselIndex(featuredIndex.value, delta, filtered.value.length) }
function open(product: CosmeticProduct) {
  const productIndex = filtered.value.findIndex(item => item.id === product.id)
  if (productIndex >= 0) featuredIndex.value = productIndex
  selected.value = product; dialog.value = true; checkout.value = false
}
function onAccountChanged(value: CosmeticsAccount | undefined) { account.value = value; orders.value = []; createdOrder.value = undefined }
async function openCheckout() {
  if (!account.value) return
  checkout.value = true; createdOrder.value = undefined; checkoutError.value = ''
  try { providers.value = await service.getCosmeticsPaymentProviders() }
  catch (e) { checkoutError.value = e instanceof Error ? e.message : 'No se pudieron cargar los medios de pago' }
}
async function createOrder(provider: MineLatinoPaymentProvider['id']) {
  if (!selected.value || creatingOrder.value) return
  creatingOrder.value = true; selectedProvider.value = provider; checkoutError.value = ''
  try {
    const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '') || `${Date.now()}${Math.random().toString(36).slice(2)}`
    createdOrder.value = await service.createCosmeticsOrder({ cosmeticId: selected.value.id, provider, idempotencyKey: `launcher-${random}`.slice(0, 80) })
    await loadOrders()
  } catch (e) { checkoutError.value = e instanceof Error ? e.message : 'No se pudo crear la orden' }
  finally { creatingOrder.value = false; selectedProvider.value = '' }
}
async function loadOrders() {
  ordersLoading.value = true; ordersError.value = ''
  try { orders.value = account.value ? await service.getCosmeticsOrders() : [] }
  catch (e) { ordersError.value = e instanceof Error ? e.message : 'No se pudo cargar el historial' }
  finally { ordersLoading.value = false }
}
async function openOrders() { ordersDialog.value = true; checkout.value = false; await loadOrders() }
async function cancelOrder(id: string) {
  try { await service.cancelCosmeticsOrder(id); await loadOrders() }
  catch (e) { ordersError.value = e instanceof Error ? e.message : 'No se pudo cancelar la orden' }
}
function orderStatus(status: MineLatinoCosmeticOrder['status']) { return status === 'paid' ? 'Entregada' : status === 'cancelled' ? 'Cancelada' : 'Pendiente' }
function formatOrderPrice(order: MineLatinoCosmeticOrder) { return new Intl.NumberFormat('es', { style: 'currency', currency: order.currency }).format(order.amountMinor / 100) }
watch(() => gameProfile.value?.id, () => { checkout.value = false })
watch(dialog, value => { if (!value) checkout.value = false })
watch(filtered, (items, previousItems) => {
  const currentId = previousItems?.[featuredIndex.value]?.id
  featuredIndex.value = retainCarouselItemIndex(items, currentId)
})
onMounted(async () => { await Promise.all([refresh(), service.getCosmeticsAccount().then(value => { account.value = value })]) })
</script>
<style scoped>
.cosmetics-page { height: 100%; overflow-y: auto; padding: 28px; color: var(--ml-text); }
.catalog-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.eyebrow { color: var(--ml-accent-text, #edba62); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
h1 { font-size: 32px; letter-spacing: -.04em; margin: 6px 0; } h2 { font-size: 18px; margin: 6px 0 10px; }
p { color: var(--ml-dim, #b4b8c3); font-size: 13px; line-height: 1.6; }
.catalog-toolbar { display: grid; grid-template-columns: minmax(160px, 1fr) 190px; gap: 12px; margin-bottom: 24px; }
.catalog-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
.product-card { text-align: left; overflow: hidden; border: 1px solid var(--ml-border, #ffffff18); border-radius: 18px; background: var(--ml-panel, #171a21); transition: transform 280ms, border-color 280ms; }
.product-card:hover { transform: translateY(-3px); border-color: var(--ml-accent); }
.product-card:focus-visible { outline: 2px solid var(--ml-accent); outline-offset: 3px; }
.product-art { height: 145px; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse, #c9963a15, transparent); position: relative; }
.product-art img { max-width: 85px; max-height: 90px; image-rendering: pixelated; object-fit: contain; }
.product-art span { position: absolute; bottom: 7px; font-size: 9px; letter-spacing: .12em; color: var(--ml-dim); }
.product-copy { padding: 16px; } .product-copy small { color: var(--ml-dim); } .product-copy strong { color: var(--ml-accent-text); font-size: 14px; }
.fitting-room { border: 1px solid var(--ml-border); padding: 16px; border-radius: 20px; background: var(--ml-panel); }
.fitting-room-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.fitting-room-count { color: var(--ml-dim); font-size: 11px; font-variant-numeric: tabular-nums; }
.fitting-room-navigation { display: grid; grid-template-columns: 36px minmax(0, 1fr) 36px; align-items: center; gap: 8px; margin: 12px 0 8px; }
.fitting-room-navigation span { overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 700; }
.fitting-room p { margin-bottom: 16px; }
.product-dialog { background: #171a21 !important; border: 1px solid #ffffff20; border-radius: 22px !important; }
.dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; white-space: normal; }
.detail-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 24px; }
.product-details { display: flex; flex-direction: column; gap: 12px; }
.description { white-space: pre-wrap; overflow-wrap: anywhere; }
.price { font-size: 28px; font-weight: 700; color: #edba62; }
.recipient { display: flex; flex-direction: column; padding: 12px; background: #ffffff06; border: 1px solid #ffffff14; border-radius: 12px; gap: 4px; }
.recipient span { font-size: 10px; overflow-wrap: anywhere; color: #9ca3b4; }
.preview-hint, .payment-note { font-size: 11px; color: #a5acbb; margin-top: 8px; }
.empty-state { padding: 36px; text-align: center; border: 1px dashed var(--ml-border); border-radius: 16px; }
.order-summary { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid #ffffff18; border-radius: 14px; background: #ffffff06; }.order-summary small,.order-row span { color: #9ca3b4; font-size: 11px; }.order-summary code,.order-row code { overflow-wrap: anywhere; font-size: 11px; color: #edba62; }
.order-row { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #ffffff12; }.order-row>div:first-child { min-width: 0; display: flex; flex-direction: column; gap: 4px; }.order-state { display: flex; flex-direction: column; align-items: end; gap: 4px; flex-shrink: 0; }
@media (max-width: 1050px) { .catalog-layout { grid-template-columns: 1fr; } .fitting-room { display: none; } }
@media (max-width: 850px) { .cosmetics-page { padding: 16px; } .detail-grid { grid-template-columns: 1fr; } .catalog-heading { align-items: start; } }
@media (prefers-reduced-motion: reduce) { .product-card { transition: none; } }
</style>
