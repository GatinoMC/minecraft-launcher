import { describe, expect, it } from 'vitest'
import { BufferAttribute } from 'three'
import { cosmeticGeometry } from './cosmeticGeometry'

describe('cosmetic Java model preview', () => {
  it('builds a face with default UVs in skin pixel units', () => {
    const geometry = cosmeticGeometry({ elements: [{ from: [0,0,0], to: [16,16,16], faces: { north: {} } }] })
    expect(geometry.getAttribute('position').count).toBe(6)
    expect(Array.from((geometry.getAttribute('position') as BufferAttribute).array).slice(0,3)).toEqual([8,8,-8])
    expect(Array.from((geometry.getAttribute('uv') as BufferAttribute).array).slice(0,2)).toEqual([0,1])
    geometry.dispose()
  })
  it('rejects invalid rotations, coordinates and empty models', () => {
    expect(() => cosmeticGeometry({ elements: [] })).toThrow()
    expect(() => cosmeticGeometry({ elements: [{ from: [NaN,0,0], to: [16,16,16], faces: { up: {} } }] })).toThrow()
    expect(() => cosmeticGeometry({ elements: [{ from: [0,0,0], to: [16,16,16], faces: { up: { rotation: 45 } } }] })).toThrow()
  })
  it('rotates face UVs and geometry like the mod', () => {
    const geometry = cosmeticGeometry({ elements: [{ from: [0,0,0], to: [16,16,16], rotation: { axis: 'y', angle: 90, origin: [8,8,8] }, faces: { north: { uv: [2,4,10,12], rotation: 90 } } }] })
    const p = geometry.getAttribute('position') as BufferAttribute
    expect(p.getX(0)).toBeCloseTo(-8); expect(p.getZ(0)).toBeCloseTo(-8)
    expect(Array.from((geometry.getAttribute('uv') as BufferAttribute).array).slice(0,2)).toEqual([0.125,0.25])
    geometry.dispose()
  })
  it('keeps Java UV units independent of Blockbench texture_size metadata', () => {
    const geometry = cosmeticGeometry({ texture_size: [128, 128], elements: [{ from: [0,0,0], to: [16,16,16], faces: { north: { uv: [0, 14.125, 16, 30.125] } } }] })
    const uvArr = Array.from((geometry.getAttribute('uv') as BufferAttribute).array)
    expect(uvArr[0]).toBeCloseTo(0)
    expect(uvArr[1]).toBeCloseTo(1 - 14.125 / 16)
    expect(uvArr[3]).toBeCloseTo(1 - 30.125 / 16)
    expect(uvArr[4]).toBeCloseTo(1)
    geometry.dispose()
  })
  it('uses explicit vertices produced from bbmodel hierarchy', () => {
    const geometry = cosmeticGeometry({ elements: [{ from: [0,0,0], to: [2,2,2], faces: { north: { uv: [0,0,16,16] } },
      minelatino_vertices: { north: [[-2,2,0],[0,2,0],[0,0,0],[-2,0,0]] } }] })
    const position = geometry.getAttribute('position') as BufferAttribute
    expect([position.getX(0), position.getY(0), position.getZ(0)]).toEqual([-10,-6,-8])
    geometry.dispose()
  })
})
