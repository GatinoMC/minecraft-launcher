import { describe, expect, it } from 'vitest'
import { cosmeticSlots, isSoldOut, parseProduct, priceLabel, stockLabel } from './cosmeticsStore'

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

describe('cosmetic prices and stock', () => {
  it('shows free claims, unpublished prices and legacy unlimited stock', () => {
    expect(priceLabel(parseProduct({ ...product, amountMinor: 0 }))).toBe('Gratis')
    expect(priceLabel(parseProduct(product))).toBe('Precio por confirmar')
    expect(stockLabel(parseProduct(product))).toBe('Stock ilimitado')
    expect(isSoldOut(parseProduct(product))).toBe(false)
  })
  it('keeps sold-out products visible and distinguishes limited quantities', () => {
    const empty = parseProduct({ ...product, amountMinor: 0, stockMode: 'limited', stockRemaining: 0 })
    expect(isSoldOut(empty)).toBe(true)
    expect(stockLabel(empty)).toBe('Agotado')
    expect(stockLabel(parseProduct({ ...empty, stockRemaining: 3 }))).toBe('3 disponibles')
  })
  it('rejects malformed prices and stock instead of offering invalid products', () => {
    for (const amountMinor of [-1, 0.5, '0', NaN]) {
      expect(() => parseProduct({ ...product, amountMinor })).toThrow()
    }
    for (const stockRemaining of [-1, 0.5, '1', null, undefined, Infinity]) {
      expect(() => parseProduct({ ...product, stockMode: 'limited', stockRemaining })).toThrow()
    }
    expect(() => parseProduct({ ...product, stockMode: 'invalid' })).toThrow()
    expect(() => parseProduct({ ...product, stockMode: 'unlimited', stockRemaining: 4 })).toThrow()
  })
})
