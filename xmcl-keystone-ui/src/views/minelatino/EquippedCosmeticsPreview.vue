<template>
  <div
    ref="container"
    class="equipped-cosmetics-preview"
    :data-equipped-count="products.length"
    :data-preview-zoom="previewZoom"
  >
    <canvas
      ref="canvas"
      aria-label="Vista 3D del jugador con sus cosméticos activos. Arrastra para girar y usa la rueda para acercar."
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { IdleAnimation, SkinViewer } from 'skinview3d'
import { Group, Mesh } from 'three'
import type { CosmeticProduct } from '@/composables/cosmeticsStore'
import { resourceUrl } from '@/composables/cosmeticsStore'
import type { JavaCosmeticModel } from '@/util/cosmeticGeometry'
import { createCosmeticMesh, disposeCosmeticMesh } from '@/util/cosmeticMaterials'
import { petPreviewPosition } from '@/util/cosmeticPlacement'

const props = defineProps<{ products: CosmeticProduct[]; skin: string }>()
const canvas = ref<HTMLCanvasElement>()
const container = ref<HTMLDivElement>()
const previewZoom = computed(() => {
  if (props.products.length === 0) return 0.9
  return props.products.some(product => product.slot === 'PET' || product.slot === 'WINGS') ? 0.68 : 0.75
})
let viewer: SkinViewer | undefined
let observer: ResizeObserver | undefined
let request: AbortController | undefined
let attachments: Array<{ group: Group; mesh: Mesh }> = []

function clearCosmetics() {
  for (const { group, mesh } of attachments) {
    group.removeFromParent()
    disposeCosmeticMesh(mesh)
  }
  attachments = []
}

function aborted(signal: AbortSignal) {
  return new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
}

async function attachModel(target: SkinViewer, product: CosmeticProduct, signal: AbortSignal) {
  const response = await fetch(resourceUrl(product, true), { signal, credentials: 'omit' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await response.text()
  if (text.length > 2 * 1024 * 1024) throw new Error('model-too-large')
  const model: JavaCosmeticModel = JSON.parse(text)
  const mesh = await createCosmeticMesh(product, model, signal)
  if (signal.aborted) {
    disposeCosmeticMesh(mesh)
    return
  }

  const attachment = new Group()
  const transform = new Group()
  attachment.add(transform)
  transform.add(mesh)
  attachment.rotation.y = Math.PI
  const configured = product.transform
  if (configured) {
    const [tx, ty, tz] = configured.translation
    const [rx, ry, rz] = configured.rotation
    transform.position.set(-tx, ty, -tz)
    transform.rotation.set(-rx * Math.PI / 180, ry * Math.PI / 180, -rz * Math.PI / 180)
    transform.scale.set(...configured.scale)
  }

  const compatibleAttachment = attachment as unknown as Parameters<typeof target.playerObject.add>[0]
  if (product.slot === 'HAT') {
    attachment.position.set(0, 4, 0)
    attachment.scale.setScalar(0.625)
    const head = model.display?.head
    if (!configured) {
      mesh.position.set(...(head?.translation ?? [0, 0, 0]))
      mesh.rotation.set(...((head?.rotation ?? [0, 0, 0]).map(value => value * Math.PI / 180) as [number, number, number]))
      mesh.scale.set(...(head?.scale ?? [1, 1, 1]))
    }
    target.playerObject.skin.head.add(compatibleAttachment)
  } else if (product.slot === 'PET') {
    attachment.position.set(...petPreviewPosition())
    attachment.scale.setScalar(0.55)
    target.playerObject.add(compatibleAttachment)
  } else {
    attachment.position.set(0, 1.2, product.slot === 'BACKPACK' ? -4.8 : -2.56)
    if (!configured && product.slot === 'BACKPACK' && model.display?.minelatino_backpack) {
      const backpack = model.display.minelatino_backpack
      mesh.position.set(...(backpack.translation ?? [0, 0, 0]))
      mesh.rotation.set(...((backpack.rotation ?? [0, 0, 0]).map(value => value * Math.PI / 180) as [number, number, number]))
      mesh.scale.set(...(backpack.scale ?? [1, 1, 1]))
    }
    target.playerObject.skin.body.add(compatibleAttachment)
  }
  attachments.push({ group: attachment, mesh })
}

async function load() {
  request?.abort()
  const active = request = new AbortController()
  const timeout = setTimeout(() => active.abort(), 20000)
  clearCosmetics()
  const target = viewer
  if (!target) {
    clearTimeout(timeout)
    return
  }
  target.zoom = previewZoom.value
  target.resetCape()
  try {
    await Promise.race([target.loadSkin(props.skin, { model: 'auto-detect' }), aborted(active.signal)])
    if (active.signal.aborted || request !== active) return

    // skinview3d has one native back-equipment layer. Prefer wings when both
    // legacy texture-only back slots are active; model-based cosmetics remain additive.
    const texturedBack = props.products.find(product => product.slot === 'WINGS' && product.hasTexture && !product.hasModel)
      ?? props.products.find(product => product.slot === 'CAPE' && product.hasTexture && !product.hasModel)
    if (texturedBack) {
      await Promise.race([
        target.loadCape(resourceUrl(texturedBack), { backEquipment: texturedBack.slot === 'WINGS' ? 'elytra' : 'cape' }),
        aborted(active.signal),
      ])
    }

    for (const product of props.products) {
      if (active.signal.aborted || request !== active) return
      if (!product.hasTexture || !product.hasModel) continue
      try {
        await attachModel(target, product, active.signal)
      } catch (error) {
        if (!active.signal.aborted) console.warn(`[cosmetics] equipped preview failed for ${product.id}`, error)
      }
    }
  } catch (error) {
    if (!active.signal.aborted) console.warn('[cosmetics] player preview failed', error)
  } finally {
    clearTimeout(timeout)
  }
}

onMounted(() => {
  viewer = new SkinViewer({ canvas: canvas.value, width: 360, height: 620, zoom: previewZoom.value, fov: 45 })
  viewer.playerObject.position.y = -0.35
  viewer.animation = new IdleAnimation()
  observer = new ResizeObserver(entries => {
    const rect = entries[0].contentRect
    if (viewer && rect.width && rect.height) {
      viewer.width = rect.width
      viewer.height = rect.height
    }
  })
  observer.observe(container.value!)
  void load()
})

watch(() => [props.skin, ...props.products.map(product => `${product.id}:${product.resourceVersion}`)], load)
onBeforeUnmount(() => {
  request?.abort()
  request = undefined
  observer?.disconnect()
  clearCosmetics()
  viewer?.dispose()
  viewer = undefined
})
</script>

<style scoped>
.equipped-cosmetics-preview,
canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

canvas {
  touch-action: none;
}
</style>
