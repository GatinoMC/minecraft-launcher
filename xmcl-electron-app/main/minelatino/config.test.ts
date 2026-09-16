import { describe, expect, it } from 'vitest'
import { FALLBACK_CONFIG, normalizeConfig } from './config'

describe('MineLatino profile configuration', () => {
  it('ships three optimized profiles for automatic creation', () => {
    expect(FALLBACK_CONFIG.presets.filter(preset => preset.autoCreate).map(preset => preset.minecraftVersion))
      .toEqual(['1.21.4', '1.21.11', '26.2'])
    expect(FALLBACK_CONFIG.presets.map(preset => preset.mods.length)).toEqual([22, 32, 29])
    expect(FALLBACK_CONFIG.presets.every(preset => preset.name.startsWith('GatinoLauncher '))).toBe(true)
  })

  it('keeps the backend autoCreate flag during normalization', () => {
    const config = normalizeConfig({
      presets: [{
        id: 'automatic',
        name: 'Automatic',
        minecraftVersion: '26.2',
        loader: 'fabric',
        mods: [],
        autoCreate: true,
      }],
    })

    expect(config.presets[0]?.autoCreate).toBe(true)
  })

  it('accepts verified HTTPS preset downloads and drops unsafe ones', () => {
    const config = normalizeConfig({
      presets: [{
        id: 'direct',
        minecraftVersion: '26.2',
        loader: 'fabric',
        mods: [{
          downloadUrl: 'https://cdn.example/boosters.jar',
          sha1: 'a32087f22cac539fb5b307a53b37e27a3ee2b0f6',
          fileName: 'boosters.jar',
          fileSize: 50_149,
        }, {
          downloadUrl: 'http://insecure.example/mod.jar',
          sha1: 'invalid',
          fileName: '../mod.jar',
        }],
      }],
    })

    expect(config.presets[0]?.mods).toEqual([{
      projectId: undefined,
      version: undefined,
      downloadUrl: 'https://cdn.example/boosters.jar',
      sha1: 'a32087f22cac539fb5b307a53b37e27a3ee2b0f6',
      fileName: 'boosters.jar',
      fileSize: 50_149,
    }])
  })
})
