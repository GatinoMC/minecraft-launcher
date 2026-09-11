import { describe, expect, it } from 'vitest'
import { petPreviewPosition } from './cosmeticPlacement'

describe('cosmetic placement', () => {
  it('maps the editor pet anchor to skinview3d without dropping it to hand height', () => {
    expect(petPreviewPosition()).toEqual([-18.4, 16, 0])
  })
})
