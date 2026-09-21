import { describe, expect, it } from 'vitest'
import {
  managedResourcePackFileName,
  ManagedContentSyncGate,
  normalizeLauncherResourcePackManifest,
  disableManagedDefaultShader,
  updateResourcePackOptions,
} from './managedContent'

describe('managed launcher content', () => {
  it('defers background synchronization until the final Minecraft process exits', () => {
    const gate = new ManagedContentSyncGate()
    expect(gate.deferIfRunning()).toBe(false)

    gate.start(101)
    gate.start(202)
    expect(gate.deferIfRunning()).toBe(true)
    expect(gate.deferred).toBe(true)
    expect(gate.stop(101)).toBe(false)
    expect(gate.stop(202)).toBe(true)
    expect(gate.deferred).toBe(false)
    expect(gate.stop(202)).toBe(false)
  })

  it('accepts only complete resource-pack manifest entries for supported profiles', () => {
    const item = {
      minecraftVersion: '1.21.11' as const, fileName: 'Gatino.zip', downloadUrl: '/download',
      sha1: 'a'.repeat(40), sha256: 'b'.repeat(64), fileSize: 123, revision: 2, uploadedAt: 5,
    }
    expect(normalizeLauncherResourcePackManifest({ schemaVersion: 1, items: [item, { ...item, minecraftVersion: '1.20.1' }] })).toEqual([item])
    expect(managedResourcePackFileName(item)).toBe(`GatinoLauncher-1.21.11-${'a'.repeat(12)}.zip`)
  })

  it('replaces only the previously managed resource pack and preserves player choices', () => {
    const updated = updateResourcePackOptions(
      'resourcePacks:["vanilla","file/User.zip","file/GatinoLauncher-old.zip"]\nguiScale:2',
      'GatinoLauncher-new.zip',
      'GatinoLauncher-old.zip',
    )
    expect(updated).toContain('resourcePacks:["vanilla","file/User.zip","file/GatinoLauncher-new.zip"]')
    expect(updated).toContain('guiScale:2')
  })

  it('disables the shader previously activated by the launcher', () => {
    expect(disableManagedDefaultShader('colorSpace=SRGB\nenableShaders=true\nshaderPack=Old.zip', 'Old.zip'))
      .toBe('colorSpace=SRGB\nenableShaders=false\nshaderPack=')
  })

  it('preserves a shader manually selected by the player', () => {
    const custom = 'colorSpace=SRGB\nenableShaders=true\nshaderPack=Custom.zip'
    expect(disableManagedDefaultShader(custom, 'Old.zip')).toBe(custom)
    expect(disableManagedDefaultShader(custom)).toBe(custom)
  })

  it('does not activate a shader in a fresh profile', () => {
    expect(disableManagedDefaultShader('colorSpace=SRGB\nenableShaders=false\nshaderPack='))
      .toBe('colorSpace=SRGB\nenableShaders=false\nshaderPack=')
  })
})
