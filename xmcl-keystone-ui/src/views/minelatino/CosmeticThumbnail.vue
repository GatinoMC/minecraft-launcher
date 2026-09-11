<template>
  <span ref="root" class="cosmetic-thumb-root" :title="renderError">
  <img v-if="dataUrl" :src="dataUrl" :alt="alt" class="cosmetic-thumb">
  <img v-else-if="fallbackSrc" :src="fallbackSrc" :alt="alt" class="cosmetic-thumb" loading="lazy">
  <v-icon v-else size="52" class="cosmetic-thumb-icon">checkroom</v-icon>
  </span>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { AmbientLight, Box3, DirectionalLight, Mesh, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { JavaCosmeticModel } from '@/util/cosmeticGeometry'
import { createCosmeticMesh, disposeCosmeticMesh } from '@/util/cosmeticMaterials'
import { CosmeticProduct, resourceUrl } from '@/composables/cosmeticsStore'

const props = defineProps<{ product: CosmeticProduct; alt?: string }>()
const dataUrl = ref('')
const fallbackSrc = ref('')
const renderError = ref('')
const root = ref<HTMLElement>()
let observer: IntersectionObserver | undefined, request: AbortController | undefined

function prepare() {
  observer?.disconnect(); request?.abort()
  dataUrl.value = ''; fallbackSrc.value = ''; renderError.value = ''
  if (!props.product.hasTexture) return
  if (!props.product.hasModel) { fallbackSrc.value = resourceUrl(props.product); return }
  // Lazy render: only build the 3D snapshot when the thumb scrolls into view.
  observer = new IntersectionObserver(entries => {
    if (!entries[0]?.isIntersecting) return
    observer?.disconnect()
    void renderSnapshot().catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      renderError.value = error instanceof Error ? error.message : 'No se pudo generar la miniatura 3D'
      // A single-texture product has a safe 2D fallback. Multi-texture atlases
      // stay as an icon because choosing one would display the wrong material.
      if (props.product.textureCount <= 1) fallbackSrc.value = resourceUrl(props.product)
      console.warn(`[cosmetics] thumbnail failed for ${props.product.id}: ${renderError.value}`)
    })
  }, { rootMargin: '200px' })
  // Observe the nearest ancestor or a sentinel; we use the component root element.
  if (root.value) observer.observe(root.value)
}
onMounted(prepare)
watch(() => [props.product.id, props.product.resourceVersion, props.product.hasModel, props.product.hasTexture, props.product.textureCount], prepare)
onBeforeUnmount(() => { observer?.disconnect(); request?.abort() })

async function renderSnapshot() {
  const w = 160, h = 150
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('No WebGL')
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: false })
  // Runtime Three.js supports outputColorSpace; Object.assign keeps this
  // compatible with the older @types/three declaration used by the launcher.
  Object.assign(renderer, { outputColorSpace: SRGBColorSpace })
  renderer.setSize(w, h, false)
  renderer.setPixelRatio(1)
  const active = request = new AbortController(), product = props.product
  const timeout = setTimeout(() => active.abort(), 15000)
  let mesh: Mesh | undefined
  try {
    const modelRes = await fetch(resourceUrl(product, true), { credentials: 'omit', signal: active.signal })
    if (!modelRes.ok) throw new Error('Fetch failed')
    const model: JavaCosmeticModel = JSON.parse(await modelRes.text())
    const scene = new Scene()
    const camera = new PerspectiveCamera(35, w / h, 0.1, 500)
    camera.position.set(0, 2, 28)
    camera.lookAt(0, 0, 0)
    scene.add(new AmbientLight(0xffffff, 0.7))
    const dir = new DirectionalLight(0xffffff, 0.9)
    dir.position.set(5, 10, 12)
    scene.add(dir)
    mesh = await createCosmeticMesh(product, model, active.signal)
    if (active.signal.aborted || request !== active) return
    // Rotate so the cosmetic front faces the camera (same as the preview).
    mesh.rotation.y = Math.PI
    scene.add(mesh)
    // Auto-fit: compute bounding box and adjust camera distance.
    const box = new Box3().setFromObject(mesh)
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const dist = maxDim / (2 * Math.tan((camera.fov / 2) * Math.PI / 180)) * 1.6
    camera.position.set(center.x, center.y + size.y * 0.15, center.z + dist)
    camera.lookAt(center)
    renderer.render(scene, camera)
    dataUrl.value = canvas.toDataURL('image/png')
  } finally {
    clearTimeout(timeout)
    if (mesh) disposeCosmeticMesh(mesh)
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
</script>
<style scoped>
.cosmetic-thumb-root { display: inline-flex; align-items: center; justify-content: center; }
.cosmetic-thumb { max-width: 85px; max-height: 90px; image-rendering: pixelated; object-fit: contain; }
.cosmetic-thumb-icon { color: var(--ml-dim, #b4b8c3); }
</style>
