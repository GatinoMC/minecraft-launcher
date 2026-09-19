export const MANAGED_CONTENT_STATE_FILE = '.gatinolauncher-content.json'

export const MANAGED_MINECRAFT_VERSIONS = ['1.21.4', '1.21.11', '26.2'] as const
export type ManagedMinecraftVersion = typeof MANAGED_MINECRAFT_VERSIONS[number]

export interface ManagedDownload {
  fileName: string
  downloadUrl: string
  sha1: string
  fileSize: number
}

export interface LauncherResourcePack extends ManagedDownload {
  minecraftVersion: ManagedMinecraftVersion
  sha256: string
  revision: number
  uploadedAt: number
}

export const DEFAULT_SHADER_PACKS: readonly ManagedDownload[] = [
  {
    fileName: 'ComplementaryReimagined_r5.9.3.zip',
    downloadUrl: 'https://cdn.modrinth.com/data/HVnmMxH1/versions/Bqen1mJX/ComplementaryReimagined_r5.9.3.zip',
    sha1: '838139b54cddb56b2e83cd260d8efd960ac536d6',
    fileSize: 553397,
  },
  {
    fileName: 'ComplementaryUnbound_r5.9.3.zip',
    downloadUrl: 'https://cdn.modrinth.com/data/R6NEzAwj/versions/B1kyfoUZ/ComplementaryUnbound_r5.9.3.zip',
    sha1: '2ee08300e1d6f039e63eae8484dddf57b3aaaf67',
    fileSize: 553400,
  },
  {
    fileName: 'BSL_v10.1.5.zip',
    downloadUrl: 'https://cdn.modrinth.com/data/Q1vvjJYV/versions/yFTiE1Nc/BSL_v10.1.5.zip',
    sha1: '49bed4894881b22fa680b97504f0c3265bafbcbc',
    fileSize: 1133936,
  },
  {
    fileName: 'photon_v1.3b.zip',
    downloadUrl: 'https://cdn.modrinth.com/data/lLqFfGNs/versions/gUv7fBPN/photon_v1.3b.zip',
    sha1: 'd975d25c9686de5f10e8b86c8518613cdf3f040a',
    fileSize: 3800987,
  },
]

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function normalizeLauncherResourcePackManifest(raw: unknown): LauncherResourcePack[] {
  const source = record(raw)
  if (number(source.schemaVersion) !== 1 || !Array.isArray(source.items)) return []
  const supported = new Set<string>(MANAGED_MINECRAFT_VERSIONS)
  const result: LauncherResourcePack[] = []
  for (const value of source.items) {
    const item = record(value)
    const minecraftVersion = string(item.minecraftVersion)
    const fileName = string(item.fileName)
    const downloadUrl = string(item.downloadUrl)
    const sha1 = string(item.sha1).toLowerCase()
    const sha256 = string(item.sha256).toLowerCase()
    const fileSize = number(item.fileSize)
    const revision = number(item.revision)
    if (!supported.has(minecraftVersion) || !fileName.toLowerCase().endsWith('.zip') || !downloadUrl
      || !/^[a-f0-9]{40}$/.test(sha1) || !/^[a-f0-9]{64}$/.test(sha256)
      || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 128 * 1024 * 1024
      || !Number.isSafeInteger(revision) || revision <= 0) continue
    result.push({
      minecraftVersion: minecraftVersion as ManagedMinecraftVersion,
      fileName,
      downloadUrl,
      sha1,
      sha256,
      fileSize,
      revision,
      uploadedAt: number(item.uploadedAt),
    })
  }
  return result
}

export function managedResourcePackFileName(pack: LauncherResourcePack): string {
  return `GatinoLauncher-${pack.minecraftVersion}-${pack.sha1.slice(0, 12)}.zip`
}

export function updateResourcePackOptions(content: string, nextFileName?: string, previousFileName?: string): string {
  const nextEntry = nextFileName ? `file/${nextFileName}` : undefined
  const previousEntry = previousFileName ? `file/${previousFileName}` : undefined
  const lines = content.split(/\r?\n/)
  const index = lines.findIndex(line => line.startsWith('resourcePacks:'))
  let current: string[] = []
  if (index >= 0) {
    try {
      const parsed = JSON.parse(lines[index].slice('resourcePacks:'.length))
      if (Array.isArray(parsed)) current = parsed.filter((value): value is string => typeof value === 'string')
    } catch {}
  }
  current = current.filter(value => value !== previousEntry && value !== nextEntry)
  if (nextEntry) current.push(nextEntry)
  const line = `resourcePacks:${JSON.stringify(current)}`
  if (index >= 0) lines[index] = line
  else lines.push(line)
  return lines.join(content.includes('\r\n') ? '\r\n' : '\n')
}

/** Retire only the shader previously selected by the launcher, not a player's choice. */
export function disableManagedDefaultShader(content: string, previousDefaultShader?: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const currentShader = /^shaderPack=(.*)$/m.exec(content)?.[1]?.trim() ?? ''
  if (currentShader && currentShader !== previousDefaultShader) return content
  const set = (key: string, value: string) => {
    const index = lines.findIndex(line => line.startsWith(`${key}=`))
    if (index >= 0) lines[index] = `${key}=${value}`
    else lines.push(`${key}=${value}`)
  }
  set('enableShaders', 'false')
  set('shaderPack', '')
  return lines.join(eol)
}
