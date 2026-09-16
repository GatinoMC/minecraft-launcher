import type { MineLatinoPreset } from '@xmcl/runtime-api'
import { describe, expect, it } from 'vitest'
import { findPresetInstanceCandidate, selectAutoCreatePresets, selectSupersededPresetModFiles, shouldRetireLegacyPresetInstance } from './presetInstance'

const preset: MineLatinoPreset = {
  id: 'minelatino-1-21-11',
  name: 'MineLatino 1.21.11',
  minecraftVersion: '1.21.11',
  loader: 'fabric',
  mods: [],
  recommended: true,
}

const getLoader = (runtime: Record<string, unknown>) => runtime.fabricLoader ? 'fabric' as const : undefined

describe('findPresetInstanceCandidate', () => {
  it('does not let unrelated managed profiles suppress the recommended profile', () => {
    const result = findPresetInstanceCandidate(preset, [{
      path: 'managed/other',
      name: 'Mi perfil',
      runtime: { minecraft: '1.21.11', fabricLoader: '0.19.5' },
    }], path => path.startsWith('managed/'), getLoader)

    expect(result).toBeUndefined()
  })

  it('reuses the matching managed profile so missing starter mods can be applied', () => {
    const expected = {
      path: 'managed/minelatino',
      name: 'MineLatino 1.21.11',
      runtime: { minecraft: '1.21.11', fabricLoader: '0.19.5' },
    }
    const result = findPresetInstanceCandidate(preset, [
      { path: 'external/minelatino', name: preset.name, runtime: expected.runtime },
      expected,
    ], path => path.startsWith('managed/'), getLoader)

    expect(result).toBe(expected)
  })
})

describe('selectAutoCreatePresets', () => {
  it('selects every explicitly auto-created profile', () => {
    const profiles = [
      { ...preset, id: '1.21.4', autoCreate: true, recommended: false },
      { ...preset, id: '1.21.11', autoCreate: true },
      { ...preset, id: '26.2', autoCreate: true, recommended: false },
    ]

    expect(selectAutoCreatePresets(profiles).map(profile => profile.id)).toEqual(['1.21.4', '1.21.11', '26.2'])
  })

  it('keeps the recommended-profile fallback for an older backend', () => {
    const profiles = [
      { ...preset, id: 'old', recommended: false },
      { ...preset, id: 'recommended', recommended: true },
    ]

    expect(selectAutoCreatePresets(profiles).map(profile => profile.id)).toEqual(['recommended'])
  })
})

describe('selectSupersededPresetModFiles', () => {
  it('removes only replaced legacy starter mods on the first catalog migration', () => {
    expect(selectSupersededPresetModFiles([
      'sodium-fabric-old.jar',
      'fabric-api-old.jar',
      'player-added-mod.jar',
      'sodium-fabric-current.jar',
    ], ['sodium-fabric-current.jar', 'fabric-api-current.jar'], []))
      .toEqual(['sodium-fabric-old.jar', 'fabric-api-old.jar'])
  })

  it('uses recorded ownership for later migrations', () => {
    expect(selectSupersededPresetModFiles([
      'almanac-old.jar',
      'player-added-mod.jar',
      'almanac-current.jar',
    ], ['almanac-current.jar'], ['almanac-old.jar']))
      .toEqual(['almanac-old.jar'])
  })
})

describe('shouldRetireLegacyPresetInstance', () => {
  const activePresetIds = new Set(['minelatino-1-21-4', 'minelatino-1-21-11', 'minelatino-26-2'])

  it('retires a launcher-managed profile from the old default catalog', () => {
    expect(shouldRetireLegacyPresetInstance({
      path: 'managed/legacy',
      name: 'MineLatino 1.21.11',
      runtime: { minecraft: '1.21.11', fabricLoader: '0.19.5' },
    }, 'minelatino-1-21-11', activePresetIds)).toBe(true)
  })

  it('preserves custom and current GatinoLauncher profiles', () => {
    expect(shouldRetireLegacyPresetInstance({
      path: 'managed/custom',
      name: 'MineLatino 1.21.11',
      runtime: { minecraft: '1.21.11', fabricLoader: '0.19.5' },
    }, '', activePresetIds)).toBe(false)
    expect(shouldRetireLegacyPresetInstance({
      path: 'managed/current',
      name: 'GatinoLauncher 1.21.11',
      runtime: { minecraft: '1.21.11', fabricLoader: '0.19.5' },
    }, 'minelatino-1-21-11', activePresetIds)).toBe(false)
  })
})
