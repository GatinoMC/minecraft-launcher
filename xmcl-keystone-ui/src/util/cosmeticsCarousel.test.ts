import { describe, expect, test } from 'vitest'
import { retainCarouselItemIndex, wrapCarouselIndex } from './cosmeticsCarousel'

describe('cosmetics carousel', () => {
  test('wraps in both directions', () => {
    expect(wrapCarouselIndex(0, -1, 3)).toBe(2)
    expect(wrapCarouselIndex(2, 1, 3)).toBe(0)
    expect(wrapCarouselIndex(0, 1, 1)).toBe(0)
    expect(wrapCarouselIndex(4, 1, 0)).toBe(0)
  })

  test('keeps the visible product when a filtered list changes', () => {
    const items = [{ id: 'cape' }, { id: 'hat' }, { id: 'pet' }]
    expect(retainCarouselItemIndex(items, 'hat')).toBe(1)
    expect(retainCarouselItemIndex(items, 'missing')).toBe(0)
  })
})
