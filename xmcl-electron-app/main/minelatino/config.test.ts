import { describe, expect, it } from 'vitest'
import { FALLBACK_CONFIG, normalizeConfig } from './config'

describe('MineLatino profile configuration', () => {
  it('ships three optimized profiles for automatic creation', () => {
    expect(FALLBACK_CONFIG.presets.filter(preset => preset.autoCreate).map(preset => preset.minecraftVersion))
      .toEqual(['1.21.4', '1.21.11', '26.2'])
    expect(FALLBACK_CONFIG.presets.every(preset => preset.mods.length === 6)).toBe(true)
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
})
