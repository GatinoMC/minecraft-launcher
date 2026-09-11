import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { animationFrames } from './cosmeticMaterials'
import { cosmeticGeometry, textureName } from './cosmeticGeometry'
describe('multi-texture cosmetics', () => {
  it('resolves aliases without trusting local paths', () => {
    expect(textureName({ elements: [], textures: { '2': '#a', a: 'elitecreatures/set/heart_of_the_sea_animation2' } }, '#2')).toBe('heart_of_the_sea_animation2')
    expect(() => textureName({ elements: [], textures: { a: '#a' } }, '#a')).toThrow()
  })
  it('animates in frame space and supports the supplied fractional frame duration', () => {
    const a = animationFrames({ animation: { frametime: 1.8 } }, 16, 320)
    expect(a.rows).toBe(20); expect(a.frame(0)).toBe(0); expect(a.frame(1.81)).toBe(1); expect(a.frame(36)).toBe(0)
    expect(() => animationFrames({ animation: { frametime: 0 } }, 16,32)).toThrow()
  })
  it.skipIf(!process.env.HEART_OF_SEA_MODEL)('parses the supplied backpack and separates its actual faces', () => {
    const g = cosmeticGeometry(JSON.parse(readFileSync(process.env.HEART_OF_SEA_MODEL!, 'utf8')))
    expect(new Set(g.userData.textureNames)).toEqual(new Set(['heart_of_the_sea_texture', 'heart_of_the_sea_animation2']))
    expect(g.groups.some(g => g.materialIndex === 1)).toBe(true)
    g.dispose()
  })
})
