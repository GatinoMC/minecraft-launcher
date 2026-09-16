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
    expect(defaults?.signature).toMatch(/^[a-f0-9]{64}$/)
  })
})
