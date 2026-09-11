import type { SearchResultHit } from '@xmcl/modrinth'
import { computed, onScopeDispose, reactive, ref, type Ref } from 'vue'
import { clientModrinthV2 } from '@/util/clients'

const PAGE_SIZE = 20
const SEARCH_TIMEOUT = 15_000

/** Template-safe catalog state: nested refs must also be unwrapped. */
export function useMineLatinoProfileSearch(
  projectType: Ref<'mod' | 'resourcepacks' | 'shaders'>,
  gameVersion: Ref<string>,
  loader: Ref<string>,
) {
  const query = ref('')
  const sortBy = ref('downloads')
  const results = ref<SearchResultHit[]>([])
  const loading = ref(false)
  const error = ref(false)
  const hasMore = ref(false)
  const total = ref(0)
  let offset = 0
  let generation = 0
  let cancelPending: (() => void) | undefined

  function cancel() {
    generation++
    cancelPending?.()
    cancelPending = undefined
    loading.value = false
  }

  function reset() {
    cancel()
    results.value = []
    error.value = false
    hasMore.value = false
    total.value = 0
    offset = 0
  }

  async function search(replace = true) {
    if (!replace && (loading.value || !hasMore.value)) return
    cancel()
    const request = generation
    const controller = new AbortController()
    if (replace) {
      results.value = []
      offset = 0
      total.value = 0
      hasMore.value = false
    }
    loading.value = true
    error.value = false
    const type = projectType.value === 'resourcepacks' ? 'resourcepack'
      : projectType.value === 'shaders' ? 'shader' : 'mod'
    const facets = [[`project_type:${type}`]]
    if (gameVersion.value) facets.push([`versions:${gameVersion.value}`])
    // Packs have no Fabric/Forge category; only mods depend on a mod loader.
    if (type === 'mod' && loader.value) facets.push([`categories:${loader.value}`])
    if (type === 'mod') facets.push(['client_side:optional', 'client_side:required'])

    let timer: ReturnType<typeof setTimeout> | undefined
    const interrupted = new Promise<never>((_, reject) => {
      cancelPending = () => {
        controller.abort()
        reject(new Error('Search cancelled'))
      }
      // Race even if a transport ignores AbortSignal, so the UI always settles.
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('Catalog request timed out'))
      }, SEARCH_TIMEOUT)
    })
    try {
      const result = await Promise.race([
        clientModrinthV2.searchProjects({
          query: query.value || '',
          limit: PAGE_SIZE,
          offset,
          index: sortBy.value,
          facets: JSON.stringify(facets),
        }, controller.signal),
        interrupted,
      ])
      if (request !== generation) return
      const hits = result.hits
      if (!Array.isArray(hits)) throw new Error('Invalid catalog response')
      const combined = replace ? hits : [...results.value, ...hits]
      results.value = [...new Map(combined.map(hit => [hit.project_id, hit])).values()]
      total.value = result.total_hits
      offset += hits.length
      hasMore.value = hits.length > 0 && offset < result.total_hits
    } catch {
      if (request === generation) error.value = true
    } finally {
      clearTimeout(timer)
      if (request === generation) {
        loading.value = false
        cancelPending = undefined
      }
    }
  }

  onScopeDispose(cancel)
  return reactive({
    query, sortBy, results, loading, error, hasMore, total,
    resultCount: computed(() => results.value.length),
    search,
    loadMore: () => search(false),
    reset,
    cancel,
  })
}
