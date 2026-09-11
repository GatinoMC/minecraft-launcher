import { CurseforgeV1Client } from '@xmcl/curseforge'
import { ModrinthV2Client } from '@xmcl/modrinth'
import { ref } from 'vue'
import { FTBClient } from './ftbClient'

// Extended ModrinthV2Client with additional methods
class ExtendedModrinthV2Client extends ModrinthV2Client {
  async deleteCollection(collectionId: string, signal?: AbortSignal) {
    const response = await fetch(`https://api.modrinth.com/v3/collection/${collectionId}`, {
      method: 'DELETE',
      headers: this.headers,
      signal,
    })
    if (!response.ok) {
      throw new Error(`Failed to delete collection: ${response.status} ${await response.text()}`)
    }
  }
}

export const clientModrinthV2 = new ExtendedModrinthV2Client()
const mineLatinoBackendUrl = (import.meta.env.VITE_MINELATINO_BACKEND_URL || 'https://minelatino-production.up.railway.app').replace(/\/+$/, '')
export const curseforgeApiAvailable = ref(false)
export const clientCurseforgeV1 = new CurseforgeV1Client('', {
  baseUrl: `${mineLatinoBackendUrl}/api/curseforge`,
})
export const clientFTB = new FTBClient()

export async function refreshCurseforgeApiAvailability() {
  try {
    const response = await fetch(`${mineLatinoBackendUrl}/health`, { cache: 'no-store' })
    const body = response.ok ? await response.json() as { ready?: { curseforgeApiKey?: boolean } } : undefined
    curseforgeApiAvailable.value = body?.ready?.curseforgeApiKey === true
  } catch {
    curseforgeApiAvailable.value = false
  }
}

void refreshCurseforgeApiAvailability()
