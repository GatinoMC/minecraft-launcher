import { onScopeDispose, ref } from 'vue'

export const cosmeticSlots = { HAT: 'Cabeza', CAPE: 'Capa', WINGS: 'Alas', BACKPACK: 'Mochila', PET: 'Mascota' } as const
export interface CosmeticTransform {
  translation: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  updatedAt?: number
}
export interface CosmeticProduct {
  id: string
  name: string
  slot: keyof typeof cosmeticSlots
  description: string
  amountMinor: number | null
  currency: string
  hasTexture: boolean
  hasModel: boolean
  textureCount: number
  resourceVersion: string
  transform: CosmeticTransform | null
}

// Public data only. Never place a provider secret or Minecraft token in Vite variables.
export const cosmeticsApi = (import.meta.env.VITE_MINELATINO_COSMETICS_API || 'https://minelatino-cosmetics-production.up.railway.app').replace(/\/$/, '')
export function resourceUrl(product: CosmeticProduct, model = false) {
  return `${cosmeticsApi}/v1/resources/${encodeURIComponent(product.id)}?v=${encodeURIComponent(product.resourceVersion)}${model ? '&type=model' : ''}`
}
export function priceLabel(product: CosmeticProduct) {
  return product.amountMinor === null ? 'Precio por confirmar' : new Intl.NumberFormat('es', { style: 'currency', currency: product.currency }).format(product.amountMinor / 100)
}
export function parseProduct(value: unknown): CosmeticProduct {
  const p = value as CosmeticProduct
  const vector = (input: unknown, positive = false) => Array.isArray(input) && input.length === 3
    && input.every(value => typeof value === 'number' && Number.isFinite(value) && (!positive || value > 0))
  if (!p || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.id) || typeof p.name !== 'string'
    || !Object.hasOwn(cosmeticSlots, p.slot) || typeof p.description !== 'string'
    || !['USD', 'EUR', 'UYU', 'ARS', 'BRL', 'MXN'].includes(p.currency)
    || (p.amountMinor !== null && (!Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0))
    || typeof p.hasTexture !== 'boolean' || typeof p.hasModel !== 'boolean'
    || !Number.isSafeInteger(p.textureCount) || p.textureCount < 0 || p.textureCount > 32
    || typeof p.resourceVersion !== 'string'
    || (p.transform !== null && (!p.transform || !vector(p.transform.translation)
      || !vector(p.transform.rotation) || !vector(p.transform.scale, true)))) {
    throw new Error('El catálogo devolvió un producto inválido')
  }
  return p
}
export function useCosmeticsStore() {
  const products = ref<CosmeticProduct[]>([])
  const loading = ref(false)
  const error = ref('')
  let controller: AbortController | undefined
  async function refresh() {
    controller?.abort()
    const active = controller = new AbortController()
    const timeout = setTimeout(() => active.abort(), 20000)
    loading.value = true
    error.value = ''
    try {
      const items: CosmeticProduct[] = []
      let offset: number | null = 0
      while (offset !== null) {
        const response: Response = await fetch(`${cosmeticsApi}/v1/storefront/catalog?offset=${offset}`, { signal: active.signal, credentials: 'omit' })
        if (!response.ok) throw new Error(response.status === 404 ? 'El servicio necesita la actualización del catálogo de cosméticos.' : `No se pudo obtener el catálogo (HTTP ${response.status}).`)
        const page: { items: unknown[]; nextOffset: number | null } = await response.json()
        if (!Array.isArray(page.items) || page.items.length > 50) throw new Error('Respuesta de catálogo inválida')
        for (const raw of page.items) {
          try { items.push(parseProduct(raw)) }
          catch (error) {
            // One malformed catalog entry must not hide every valid product.
            console.warn('[cosmetics] ignored invalid catalog product', error)
          }
        }
        const next: number | null = page.nextOffset
        if (next !== null && (!Number.isSafeInteger(next) || next <= offset || items.length >= 10000)) throw new Error('Paginación de catálogo inválida')
        offset = next
      }
      if (controller === active) products.value = [...new Map(items.map(p => [p.id, p])).values()]
    } catch (e) {
      if (controller === active) error.value = active.signal.aborted ? 'La conexión tardó demasiado. Vuelve a intentarlo.' : e instanceof Error ? e.message : 'No se pudo conectar con el catálogo.'
    } finally {
      clearTimeout(timeout)
      if (controller === active) loading.value = false
    }
  }
  onScopeDispose(() => { controller?.abort(); controller = undefined })
  return { products, loading, error, refresh }
}
