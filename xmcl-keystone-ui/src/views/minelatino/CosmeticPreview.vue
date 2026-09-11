<template>
  <div ref="container" class="cosmetic-stage">
    <canvas ref="canvas" aria-label="Vista 3D de tu skin con el cosmético. Arrastra para girar y usa la rueda para acercar." />
    <div v-if="loading || error" class="stage-status" role="status">
      {{ error || 'Preparando tu look…' }}
      <button v-if="error" type="button" @click="load">Reintentar</button>
    </div>
    <div class="stage-controls">
      <button type="button" @click="turn(false)">Frente</button>
      <button type="button" @click="turn(true)">Espalda</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { SkinViewer } from 'skinview3d'
import { Group, Mesh } from 'three'
import { CosmeticProduct, resourceUrl } from '@/composables/cosmeticsStore'
import { JavaCosmeticModel } from '@/util/cosmeticGeometry'
import { createCosmeticMesh, disposeCosmeticMesh } from '@/util/cosmeticMaterials'
import { petPreviewPosition } from '@/util/cosmeticPlacement'

const props = defineProps<{ product: CosmeticProduct; skin: string }>()
const canvas = ref<HTMLCanvasElement>()
const container = ref<HTMLDivElement>()
const loading = ref(true), error = ref('')
let viewer: SkinViewer | undefined, observer: ResizeObserver | undefined
let mesh: Mesh | undefined, attachment: Group | undefined, savedTransform: Group | undefined
let request: AbortController | undefined
function clearModel() {
  attachment?.removeFromParent()
  if (mesh) disposeCosmeticMesh(mesh)
  mesh = undefined; attachment = undefined; savedTransform = undefined
}
function turn(back: boolean) {
  if (viewer) {
    viewer.controls.reset(); viewer.resetCameraPose()
    if (back) { viewer.camera.position.x *= -1; viewer.camera.position.z *= -1 }
    viewer.controls.update()
  }
}
async function load() {
  request?.abort()
  const active = request = new AbortController()
  const timeout = setTimeout(() => active.abort(), 15000)
  clearModel()
  loading.value = true; error.value = ''
  const target = viewer, product = props.product
  if (!target) { clearTimeout(timeout); return }
  target.resetCape()
  try {
    // Only trusted selected profile skins are passed here; a failed skin never silently shows another player.
    await Promise.race([target.loadSkin(props.skin), new Promise<never>((_, reject) => active.signal.addEventListener('abort', () => reject(new Error('Tiempo de espera agotado')), { once: true }))])
    if (active.signal.aborted || request !== active) return
    if (!product.hasTexture) throw new Error('Este cosmético aún no tiene textura publicada.')
    if (!product.hasModel) {
      if (product.slot !== 'CAPE' && product.slot !== 'WINGS') throw new Error('Falta el modelo Java JSON para previsualizar este cosmético.')
      await Promise.race([target.loadCape(resourceUrl(product), { backEquipment: product.slot === 'WINGS' ? 'elytra' : 'cape' }), new Promise<never>((_, reject) => active.signal.addEventListener('abort', () => reject(new Error('Tiempo de espera agotado')), { once: true }))])
    } else {
      const modelResponse = await fetch(resourceUrl(product, true), { signal: active.signal, credentials: 'omit' })
      if (!modelResponse.ok) throw new Error('No se pudo descargar el modelo.')
      const modelText = await modelResponse.text()
      if (modelText.length > 2 * 1024 * 1024) throw new Error('Recurso demasiado grande')
      const model: JavaCosmeticModel = JSON.parse(modelText)
      const loaded = await createCosmeticMesh(product, model, active.signal)
      if (active.signal.aborted || request !== active) { disposeCosmeticMesh(loaded); return }
      mesh = loaded
      attachment = new Group()
      savedTransform = new Group()
      // skinview3d's nested Three declarations differ from the workspace declarations.
      const compatibleAttachment = attachment as unknown as Parameters<typeof target.playerObject.add>[0]
      attachment.add(savedTransform)
      savedTransform.add(mesh)
      // Rotate cosmetic model 180° so it faces the camera (Blockbench front = -Z, camera at +Z).
      attachment.rotation.y = Math.PI
      const configured = product.transform
      if (configured) {
        const [tx, ty, tz] = configured.translation
        const [rx, ry, rz] = configured.rotation
        savedTransform.position.set(-tx, ty, -tz)
        savedTransform.rotation.set(-rx * Math.PI / 180, ry * Math.PI / 180, -rz * Math.PI / 180)
        savedTransform.scale.set(...configured.scale)
      }
      if (product.slot === 'HAT') {
        // CustomHeadLayer default: 0.625 scale, base at head Y=-0.25 in model-part space.
        attachment.position.set(0, 4, 0)
        attachment.scale.setScalar(0.625)
        const head = model.display?.head
        if (!configured) {
          mesh.position.set(...(head?.translation ?? [0,0,0]))
          mesh.rotation.set(...((head?.rotation ?? [0,0,0]).map(v => v * Math.PI / 180) as [number,number,number]))
          mesh.scale.set(...(head?.scale ?? [1,1,1]))
        }
        target.playerObject.skin.head.add(compatibleAttachment)
      } else if (product.slot === 'PET') {
        // skinview3d is centered and Y-up: web Y=1 is +16 px. Minecraft's
        // equivalent is Y=-0.5 in its head-relative, Y-down model space.
        attachment.position.set(...petPreviewPosition())
        attachment.scale.setScalar(0.55)
        target.playerObject.add(compatibleAttachment)
      } else {
        attachment.position.set(0, 1.2, product.slot === 'BACKPACK' ? -4.8 : -2.56)
        if (!configured && product.slot === 'BACKPACK' && model.display?.minelatino_backpack) {
          const b = model.display.minelatino_backpack
          mesh.position.set(...(b.translation ?? [0,0,0]))
          mesh.rotation.set(...((b.rotation ?? [0,0,0]).map(v => v * Math.PI / 180) as [number,number,number]))
          mesh.scale.set(...(b.scale ?? [1,1,1]))
        }
        target.playerObject.skin.body.add(compatibleAttachment)
      }
    }
    if (request === active) turn(false)
  } catch (e) {
    if (request === active) error.value = active.signal.aborted ? 'La vista 3D tardó demasiado en cargar.' : e instanceof Error ? e.message : 'Vista 3D no disponible'
  } finally {
    clearTimeout(timeout)
    if (request === active) loading.value = false
  }
}
onMounted(() => {
  try {
    viewer = new SkinViewer({ canvas: canvas.value, width: 340, height: 380, zoom: 0.75, fov: 45 })
    observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      if (viewer && rect.width && rect.height) { viewer.width = rect.width; viewer.height = rect.height }
    })
    observer.observe(container.value!)
    void load()
  } catch { loading.value = false; error.value = 'No se pudo iniciar WebGL. Comprueba la aceleración gráfica.' }
})
watch(() => [props.product.id, props.product.resourceVersion, props.skin], load)
onBeforeUnmount(() => { request?.abort(); request = undefined; observer?.disconnect(); clearModel(); viewer?.dispose(); viewer = undefined })
</script>
<style scoped>
.cosmetic-stage { position: relative; width: 100%; height: 380px; min-width: 0; overflow: hidden; border-radius: 20px; background: radial-gradient(ellipse at 50% 60%, #805c2638, transparent 65%), linear-gradient(150deg, #20232b, #101218); }
canvas { display: block; touch-action: none; }
.stage-status { position: absolute; inset: 12px 12px auto; padding: 12px; color: #fff; background: #101218e8; border-radius: 12px; font-size: 13px; }
.stage-controls { position: absolute; bottom: 12px; left: 0; right: 0; display: flex; gap: 8px; justify-content: center; }
button { padding: 7px 14px; border: 1px solid #ffffff26; background: #14161de8; border-radius: 9px; color: #eee; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--ml-accent); }
</style>
