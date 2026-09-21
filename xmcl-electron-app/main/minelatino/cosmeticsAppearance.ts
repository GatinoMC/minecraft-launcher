import type { MineLatinoCosmeticsPlayer, MineLatinoCosmeticSlot, MineLatinoEquippedCosmetic } from '@xmcl/runtime-api'

const slots = new Set<MineLatinoCosmeticSlot>(['HAT', 'CAPE', 'WINGS', 'BACKPACK', 'PET'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeUuid(value: unknown) {
  const uuid = typeof value === 'string' ? value.replaceAll('-', '').toLowerCase() : ''
  return /^[a-f0-9]{32}$/.test(uuid) ? uuid : ''
}

function normalizeName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  return /^[A-Za-z0-9_]{1,16}$/.test(name) ? name : ''
}

export function normalizeCosmeticsPlayer(player?: MineLatinoCosmeticsPlayer) {
  return {
    uuid: normalizeUuid(player?.uuid),
    name: normalizeName(player?.name),
  }
}

export function normalizeEquippedCosmetics(value: unknown): MineLatinoEquippedCosmetic[] {
  if (!Array.isArray(value)) return []
  const equipped = new Map<MineLatinoCosmeticSlot, MineLatinoEquippedCosmetic>()
  for (const raw of value) {
    const item = record(raw)
    const slot = item.slot as MineLatinoCosmeticSlot
    const cosmeticId = typeof item.cosmeticId === 'string' ? item.cosmeticId : ''
    if (!slots.has(slot) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(cosmeticId)) continue
    equipped.set(slot, { slot, cosmeticId })
  }
  return [...equipped.values()]
}

export function selectPlayerAppearance(response: unknown, player: MineLatinoCosmeticsPlayer) {
  const identity = normalizeCosmeticsPlayer(player)
  const players = record(response).players
  if (!Array.isArray(players)) throw new Error('Respuesta de apariencia de cosméticos inválida')
  const equipped: unknown[] = []
  for (const raw of players) {
    const appearance = record(raw)
    const uuid = normalizeUuid(appearance.uuid)
    const name = normalizeName(appearance.name)
    const matchesUuid = !!identity.uuid && uuid === identity.uuid
    const matchesName = !!identity.name && name.toLowerCase() === identity.name.toLowerCase()
    if ((matchesUuid || matchesName) && Array.isArray(appearance.equipped)) {
      equipped.push(...appearance.equipped)
    }
  }
  return normalizeEquippedCosmetics(equipped)
}
