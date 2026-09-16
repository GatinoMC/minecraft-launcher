import type { MineLatinoLoader, MineLatinoPreset } from '@xmcl/runtime-api'

export interface PresetInstanceCandidate {
  path: string
  name: string
  runtime: unknown
}

const LEGACY_PRESET_MOD_PREFIXES = [
  'entityculling-',
  'fabric-api-',
  'ferritecore-',
  'immediatelyfast-',
  'lithium-',
  'sodium-fabric-',
]

/**
 * Select only files previously owned by the preset. The first migration comes
 * from a state file that predates `managedFiles`, so it recognizes the six
 * starter mods shipped by that older catalog without touching player-added
 * mods. Every later migration uses the exact recorded filenames.
 */
export function selectSupersededPresetModFiles(
  existingFiles: string[],
  expectedFiles: string[],
  previousManagedFiles: string[],
): string[] {
  const expected = new Set(expectedFiles.map(file => file.toLowerCase()))
  const previous = previousManagedFiles.map(file => file.toLowerCase())
  const candidates = previous.length > 0
    ? new Set(previous)
    : new Set(existingFiles
        .map(file => file.toLowerCase())
        .filter(file => LEGACY_PRESET_MOD_PREFIXES.some(prefix => file.startsWith(prefix))))
  return existingFiles.filter(file => {
    const lower = file.toLowerCase()
    return candidates.has(lower) && !expected.has(lower)
  })
}

/**
 * Select profiles that should be provisioned automatically. Configurations
 * produced by older backends have no `autoCreate` field, so retain the legacy
 * single recommended-profile fallback in that case.
 */
export function selectAutoCreatePresets(presets: MineLatinoPreset[]): MineLatinoPreset[] {
  const selected = presets.filter(preset => preset.autoCreate)
  if (selected.length > 0) return selected
  const fallback = presets.find(preset => preset.recommended) ?? presets[0]
  return fallback ? [fallback] : []
}

/**
 * Find an existing managed profile that represents the recommended preset.
 * Unrelated managed profiles and profiles imported from other launchers must
 * not suppress creation of MineLatino's ready-to-play profile.
 */
export function findPresetInstanceCandidate<T extends PresetInstanceCandidate>(
  preset: MineLatinoPreset,
  instances: T[],
  isManaged: (path: string) => boolean,
  getLoader: (runtime: Record<string, unknown>) => MineLatinoLoader | undefined,
): T | undefined {
  return instances.find((instance) => {
    if (!isManaged(instance.path)) return false
    const runtime = instance.runtime as Record<string, unknown> | undefined
    return instance.name === preset.name
      && runtime?.minecraft === preset.minecraftVersion
      && getLoader(runtime) === preset.loader
  })
}
