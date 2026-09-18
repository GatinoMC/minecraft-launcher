import { HAS_DEV_SERVER } from '@/constant'
import {
  DownloadBaseOptions,
  ProgressTracker,
  download,
  getDownloadBaseOptions,
} from '@xmcl/file-transfer'
import { Tracker, onDownloadSingle } from '@xmcl/installer'
import {
  DownloadUpdateTrackerEvents,
  ElectronUpdateOperation,
  ReleaseInfo,
} from '@xmcl/runtime-api'
import { DownloadUpdateOptions, LauncherAppUpdater } from '@xmcl/runtime/app'
import { AnyError, isSystemError } from '@xmcl/utils'
import { spawn } from 'child_process'
import { shell } from 'electron'
import * as updater from 'electron-updater'
import { AppUpdater, CancellationToken, UpdaterSignal } from 'electron-updater'
import { createReadStream, createWriteStream } from 'fs'
import { readFile, rename as renameAsync, unlink as unlinkAsync, writeFile } from 'fs-extra'
import { existsSync, rename, unlink } from 'original-fs'
import { platform } from 'os'
import { basename, dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'
import { createGunzip } from 'zlib'
import { Logger } from '~/infra'
import { resolveBackendUrl } from '@/minelatino/config'
import { kSettings } from '~/settings'
import { checksum } from '~/util/fs'
import ElectronLauncherApp from '../ElectronLauncherApp'
import { isNewerRelease } from './updateVersion'
import { verifyAsarChecksumSignature } from './updateSignature'

/**
 * The `app-<version>-<platform>[-<arch>].asar` name `build.ts` writes in its
 * `afterPack` hook. The manifest check and the download both derive the name
 * from here so they cannot disagree about which asset this install needs.
 */
function asarAssetName(version: string): string {
  const pl = platform()
  let platformFlag = pl === 'win32' ? 'win' : pl === 'darwin' ? 'mac' : 'linux'
  if (process.arch === 'arm64') {
    platformFlag += '-arm64'
  } else if (process.arch === 'ia32') {
    platformFlag += '-ia32'
  }
  return `app-${version}-${platformFlag}.asar`
}

/**
 * Only download asar file update.
 *
 * If the this update is not a full update but an incremental update,
 * you can call this to download asar update
 *
 * The asset URL is the one the release manifest published. Upstream rebuilt it
 * from a hardcoded `github.com/Voxelum/x-minecraft-launcher` release path,
 * which in this fork would copy a stock XMCL `app.asar` over MineLatino's and
 * silently un-brand the launcher on the next self-update. The npmmirror
 * fallback it also had (`@xmcl/app-<platform>` tarballs) is gone for the same
 * reason: it only ever serves upstream builds.
 */
async function downloadAsarUpdate(
  app: ElectronLauncherApp,
  destination: string,
  updateInfo: ReleaseInfo,
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  const version = updateInfo.name.startsWith('v') ? updateInfo.name.substring(1) : updateInfo.name
  const file = asarAssetName(version)
  const publishedUrl = updateInfo.files.find((f) => f.name === file)?.url
  if (!publishedUrl) {
    throw new AnyError(
      'UpdateAsarError',
      `The release ${updateInfo.name} does not publish ${file}`,
      {},
      { published: updateInfo.files.map((f) => f.name).join(', ') },
    )
  }
  const url = trustedUpdateUrl(publishedUrl)

  const sha256Url = url + '.sha256'
  const sha256Response = await app.fetch(sha256Url, { signal: options?.abortSignal })
  if (!sha256Response.ok) {
    throw new AnyError(
      'UpdateAsarError',
      `The release ${updateInfo.name} does not publish a readable SHA-256 checksum`,
      {},
      { url: sha256Url, status: sha256Response.status },
    )
  }
  const expectedSha256 = (await sha256Response.text()).trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new AnyError(
      'UpdateAsarError',
      `The release ${updateInfo.name} publishes an invalid SHA-256 checksum`,
      {},
      { url: sha256Url },
    )
  }

  const signatureUrl = `${sha256Url}.sig`
  const signatureResponse = await app.fetch(signatureUrl, { signal: options?.abortSignal })
  const checksumSignature = signatureResponse.ok ? (await signatureResponse.text()).trim() : ''
  if (!signatureResponse.ok || !verifyAsarChecksumSignature(expectedSha256, checksumSignature)) {
    throw new AnyError(
      'UpdateAsarError',
      `The release ${updateInfo.name} does not publish a valid MineLatino ASAR signature`,
      {},
      { url: signatureUrl, status: signatureResponse.status },
    )
  }

  // Skip the download entirely if the pending file already matches the
  // published checksum.
  // @xmcl/core returns undefined (rather than rejecting) when the destination
  // does not exist. A first update therefore used to call toLowerCase() on
  // undefined before downloading a single byte.
  const pendingSha256 = (await checksum(destination, 'sha256').catch(() => undefined)) ?? ''
  if (pendingSha256.toLowerCase() === expectedSha256) {
    await writeFile(destination + '.sha256', expectedSha256, 'utf8')
    await writeFile(destination + '.sha256.sig', checksumSignature, 'utf8')
    return
  }

  // Prefers the gzipped sibling when the release publishes one.
  try {
    await downloadGzAsar(app, url, destination, options)
    const downloadedSha256 = (await checksum(destination, 'sha256').catch(() => undefined)) ?? ''
    if (downloadedSha256.toLowerCase() !== expectedSha256) {
      await unlinkAsync(destination).catch(() => {})
      throw new AnyError(
        'UpdateAsarError',
        `The downloaded ASAR for ${updateInfo.name} failed SHA-256 verification`,
        {},
        { expected: expectedSha256, actual: downloadedSha256 || 'unreadable' },
      )
    }
    await writeFile(destination + '.sha256', expectedSha256, 'utf8')
    await writeFile(destination + '.sha256.sig', checksumSignature, 'utf8')
  } catch (e) {
    throw Object.assign(e as Error, { name: 'UpdateAsarError', url })
  }
}

/**
 * Download a raw asar (or its `.gz` sibling when present) and write it to
 * `destination`. Used for the release-asset path.
 */
async function downloadGzAsar(
  app: ElectronLauncherApp,
  url: string,
  destination: string,
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  const gzUrl = url + '.gz'
  const gzResponse = await app
    .fetch(gzUrl, { method: 'HEAD', signal: options?.abortSignal })
    .catch(() => null)
  const downloadUrl = gzResponse?.ok ? gzUrl : url

  const tempFile = destination + '.tmp'
  await download({
    url: downloadUrl,
    destination: tempFile,
    tracker: onDownloadSingle(options?.tracker, 'download-update.asar', { url: downloadUrl }),
    signal: options?.abortSignal,
    ...getDownloadBaseOptions(options),
  })

  if (downloadUrl === gzUrl) {
    await pipeline(createReadStream(tempFile), createGunzip(), createWriteStream(destination))
    await unlinkAsync(tempFile)
  } else {
    await renameAsync(tempFile, destination)
  }
}

/**
 * Nothing can be installed in place for this release, so hand the player the
 * download instead. Upstream opened `xmcl.app`; the fork opens the installer the
 * manifest published, and falls back to the MineLatino backend.
 */
async function hintUserDownload(updateInfo: ReleaseInfo): Promise<void> {
  const installer = updateInfo.files.find((f) =>
    /\.(exe|msi|dmg|zip|AppImage|deb|rpm|tar\.xz)$/i.test(f.name),
  )
  const url = trustedUpdateUrl(installer?.url || resolveBackendUrl())
  if (!url) return
  await shell.openExternal(url)
}

function trustedUpdateUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('Update URL must use HTTPS')
  const backend = new URL(resolveBackendUrl())
  const ownGithubRelease =
    url.hostname === 'github.com' &&
    url.pathname.startsWith('/GatinoMC/minecraft-launcher/releases/download/')
  if (!ownGithubRelease && url.origin !== backend.origin) {
    throw new Error(`Untrusted update origin: ${url.origin}`)
  }
  return url.toString()
}

const WINDOWS_PENDING_INSTALLER = 'pending_launcher_update.exe'

async function readSignedChecksum(
  app: ElectronLauncherApp,
  url: string,
  signal?: AbortSignal,
): Promise<{ checksum: string; signature: string }> {
  const checksumUrl = `${url}.sha256`
  const checksumResponse = await app.fetch(checksumUrl, { signal })
  if (!checksumResponse.ok) {
    throw new AnyError(
      'UpdateError',
      'La actualización no publica un checksum SHA-256 legible.',
      {},
      { url: checksumUrl, status: checksumResponse.status },
    )
  }
  const checksumValue = (await checksumResponse.text()).trim().toLowerCase()
  const signatureUrl = `${checksumUrl}.sig`
  const signatureResponse = await app.fetch(signatureUrl, { signal })
  const signature = signatureResponse.ok ? (await signatureResponse.text()).trim() : ''
  if (
    !/^[a-f0-9]{64}$/.test(checksumValue) ||
    !signatureResponse.ok ||
    !verifyAsarChecksumSignature(checksumValue, signature)
  ) {
    throw new AnyError(
      'UpdateError',
      'La actualización no tiene una firma válida de GatinoLauncher.',
      {},
      { checksumUrl, signatureUrl, signatureStatus: signatureResponse.status },
    )
  }
  return { checksum: checksumValue, signature }
}

function windowsInstallerName(version: string): string {
  return `minelatino-${version.replace(/^v/, '')}-win32-x64.exe`
}

async function downloadWindowsInstallerUpdate(
  app: ElectronLauncherApp,
  destination: string,
  updateInfo: ReleaseInfo,
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  const name = windowsInstallerName(updateInfo.name)
  const publishedUrl = updateInfo.files.find((file) => file.name === name)?.url
  if (!publishedUrl) {
    throw new AnyError('UpdateError', `La versión ${updateInfo.name} no publica ${name}.`)
  }
  const url = trustedUpdateUrl(publishedUrl)
  const signed = await readSignedChecksum(app, url, options?.abortSignal)
  const existing = ((await checksum(destination, 'sha256').catch(() => undefined)) ?? '').toLowerCase()
  if (existing === signed.checksum) {
    await writeFile(destination + '.sha256', signed.checksum, 'utf8')
    await writeFile(destination + '.sha256.sig', signed.signature, 'utf8')
    return
  }

  const temporary = destination + '.tmp'
  await unlinkAsync(temporary).catch(() => {})
  await download({
    url,
    destination: temporary,
    tracker: onDownloadSingle(options?.tracker, 'download-update.full', { url }),
    signal: options?.abortSignal,
    ...getDownloadBaseOptions(options),
  })
  const actual = ((await checksum(temporary, 'sha256').catch(() => undefined)) ?? '').toLowerCase()
  if (actual !== signed.checksum) {
    await unlinkAsync(temporary).catch(() => {})
    throw new AnyError(
      'UpdateError',
      'El instalador descargado está dañado o fue modificado.',
      {},
      { expected: signed.checksum, actual: actual || 'unreadable' },
    )
  }
  await unlinkAsync(destination).catch(() => {})
  await renameAsync(temporary, destination)
  await writeFile(destination + '.sha256', signed.checksum, 'utf8')
  await writeFile(destination + '.sha256.sig', signed.signature, 'utf8')
}

async function verifyPendingWindowsInstaller(installerPath: string): Promise<void> {
  const expected = (await readFile(installerPath + '.sha256', 'utf8').catch(() => ''))
    .trim()
    .toLowerCase()
  const signature = (await readFile(installerPath + '.sha256.sig', 'utf8').catch(() => '')).trim()
  if (!/^[a-f0-9]{64}$/.test(expected) || !verifyAsarChecksumSignature(expected, signature)) {
    throw new Error('El instalador pendiente no tiene una firma válida de GatinoLauncher.')
  }
  const actual = ((await checksum(installerPath, 'sha256').catch(() => undefined)) ?? '').toLowerCase()
  if (actual !== expected) {
    throw new Error('El instalador pendiente está dañado o fue modificado.')
  }
}
/**
 * Download the full update. This size can be larger as it carry the whole electron thing...
 */
async function downloadFullUpdate(
  app: ElectronLauncherApp,
  appUpdater: AppUpdater,
  options?: {
    tracker?: Tracker<DownloadUpdateTrackerEvents>
    abortSignal?: AbortSignal
  },
): Promise<void> {
  const tracker: ProgressTracker = {
    progress: 0,
    total: 0,
    url: '',
  }
  options?.tracker?.({
    phase: 'download-update.full',
    payload: { progress: tracker },
  })

  const signal = new UpdaterSignal(appUpdater)
  signal.progress((info) => {
    tracker.progress = info.transferred
    tracker.total = info.total
    // tracker.speed = info.bytesPerSecond
  })

  const cancellationToken = new CancellationToken()
  options?.abortSignal?.addEventListener('abort', () => {
    cancellationToken.cancel()
  })
  await appUpdater.downloadUpdate(cancellationToken)
}

export class ElectronUpdater implements LauncherAppUpdater {
  private logger: Logger
  private windowsInstallerStarted = false

  constructor(private app: ElectronLauncherApp) {
    this.logger = app.getLogger('ElectronUpdater')

    // The official NSIS installer owns file replacement. Starting it from the
    // normal quit path avoids modifying a loaded app.asar and avoids hidden
    // PowerShell/batch helpers that antivirus heuristics reasonably distrust.
    if (app.platform.os === 'windows' && !HAS_DEV_SERVER) {
      app.registryDisposer(async () => {
        const pending = join(app.appDataPath, WINDOWS_PENDING_INSTALLER)
        if (!existsSync(pending) ||
          !existsSync(pending + '.sha256') ||
          !existsSync(pending + '.sha256.sig')) return
        try {
          await this.startPendingWindowsInstaller()
        } catch (error) {
          this.logger.error(error as Error)
        }
      })
    }
  }

  /**
   * Reads the MineLatino update manifest: `GET /api/release` on the backend,
   * which answers in the GitHub-release shape this method already parsed
   * (`tag_name`, `body`, `published_at`, `assets[].browser_download_url`) while
   * the binaries stay on the project's own GitHub releases.
   *
   * Upstream queried `api.xmcl.app` here with an azurewebsites fallback. Both
   * serve stock XMCL builds, so a fork that kept them would offer — and then
   * install — an `app.asar` that is not MineLatino. When no backend is
   * configured the check reports "up to date" instead of reaching for any
   * upstream host, which also keeps a mis-packaged build from erroring on every
   * launch.
   */
  async #getUpdateFromSelfHost(): Promise<ReleaseInfo> {
    const app = this.app
    const backend = resolveBackendUrl()
    if (!backend) {
      this.logger.warn('MineLatino backend is not configured, skip the launcher update check')
      return {
        name: `v${app.version}`,
        body: '',
        date: new Date().toISOString(),
        files: [],
        newUpdate: false,
        operation: ElectronUpdateOperation.Manual,
      }
    }

    const { allowPrerelease, locale } = await app.registry.get(kSettings)
    const queryString = `version=v${app.version}&prerelease=${allowPrerelease || false}`
    this.logger.log(`Try get update from ${backend}/api/release`)
    const response = await app.fetch(`${backend}/api/release?${queryString}`, {
      headers: {
        'Accept-Language': locale,
      },
    })
    if (!response.ok) {
      throw new AnyError(
        'UpdateError',
        `Fail to get the update manifest from ${backend}/api/release: ${await response.text()}`,
        {},
        { status: response.status },
      )
    }
    const result = (await response.json()) as any
    const files = ((result.assets ?? []) as any[]).map((a) => ({
      url: a.browser_download_url,
      name: a.name,
    })) as Array<{ url: string; name: string }>
    const version = String(result.tag_name ?? '').replace(/^v/, '')
    const updateInfo: ReleaseInfo = {
      name: result.tag_name,
      body: result.body ?? '',
      date: result.published_at ?? '',
      files,
      newUpdate: isNewerRelease(app.version, result.tag_name),
      operation: ElectronUpdateOperation.Manual,
    }

    // Windows uses the standard NSIS installer, signed with the same offline
    // Ed25519 release key as ASAR updates. Other supported installations keep
    // the smaller ASAR path where replacing the archive is safe.
    const hasAsar = files.some((f) => f.name === asarAssetName(version))
    const installer = windowsInstallerName(version)
    const hasSignedWindowsInstaller = [installer, `${installer}.sha256`, `${installer}.sha256.sig`]
      .every((name) => files.some((file) => file.name === name))
    if (this.app.platform.os === 'windows') {
      updateInfo.operation = hasSignedWindowsInstaller
        ? ElectronUpdateOperation.AutoUpdater
        : ElectronUpdateOperation.Manual
    } else if (this.app.platform.os === 'linux' && this.app.env === 'appimage') {
      // An AppImage is one self-contained file; replacing the app.asar inside a
      // running copy is not how it is updated.
      updateInfo.operation = ElectronUpdateOperation.Manual
    } else {
      updateInfo.operation = hasAsar ? ElectronUpdateOperation.Asar : ElectronUpdateOperation.Manual
    }

    this.logger.log(`Got operation=${updateInfo.operation} update from ${backend}/api/release`)

    return updateInfo
  }

  async #getUpdateFromAutoUpdater(): Promise<ReleaseInfo> {
    const autoUpdater = updater.autoUpdater

    this.logger.log(`Check update via ${autoUpdater.getFeedURL()}`)
    const info = await autoUpdater.checkForUpdates()
    if (!info) throw new Error('No update info found')

    const files = info.updateInfo.files.map((f) => ({ name: basename(f.url), url: f.url }))
    const release: ReleaseInfo = {
      name: info.updateInfo.version,
      body: info.updateInfo.releaseNotes as string,
      date: info.updateInfo.releaseDate,
      files,
      newUpdate: isNewerRelease(this.app.version, info.updateInfo.version),
      operation: ElectronUpdateOperation.AutoUpdater,
    }

    return release
  }

  private async quitAndInstallAsar() {
    const appAsarPath = join(dirname(__dirname), 'app.asar')
    const updateAsarPath = join(this.app.appDataPath, 'pending_update')

    this.logger.log(`Install asar on ${this.app.platform.os} ${appAsarPath}`)
    if (this.app.platform.os === 'windows') {
      throw new Error('Windows updates must use the signed NSIS installer.')
    }
    await promisify(rename)(appAsarPath, appAsarPath + '.bk').catch(() => {})
    try {
      try {
        await promisify(rename)(updateAsarPath, appAsarPath)
      } catch (e) {
        if (isSystemError(e) && e.code === 'EXDEV') {
          await writeFile(appAsarPath, await readFile(updateAsarPath))
          await unlinkAsync(updateAsarPath).catch(() => {})
        } else {
          throw e
        }
      }
      await promisify(unlink)(appAsarPath + '.bk').catch(() => {})
      this.app.relaunch()
    } catch (e) {
      this.logger.error(
        new AnyError('UpdateError', `Fail to rename update the file: ${appAsarPath}`, {
          cause: e,
        }),
      )
      await promisify(rename)(appAsarPath + '.bk', appAsarPath)
    }
  }

  private async startPendingWindowsInstaller(): Promise<void> {
    if (this.windowsInstallerStarted) return
    const installerPath = join(this.app.appDataPath, WINDOWS_PENDING_INSTALLER)
    await verifyPendingWindowsInstaller(installerPath)
    this.logger.log(`Start verified NSIS update installer: ${installerPath}`)
    const child = spawn(installerPath, ['--updated', '/S'], {
      cwd: this.app.appDataPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
    child.unref()
    this.windowsInstallerStarted = true
  }

  async checkUpdateTask(): Promise<ReleaseInfo> {
    let result: ReleaseInfo
    if (this.app.platform.os === 'windows' || this.app.platform.os === 'osx') {
      result = await this.#getUpdateFromSelfHost()
    } else {
      try {
        result = await this.#getUpdateFromAutoUpdater()
      } catch (e) {
        if (isSystemError(e) && e.code === 'ENOENT') {
          result = await this.#getUpdateFromSelfHost()
        } else {
          this.logger.warn(e as Error)
          throw e
        }
      }
    }
    if (!result.newUpdate) {
      const pending = join(this.app.appDataPath, 'pending_update')
      const pendingInstaller = join(this.app.appDataPath, WINDOWS_PENDING_INSTALLER)
      await Promise.all([
        unlinkAsync(pending).catch(() => {}),
        unlinkAsync(pending + '.sha256').catch(() => {}),
        unlinkAsync(pending + '.sha256.sig').catch(() => {}),
        unlinkAsync(pending + '.tmp').catch(() => {}),
        unlinkAsync(pendingInstaller).catch(() => {}),
        unlinkAsync(pendingInstaller + '.sha256').catch(() => {}),
        unlinkAsync(pendingInstaller + '.sha256.sig').catch(() => {}),
        unlinkAsync(pendingInstaller + '.tmp').catch(() => {}),
      ])
    }
    return result
  }

  async downloadUpdate(updateInfo: ReleaseInfo, options?: DownloadUpdateOptions): Promise<void> {
    const tracker = options?.tracker
    const abortSignal = options?.abortSignal

    if (updateInfo.operation === ElectronUpdateOperation.AutoUpdater) {
      if (this.app.platform.os === 'windows') {
        await downloadWindowsInstallerUpdate(
          this.app,
          join(this.app.appDataPath, WINDOWS_PENDING_INSTALLER),
          updateInfo,
          { tracker, abortSignal },
        )
      } else {
        await downloadFullUpdate(this.app, updater.autoUpdater, {
          tracker,
          abortSignal,
        })
      }
    } else if (updateInfo.operation === ElectronUpdateOperation.Asar) {
      const updatePath = join(this.app.appDataPath, 'pending_update')
      await downloadAsarUpdate(this.app, updatePath, updateInfo, {
        tracker,
        abortSignal,
      })
    } else {
      // Includes `Appx`: the fork builds no appx target, so if one ever arrives
      // from a manifest the player is pointed at the download instead.
      tracker?.({
        phase: 'download-update.manual',
        payload: {},
      })
      await hintUserDownload(updateInfo)
    }
  }

  async installUpdateAndQuit(updateInfo: ReleaseInfo): Promise<void> {
    if (HAS_DEV_SERVER) {
      throw new Error(
        'Las actualizaciones se instalan desde el launcher instalado. No se puede reiniciar y actualizar una sesión de desarrollo.',
      )
    }
    if (updateInfo.operation === ElectronUpdateOperation.Asar) {
      await this.quitAndInstallAsar()
    } else if (updateInfo.operation === ElectronUpdateOperation.AutoUpdater) {
      if (this.app.platform.os === 'windows') {
        await this.startPendingWindowsInstaller()
        await this.app.quit()
      } else {
        updater.autoUpdater.quitAndInstall()
      }
    } else {
      throw new Error('Esta actualización requiere descargar el instalador y no puede aplicarse al reiniciar.')
    }
  }
}
