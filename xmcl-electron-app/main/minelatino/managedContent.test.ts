import { describe, expect, it } from 'vitest'
import {
  managedResourcePackFileName,
  normalizeLauncherResourcePackManifest,
  updateIrisProperties,
  updateResourcePackOptions,
} from './managedContent'

describe('managed launcher content', () => {
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

  it('enables the selected default shader without discarding Iris settings', () => {
    expect(updateIrisProperties('colorSpace=SRGB\nenableShaders=false\nshaderPack=Old.zip', 'New.zip'))
      .toBe('colorSpace=SRGB\nenableShaders=true\nshaderPack=New.zip')
  })
})
