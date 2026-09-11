import { DoubleSide, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace, Texture } from 'three'
import { CosmeticProduct, resourceUrl } from '@/composables/cosmeticsStore'
import { cosmeticGeometry, JavaCosmeticModel } from './cosmeticGeometry'

export function animationFrames(meta: { animation?: { width?: number; height?: number; frametime?: number; interpolate?: boolean; frames?: (number | { index: number; time?: number })[] } } | null, width: number, height: number) {
  const a = meta?.animation
  if (!a) return { columns: 1, rows: 1, frame: (_ticks: number) => 0 }
  const fw = a.width ?? (a.height ? width : Math.min(width, height)), fh = a.height ?? (a.width ? height : fw)
  if (!Number.isInteger(fw) || !Number.isInteger(fh) || fw <= 0 || fh <= 0 || width % fw || height % fh) throw new Error('Dimensiones de animación inválidas')
  const columns = width / fw, rows = height / fh, count = columns * rows, time = a.frametime ?? 1
  if (count > 4096 || !Number.isFinite(time) || time <= 0 || a.interpolate) throw new Error('Animación no admitida: comprueba frametime e interpolate')
  const source = a.frames?.length ? a.frames : Array.from({ length: count }, (_, i) => i)
  if (source.length > 4096) throw new Error('Demasiados fotogramas')
  const frames = source.map(f => typeof f === 'number' ? { index: f, time } : { index: f.index, time: f.time ?? time })
  if (frames.some(f => !Number.isInteger(f.index) || f.index < 0 || f.index >= count || !Number.isFinite(f.time) || f.time <= 0)) throw new Error('Fotograma inválido')
  const total = frames.reduce((sum, f) => sum + f.time, 0)
  return { columns, rows, frame(ticks: number) {
    let t = ((ticks % total) + total) % total
    for (const f of frames) { if (t < f.time) return f.index; t -= f.time }
    return frames[0].index
  } }
}

export function disposeCosmeticMesh(mesh: Mesh) {
  mesh.geometry.dispose()
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (material instanceof MeshStandardMaterial) material.map?.dispose()
    material.dispose()
  }
}

export async function createCosmeticMesh(
  product: CosmeticProduct,
  model: JavaCosmeticModel,
  signal: AbortSignal,
  resourceOptions: Omit<RequestInit, 'signal'> = {},
) {
  const geometry = cosmeticGeometry(model), names: string[] = geometry.userData.textureNames
  const materials: MeshStandardMaterial[] = [], updates: (() => void)[] = []
  try {
    if (names.length > 32) throw new Error('Demasiadas texturas')
    const base = resourceUrl(product)
    const response = await fetch(`${base}&type=manifest`, { credentials: 'omit', ...resourceOptions, signal })
    if (!response.ok) throw new Error(`No se pudo obtener el manifiesto de texturas (${response.status})`)
    let files: { name: string; hasMcmeta: boolean }[] = []
    try { files = (await response.json()).files; if (!Array.isArray(files)) throw new Error() } catch {
      if (names.length > 1) throw new Error('Actualiza el servicio: falta el manifiesto de texturas')
      files = []
    }
    for (const name of names) {
      const file = files.find(f => f.name === name)
      if (!file && names.length > 1) throw new Error(`Sube la textura con el nombre ${name}`)
      const url = file ? `${base}&file=${encodeURIComponent(name)}` : base
      const png = await fetch(url, { credentials: 'omit', ...resourceOptions, signal })
      if (!png.ok) throw new Error(`No se pudo descargar ${name} (${png.status})`)
      const blob = await png.blob()
      if (blob.size > 2 * 1024 * 1024) throw new Error('Textura demasiado grande')
      let meta = null
      if (file?.hasMcmeta) {
        const response = await fetch(`${url}&type=mcmeta`, { credentials: 'omit', ...resourceOptions, signal })
        if (!response.ok) throw new Error(`No se pudo descargar la animación de ${name}`)
        meta = await response.json()
      }
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' })
      let animation: ReturnType<typeof animationFrames>
      try {
        if (bitmap.width > 4096 || bitmap.height > 4096 || signal.aborted) throw new Error('Carga cancelada o textura demasiado grande')
        animation = animationFrames(meta, bitmap.width, bitmap.height)
      } catch (e) { bitmap.close(); throw e }
      const texture = new Texture(bitmap)
      texture.minFilter = NearestFilter; texture.magFilter = NearestFilter
      ;(texture as Texture & { colorSpace: string }).colorSpace = SRGBColorSpace
      texture.generateMipmaps = false; texture.needsUpdate = true
      texture.addEventListener('dispose', () => bitmap.close())
      const material = new MeshStandardMaterial({ map: texture, alphaTest: 0.1, roughness: 1, side: DoubleSide })
      materials.push(material)
      updates.push(() => {
        const frame = animation.frame(performance.now() / 50)
        texture.repeat.set(1 / animation.columns, 1 / animation.rows)
        texture.offset.set((frame % animation.columns) / animation.columns, 1 - (Math.floor(frame / animation.columns) + 1) / animation.rows)
      })
    }
    const mesh = new Mesh(geometry, materials)
    mesh.onBeforeRender = () => updates.forEach(update => update())
    return mesh
  } catch (e) {
    geometry.dispose()
    for (const m of materials) { m.map?.dispose(); m.dispose() }
    throw e
  }
}
