import { describe, expect, it } from 'vitest'
import { cosmeticSlots, parseProduct } from './cosmeticsStore'

const product = { id: 'cape', name: 'Capa', slot: 'CAPE', description: '', amountMinor: null, currency: 'USD', hasTexture: true, hasModel: false, textureCount: 1, resourceVersion: 'abcdef123456', transform: null }

describe('cosmetics without animated skins', () => {
  it('accepts every supported cosmetic from an older service', () => {
    for (const slot of Object.keys(cosmeticSlots)) {
      expect(parseProduct({ ...product, slot, hasAvatarPackage: false }).slot).toBe(slot)
    }
    expect(Object.keys(cosmeticSlots)).toHaveLength(5)
  })
  it('rejects legacy character products without rejecting normal capes', () => {
    expect(() => parseProduct({ ...product, slot: 'SKIN', hasAvatarPackage: true })).toThrow()
    expect(parseProduct(product).slot).toBe('CAPE')
  })
  it('accepts a validated editor transform and rejects malformed vectors', () => {
    const transform = { translation: [8, 4, -2], rotation: [0, 15, 0], scale: [1.2, 1.2, 1.2] }
    expect(parseProduct({ ...product, transform }).transform).toEqual(transform)
    expect(() => parseProduct({ ...product, transform: { ...transform, scale: [1, 0, 1] } })).toThrow()
  })
})
