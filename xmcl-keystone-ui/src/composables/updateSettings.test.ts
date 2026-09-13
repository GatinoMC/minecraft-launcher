import { computed, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { injection } from '@/util/inject'
import { kSettingsState, useUpdateSettings } from './setting'

const service = vi.hoisted(() => ({ checkUpdate: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn() }))
vi.mock('@/composables', () => ({ useService: () => service }))
vi.mock('@/util/inject', () => ({ injection: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  vi.mocked(injection).mockImplementation((key: unknown) => key === kSettingsState
    ? { state: ref({ updateStatus: 'ready', updateInfo: { name: 'v1.2.3' } }) }
    : ref({ version: '1.2.2' }))
})
afterEach(() => vi.unstubAllGlobals())

describe('launcher update actions', () => {
  it.each(['quitAndInstall', 'downloadUpdate', 'checkUpdate'] as const)('exposes %s failures and allows a successful retry', async (action) => {
    service[action].mockRejectedValueOnce(new Error('No se pudo iniciar la actualización'))
    const settings = useUpdateSettings()
    await expect(settings[action]()).resolves.toBeUndefined()
    expect(settings.updateError.value).toBe('No se pudo iniciar la actualización')
    expect(settings.installing.value || settings.downloadingUpdate.value || settings.checkingUpdate.value).toBe(false)
    await settings[action]()
    expect(settings.updateError.value).toBe('')
  })
  it('does not start a second installer while the first click is still running', async () => {
    let finish!: () => void
    service.quitAndInstall.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    const settings = useUpdateSettings()
    const first = settings.quitAndInstall()
    expect(settings.installing.value).toBe(true)
    await settings.quitAndInstall()
    expect(service.quitAndInstall).toHaveBeenCalledTimes(1)
    finish()
    await first
    expect(settings.installing.value).toBe(false)
  })
})
