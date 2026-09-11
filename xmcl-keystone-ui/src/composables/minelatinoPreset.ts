import { withRendererAction } from '@/rendererAction'
import { clientModrinthV2 } from '@/util/clients'
import { injection } from '@/util/inject'
import { generateDistinctName } from '@/util/instanceName'
import type { InstanceFile, PartialRuntimeVersions } from '@xmcl/instance'
import type { ProjectVersion } from '@xmcl/modrinth'
import type {
  MineLatinoLoader,
  MineLatinoPreset,
  MineLatinoPresetMod,
  VersionMetadataService,
} from '@xmcl/runtime-api'
import {
  InstanceInstallServiceKey,
  InstanceServiceKey,
  MineLatinoServiceKey,
  VersionMetadataServiceKey,
} from '@xmcl/runtime-api'
import { InjectionKey, Ref, computed, shallowRef } from 'vue'
import { kInstances } from './instances'
import { getLatestNeoforge } from './neoForgeVersion'
import { useNotifier } from './notifier'
import { useService } from './service'

/**
 * Phase 4 — "Crear perfil MineLatino".
 *
 * Everything reuses XMCL's own instance system: the preset only describes
 * *what* to build (loader, Minecraft version, starter mods) and this file
 * translates it into `createInstance` + `installInstanceFiles`. No new
 * downloader, no new on-disk format, and the resulting profile is an ordinary
 * instance the player can edit, update or export like any other.
 */

/** Carries the loader that could not be found so the caller can localize it. */
class LoaderUnavailable extends Error {
  constructor(readonly loader: MineLatinoLoader, readonly minecraft: string) {
    super(`No ${loader} version is available for Minecraft ${minecraft}`)
  }
}

type ModdedLoader = Exclude<MineLatinoLoader, 'vanilla'>

function setLoader(
  runtime: PartialRuntimeVersions,
  loader: ModdedLoader,
  version: string,
) {
  if (loader === 'fabric') runtime.fabricLoader = version
  else if (loader === 'quilt') runtime.quiltLoader = version
  else if (loader === 'forge') runtime.forge = version
  else runtime.neoForged = version
}

/**
 * Resolve the `runtime` block a preset describes.
 *
 * An explicit `loaderVersion` is trusted as-is and skips the metadata lookup
 * entirely, so an operator can freeze a profile to the exact loader the server
 * was tested against — and so a preset still builds when the loader lists are
 * stale or unreachable. Otherwise the newest loader supporting the Minecraft
 * version is used, which is what `useInstanceModLoaderDefault` picks in the
 * manual flow.
 *
 * `optifine` and `labyMod` are deliberately unreachable from a preset: both are
 * version-fragile, and pinning them from a JSON config mostly yields profiles
 * that fail to resolve on first launch.
 */
async function resolveRuntime(
  metadata: VersionMetadataService,
  preset: MineLatinoPreset,
): Promise<PartialRuntimeVersions> {
  const { loader, minecraftVersion, loaderVersion } = preset
  const runtime: PartialRuntimeVersions = { minecraft: minecraftVersion }
  if (loader === 'vanilla') return runtime
  if (loaderVersion) {
    setLoader(runtime, loader, loaderVersion)
    return runtime
  }

  if (loader === 'fabric' || loader === 'quilt') {
    const { gameVersions, loaderVersions } = loader === 'fabric'
      ? await metadata.getFabricVersions()
      : await metadata.getQuiltVersions()
    if (!gameVersions.includes(minecraftVersion)) {
      throw new LoaderUnavailable(loader, minecraftVersion)
    }
    const version = loaderVersions[0]?.version
    if (!version) throw new LoaderUnavailable(loader, minecraftVersion)
    setLoader(runtime, loader, version)
    return runtime
  }

  if (loader === 'forge') {
    const versions = await metadata.getForgeVersions(minecraftVersion)
    const version = versions.find(v => v.type === 'recommended')?.version ?? versions[0]?.version
    if (!version) throw new LoaderUnavailable(loader, minecraftVersion)
    setLoader(runtime, loader, version)
    return runtime
  }

  const version = getLatestNeoforge(await metadata.getNeoForgedVersions(minecraftVersion))
  if (!version) throw new LoaderUnavailable(loader, minecraftVersion)
  setLoader(runtime, loader, version)
  return runtime
}

/**
 * Pick the Modrinth version to install.
 *
 * Modrinth returns versions newest-first, so preferring a *featured release*
 * over the first entry matters here: the newest one is regularly an alpha, and
 * this profile is about to be used on a live server.
 */
function pickVersion(versions: ProjectVersion[], pinned?: string) {
  if (pinned) return versions.find(v => v.id === pinned || v.version_number === pinned)
  return versions.find(v => v.featured && v.version_type === 'release') ?? versions[0]
}

/**
 * Turn one preset mod into the `InstanceFile` that `installInstanceFiles`
 * expects.
 *
 * The Modrinth lookup is unavoidable rather than an optimization: `hashes` is a
 * required field of the `InstanceFile` schema, so the file has to be resolved
 * before it can be handed over. The same lookup normalizes the project
 * reference — a preset normally names a mod by slug (`sodium`), while
 * `@xmcl/resource` only accepts the canonical 8-character project id when it
 * validates a persisted source.
 */
async function resolveModFile(
  mod: MineLatinoPresetMod,
  loader: MineLatinoLoader,
  minecraft: string,
): Promise<InstanceFile | undefined> {
  const loaders = loader === 'vanilla' ? undefined : [loader]
  let versions = await clientModrinthV2.getProjectVersions(mod.projectId, {
    loaders,
    gameVersions: [minecraft],
  })
  if (versions.length === 0 && loaders) {
    // Projects do not always tag every loader they support (a Fabric mod also
    // published for Quilt, say). The Minecraft version is the constraint that
    // genuinely breaks a profile, so only the loader filter is relaxed.
    versions = await clientModrinthV2.getProjectVersions(mod.projectId, {
      gameVersions: [minecraft],
    })
  }
  const version = pickVersion(versions, mod.version)
  if (!version) return undefined
  const file = version.files.find(f => f.primary) ?? version.files[0]
  if (!file) return undefined
  return {
    path: `mods/${file.filename}`,
    hashes: file.hashes,
    downloads: [file.url],
    size: file.size,
    modrinth: { projectId: version.project_id, versionId: version.id },
  }
}

/**
 * Resolve every starter mod.
 *
 * A mod that cannot be resolved (deleted project, rate limit, no build for this
 * version) is reported through `skipped` instead of aborting the profile: the
 * instance is still perfectly playable, just short one mod, and the player can
 * add it later from the instance page.
 */
async function resolvePresetFiles(preset: MineLatinoPreset) {
  const results = await Promise.all(preset.mods.map(async (mod) => {
    try {
      return { mod, file: await resolveModFile(mod, preset.loader, preset.minecraftVersion) }
    } catch (e) {
      console.warn(`[minelatino] failed to resolve preset mod ${mod.projectId}`, e)
      return { mod, file: undefined }
    }
  }))
  return {
    files: results.flatMap(r => (r.file ? [r.file] : [])),
    skipped: results.filter(r => !r.file).map(r => r.mod.projectId),
  }
}

export interface MineLatinoPresetItem {
  preset: MineLatinoPreset
  /** Path of the instance built from this preset, or `''` when there is none. */
  path: string
}

export interface MineLatinoPresetControl {
  items: Ref<MineLatinoPresetItem[]>
  /** Id of the preset being created, or `''` when idle. */
  creating: Ref<string>
  /** Localized failure message from the last attempt. */
  error: Ref<string>
  /** Modrinth references the last attempt could not resolve. */
  skipped: Ref<string[]>
  create: (preset: MineLatinoPreset) => Promise<void>
  select: (preset: MineLatinoPreset) => void
}

export const kMineLatinoPreset: InjectionKey<MineLatinoPresetControl> = Symbol('kMineLatinoPreset')

export function useMineLatinoPreset(
  presets: Ref<MineLatinoPreset[]>,
): MineLatinoPresetControl {
  const { t } = useI18n()
  const { notify } = useNotifier()
  const { instances, selectedInstance } = injection(kInstances)
  const { createInstance } = useService(InstanceServiceKey)
  const { installInstanceFiles } = useService(InstanceInstallServiceKey)
  const { syncAutoMods } = useService(MineLatinoServiceKey)
  const metadata = useService(VersionMetadataServiceKey)

  const creating = shallowRef('')
  const error = shallowRef('')
  const skipped = shallowRef<string[]>([])

  /**
   * Matches on the instance name rather than on a remembered path so the answer
   * survives a data-root move, a cleared renderer cache and a folder rename.
   * The `-N` suffix is what `generateDistinctName` would append on a second
   * creation, which is exactly the duplicate this guard prevents.
   *
   * It errs towards "already created": the worst case is a hand-made instance
   * named `MineLatino-mods` hiding the button, and the ordinary Add Instance
   * dialog is still there.
   */
  function findInstance(preset: MineLatinoPreset) {
    const base = preset.name
    return instances.value.find(i => i.name === base || i.name.startsWith(`${base}-`))
  }

  const items = computed<MineLatinoPresetItem[]>(() => presets.value.map(preset => ({
    preset,
    path: findInstance(preset)?.path ?? '',
  })))

  function select(preset: MineLatinoPreset) {
    const path = findInstance(preset)?.path
    if (path) selectedInstance.value = path
  }

  async function create(preset: MineLatinoPreset) {
    if (creating.value) return
    creating.value = preset.id
    error.value = ''
    skipped.value = []
    try {
      // Both lookups happen before anything is written, so a preset that cannot
      // be built (no loader for that Minecraft version) leaves no half-created
      // instance behind.
      const runtime = await resolveRuntime(metadata, preset)
      const resolved = await resolvePresetFiles(preset)
      skipped.value = resolved.skipped

      const name = generateDistinctName(preset.name, instances.value.map(i => i.name))
      const path = await withRendererAction(
        'user_action.instance.create',
        async (action) => {
          const newPath = await action.run(() => createInstance({
            name,
            description: preset.description ?? '',
            runtime,
            // Shaders are the point of the Sodium + Iris starter set, and XMCL
            // only creates these folders when the instance asks for them.
            resourcepacks: true,
            shaderpacks: true,
          }))
          if (resolved.files.length > 0) {
            try {
              await action.run(() =>
                installInstanceFiles({ path: newPath, oldFiles: [], files: resolved.files }),
              )
            } catch (e) {
              action.fail(e)
              // The instance already exists at this point, so it is still worth
              // selecting: the player can retry the mods from the instance page
              // instead of building the whole profile again.
              selectedInstance.value = newPath
              throw e
            }
          }
          return newPath
        },
        { 'instance.edition': 'java', 'minelatino.preset': preset.id },
      )
      selectedInstance.value = path
      // Install autoMods into the new instance immediately so the player does
      // not have to wait for the next config refresh cycle.
      void syncAutoMods()
      // Only the success is toasted: the player may well have navigated away
      // during the download. Failures and unresolved mods stay in `error` /
      // `skipped` for the preset panel to render, so the message is not shown
      // twice.
      notify({ level: 'success', title: t('MineLatinoPreset.created', { name }) })
    } catch (e) {
      error.value = e instanceof LoaderUnavailable
        ? t('MineLatinoPreset.loaderUnavailable', { loader: e.loader, minecraft: e.minecraft })
        : String((e as Error)?.message ?? e)
    } finally {
      creating.value = ''
    }
  }

  return { items, creating, error, skipped, create, select }
}
