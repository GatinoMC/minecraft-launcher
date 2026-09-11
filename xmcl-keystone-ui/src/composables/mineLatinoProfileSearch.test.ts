import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import type { SearchResult, SearchResultHit } from '@xmcl/modrinth'
import { useMineLatinoProfileSearch } from './mineLatinoProfileSearch'

const { searchProjects } = vi.hoisted(() => ({ searchProjects: vi.fn() }))
vi.mock('@/util/clients', () => ({ clientModrinthV2: { searchProjects } }))
let scope: EffectScope
const response = (id: string, total = 1) => ({
  hits: [{ project_id: id, title: id } as SearchResultHit], total_hits: total,
  offset: 0, limit: 20,
}) as SearchResult
function model(type: 'mod' | 'resourcepacks' | 'shaders' = 'mod') {
  return scope.run(() => useMineLatinoProfileSearch(ref(type), ref('1.21.1'), ref('fabric')))!
}
beforeEach(() => { scope = effectScope(); vi.useFakeTimers(); searchProjects.mockReset() })
afterEach(() => { scope.stop(); vi.useRealTimers() })

describe('profile catalog', () => {
  it('exposes real booleans and arrays to the nested template model', async () => {
    searchProjects.mockResolvedValue(response('sodium'))
    const catalog = model()
    expect(catalog.loading).toBe(false)
    expect(catalog.results).toEqual([])
    const pending = catalog.search()
    expect(catalog.loading).toBe(true)
    await pending
    expect(catalog.loading).toBe(false)
    expect(catalog.error).toBe(false)
    expect(catalog.results[0].title).toBe('sodium')
    expect(catalog.resultCount).toBe(1)
  })
  it.each(['resourcepacks', 'shaders'] as const)('does not hide %s behind mod-loader filters', async (type) => {
    searchProjects.mockResolvedValue(response('pack'))
    await model(type).search()
    const facets = JSON.parse(searchProjects.mock.calls[0][0].facets).flat()
    expect(facets).toContain(type === 'shaders' ? 'project_type:shader' : 'project_type:resourcepack')
    expect(facets).toContain('versions:1.21.1')
    expect(facets).not.toContain('categories:fabric')
    expect(facets.some((f: string) => f.startsWith('client_side:'))).toBe(false)
  })
  it('ends a hung search and lets the user retry', async () => {
    searchProjects.mockImplementationOnce(() => new Promise(() => {}))
    const catalog = model()
    const pending = catalog.search()
    await vi.advanceTimersByTimeAsync(15_000)
    await pending
    expect(catalog.loading).toBe(false)
    expect(catalog.error).toBe(true)
    expect(searchProjects.mock.calls[0][1].aborted).toBe(true)
    searchProjects.mockResolvedValue(response('iris'))
    await catalog.search()
    expect(catalog.error).toBe(false)
    expect(catalog.results[0].project_id).toBe('iris')
  })
  it('ignores older results when the user changes the query', async () => {
    let complete!: (value: SearchResult) => void
    searchProjects.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const catalog = model()
    const older = catalog.search()
    catalog.query = 'iris'
    searchProjects.mockResolvedValue(response('iris'))
    await catalog.search()
    complete(response('old'))
    await older
    expect(catalog.results.map(hit => hit.project_id)).toEqual(['iris'])
  })
  it('retains the page and offset after a failed load-more request', async () => {
    searchProjects.mockResolvedValueOnce(response('one', 3)).mockRejectedValueOnce(new Error('offline'))
    const catalog = model()
    await catalog.search()
    await catalog.loadMore()
    expect(catalog.results[0].project_id).toBe('one')
    expect(catalog.error).toBe(true)
    searchProjects.mockResolvedValue(response('two', 3))
    await catalog.loadMore()
    expect(searchProjects.mock.calls[2][0].offset).toBe(1)
    expect(catalog.results.map(hit => hit.project_id)).toEqual(['one', 'two'])
  })
  it('clears and cancels the model when the dialog closes', async () => {
    searchProjects.mockImplementation(() => new Promise(() => {}))
    const catalog = model()
    const pending = catalog.search()
    catalog.reset()
    await pending
    expect(catalog.loading).toBe(false)
    expect(catalog.results).toEqual([])
    expect(catalog.error).toBe(false)
  })
})
