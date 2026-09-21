import { describe, expect, it } from 'vitest'
import { normalizeCosmeticsPlayer, normalizeEquippedCosmetics, selectPlayerAppearance } from './cosmeticsAppearance'

describe('MineLatino cosmetics appearance', () => {
  it('normalizes a Minecraft identity for the public appearance request', () => {
    expect(normalizeCosmeticsPlayer({ uuid: 'AFA3C8CE-CDE5-4D70-AE4E-C2EEC4625FAC', name: ' Fredy_Graces ' }))
      .toEqual({ uuid: 'afa3c8cecde54d70ae4ec2eec4625fac', name: 'Fredy_Graces' })
    expect(normalizeCosmeticsPlayer({ uuid: 'invalid', name: 'not valid!' }))
      .toEqual({ uuid: '', name: '' })
  })

  it('merges duplicate UUID/name results and keeps one valid cosmetic per slot', () => {
    const response = { players: [
      { uuid: 'afa3c8cecde54d70ae4ec2eec4625fac', name: null, equipped: [{ slot: 'HAT', cosmeticId: 'old_hat' }] },
      { uuid: 'afa3c8cecde54d70ae4ec2eec4625fac', name: 'Fredy_Graces', equipped: [
        { slot: 'HAT', cosmeticId: 'peluche2' },
        { slot: 'PET', cosmeticId: 'mascotaml' },
      ] },
    ] }
    expect(selectPlayerAppearance(response, { uuid: 'afa3c8cecde54d70ae4ec2eec4625fac', name: 'fredy_graces' })).toEqual([
      { slot: 'HAT', cosmeticId: 'peluche2' },
      { slot: 'PET', cosmeticId: 'mascotaml' },
    ])
  })

  it('rejects malformed equipped entries', () => {
    expect(normalizeEquippedCosmetics([
      { slot: 'PET', cosmeticId: 'petdemonio' },
      { slot: 'INVALID', cosmeticId: 'backpack' },
      { slot: 'HAT', cosmeticId: '../bad' },
    ])).toEqual([{ slot: 'PET', cosmeticId: 'petdemonio' }])
  })
})
