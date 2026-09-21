import { describe, expect, it } from 'vitest'
import { matchesPlaytimeAccount, sumInstancePlaytime } from './playtime'

describe('sumInstancePlaytime', () => {
  it('combines every profile instead of keeping only the largest one', () => {
    expect(sumInstancePlaytime([19.5, 17.2, 5.4, 0])).toBeCloseTo(42.1)
  })

  it('ignores malformed counters', () => {
    expect(sumInstancePlaytime([3_600_000, -1, Number.NaN, '7200000', undefined])).toBe(3_600_000)
  })
})

describe('matchesPlaytimeAccount', () => {
  it('accepts a matching account name without relying on the public offline UUID', () => {
    expect(matchesPlaytimeAccount('Aylex', 'aylex')).toBe(true)
    expect(matchesPlaytimeAccount('Aylex', 'OtherPlayer')).toBe(false)
    expect(matchesPlaytimeAccount('Aylex', undefined)).toBe(false)
  })
})
