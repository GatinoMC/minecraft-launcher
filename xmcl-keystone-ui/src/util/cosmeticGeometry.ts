import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

type Vec = [number, number, number]
interface Element { from: Vec; to: Vec; rotation?: { axis: 'x' | 'y' | 'z'; origin: Vec; angle: number; rescale?: boolean }; faces: Record<string, { uv?: number[]; rotation?: number; texture?: string | null }>; minelatino_vertices?: Record<string, Vec[]> }
export interface JavaCosmeticModel { texture_size?: [number, number]; textures?: Record<string, string>; elements: Element[]; display?: { head?: { translation?: Vec; rotation?: Vec; scale?: Vec }; minelatino_backpack?: { translation?: Vec; rotation?: Vec; scale?: Vec } } }
export function textureName(model: JavaCosmeticModel, reference = '') {
  const visited = new Set<string>()
  while (reference.startsWith('#')) {
    if (visited.has(reference) || typeof model.textures?.[reference.slice(1)] !== 'string') throw new Error(`Textura no resuelta: ${reference}`)
    visited.add(reference); reference = model.textures[reference.slice(1)]
  }
  const name = reference.slice(reference.lastIndexOf('/') + 1).replace(/\.png$/, '')
  if (name && !/^[a-z0-9_]{1,32}$/.test(name)) throw new Error('Nombre de textura no admitido')
  return name
}
const vector = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 65536)

/** Java UV coordinates use 16 units, even when Blockbench exports texture_size metadata. */
export function cosmeticGeometry(model: JavaCosmeticModel) {
  if (!Array.isArray(model?.elements) || !model.elements.length || model.elements.length > 4096) throw new Error('Se requiere un modelo Minecraft Java con 1–4096 elementos')
  const positions: number[] = [], uv: number[] = []
  const names: string[] = [], groups: { start: number; count: number; materialIndex: number }[] = []
  for (const e of model.elements) {
    if (!vector(e.from, 3) || !vector(e.to, 3) || !e.faces) throw new Error('Elemento inválido')
    const [x, y, z] = e.from, [X, Y, Z] = e.to
    const faces: Record<string, number[][]> = {
      north: [[X,Y,z],[X,y,z],[x,y,z],[x,Y,z]], south: [[x,Y,Z],[x,y,Z],[X,y,Z],[X,Y,Z]],
      east: [[X,Y,Z],[X,y,Z],[X,y,z],[X,Y,z]], west: [[x,Y,z],[x,y,z],[x,y,Z],[x,Y,Z]],
      up: [[x,Y,z],[x,Y,Z],[X,Y,Z],[X,Y,z]], down: [[x,y,Z],[x,y,z],[X,y,z],[X,y,Z]],
    }
    const defaults: Record<string, number[]> = {
      north: [16-X,16-Y,16-x,16-y], south: [x,16-Y,X,16-y], east: [16-Z,16-Y,16-z,16-y],
      west: [z,16-Y,Z,16-y], up: [x,z,X,Z], down: [x,16-Z,X,16-z],
    }
    for (const [direction, corners] of Object.entries(faces)) {
      const face = e.faces[direction]
      if (!face || face.texture === null) continue
      const name = textureName(model, face.texture)
      if (!names.includes(name)) names.push(name)
      groups.push({ start: positions.length / 3, count: 6, materialIndex: names.indexOf(name) })
      const rect = face.uv ?? defaults[direction], turn = face.rotation ?? 0
      if (!vector(rect, 4) || ![0,90,180,270].includes(turn)) throw new Error('UV inválidas')
      const explicit = e.minelatino_vertices?.[direction]
      if (explicit !== undefined && (!Array.isArray(explicit) || explicit.length !== 4 || !explicit.every(vertex => vector(vertex, 3)))) throw new Error('Vértices explícitos inválidos')
      const vertices = (explicit ?? corners).map(c => {
        const p = new Vector3(c[0], c[1], c[2]), r = e.rotation
        if (r && explicit === undefined) {
          if (!['x','y','z'].includes(r.axis) || !vector(r.origin, 3) || !Number.isFinite(r.angle)) throw new Error('Rotación inválida')
          const origin = new Vector3(...r.origin), angle = r.angle * Math.PI / 180
          p.sub(origin).applyAxisAngle(new Vector3(r.axis === 'x' ? 1 : 0, r.axis === 'y' ? 1 : 0, r.axis === 'z' ? 1 : 0), angle)
          const factor = r.rescale ? 1 / Math.abs(Math.cos(angle)) : 1
          if (!Number.isFinite(factor) || factor > 100) throw new Error('Escala inválida')
          for (const axis of ['x','y','z'] as const) if (axis !== r.axis) p[axis] *= factor
          p.add(origin)
        }
        return p.subScalar(8)
      })
      for (const i of [0,1,2,0,2,3]) {
        positions.push(...vertices[i].toArray())
        const index = (i + turn / 90) % 4
        // Minecraft Java model UVs always use a virtual 16x16 grid. Blockbench's
        // texture_size describes the source image and must not rescale face UVs.
        uv.push(rect[index < 2 ? 0 : 2] / 16, 1 - rect[index === 0 || index === 3 ? 1 : 3] / 16)
      }
    }
  }
  const head = model.display?.head
  for (const v of [head?.translation, head?.rotation, head?.scale]) if (v !== undefined && !vector(v, 3)) throw new Error('Transformación head inválida')
  const backpack = model.display?.minelatino_backpack
  for (const v of [backpack?.translation, backpack?.rotation, backpack?.scale]) if (v !== undefined && !vector(v, 3)) throw new Error('Transformación backpack inválida')
  if (!positions.length) throw new Error('Modelo sin caras visibles')
  const geometry = new BufferGeometry()
  for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex)
  geometry.userData.textureNames = names
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.computeVertexNormals()
  return geometry
}
