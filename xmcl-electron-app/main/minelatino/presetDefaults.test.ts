import { describe, expect, it } from 'vitest'
import { getPresetDefaults } from './presetDefaults'

describe('GatinoLauncher preset defaults', () => {
  it.each([
    ['minelatino-1-21-4', 33],
    ['minelatino-1-21-11', 39],
    ['minelatino-26-2', 33],
  ])('ships the curated files for %s', (id, fileCount) => {
    const defaults = getPresetDefaults(id)
    expect(defaults).toBeDefined()
    expect(defaults?.files).toHaveLength(fileCount)
    expect(defaults?.files.every(file => file.path === 'options.txt' || file.path.startsWith('config/'))).toBe(true)
    expect(defaults?.files.some(file => file.path.includes('chunky/tasks/'))).toBe(false)
    expect(defaults?.files.some(file => /keo[ _-]*optimized/i.test(file.content))).toBe(false)
    const gameOptions = defaults?.files.filter(file => file.path.endsWith('options.txt')) ?? []
    expect(gameOptions.length).toBeGreaterThan(0)
    expect(gameOptions.every(file => /^fov:1\.0$/m.test(file.content))).toBe(true)
    expect(gameOptions.every(file => /^guiScale:2$/m.test(file.content))).toBe(true)
    const sodiumExtra = defaults?.files.find(file => file.path === 'config/sodium-extra-options.json')
    expect(sodiumExtra).toBeDefined()
    expect(JSON.parse(sodiumExtra?.content ?? '{}').extra_settings.show_fps).toBe(false)
    const iris = defaults?.files.find(file => file.path === 'config/iris.properties')
    expect(iris?.content).toMatch(/^enableShaders=false$/m)
    expect(defaults?.signature).toMatch(/^[a-f0-9]{64}$/)
  })
})
