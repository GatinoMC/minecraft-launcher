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
import { closeSync, existsSync, open, rename, unlink } from 'original-fs'
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
  const publishedUrl = updateInfo.files.find(f => f.name === file)?.url
  if (!publishedUrl) {
    throw new AnyError(
      'UpdateAsarError',
      `The release ${updateInfo.name} does not publish ${file}`,
      {},
      { published: updateInfo.files.map(f => f.name).join(', ') },
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

  // Skip the download entirely if the pending file already matches the
  // published checksum.
  // @xmcl/core returns undefined (rather than rejecting) when the destination
  // does not exist. A first update therefore used to call toLowerCase() on
  // undefined before downloading a single byte.
  const pendingSha256 = (await checksum(destination, 'sha256').catch(() => undefined)) ?? ''
  if (pendingSha256.toLowerCase() === expectedSha256) {
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
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
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
  const installer = updateInfo.files.find(f => /\.(exe|msi|dmg|zip|AppImage|deb|rpm|tar\.xz)$/i.test(f.name))
  const url = trustedUpdateUrl(installer?.url || resolveBackendUrl())
  if (!url) return
  await shell.openExternal(url)
}

function trustedUpdateUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('Update URL must use HTTPS')
  const backend = new URL(resolveBackendUrl())
  const ownGithubRelease = url.hostname === 'github.com'
    && url.pathname.startsWith('/FredyGraces20/MineLatino-Launcher/releases/download/')
  if (!ownGithubRelease && url.origin !== backend.origin) {
    throw new Error(`Untrusted update origin: ${url.origin}`)
  }
  return url.toString()
}

const WINDOWS_UPDATE_HELPER = String.raw`
'use strict'
const { existsSync } = require('fs')
const { readFile, rename, unlink } = require('fs/promises')
const { spawn } = require('child_process')

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds))

async function waitForParent(pid) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      process.kill(pid, 0)
      await sleep(250)
    } catch {
      return
    }
  }
}

async function restoreBackup(appAsarPath, backupAsarPath) {
  if (!existsSync(appAsarPath) && existsSync(backupAsarPath)) {
    await rename(backupAsarPath, appAsarPath).catch(() => {})
  }
}

async function replaceAsar(config) {
  const backupAsarPath = config.appAsarPath + '.bk'
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await restoreBackup(config.appAsarPath, backupAsarPath)
    await unlink(backupAsarPath).catch(() => {})
    try {
      await rename(config.appAsarPath, backupAsarPath)
      await rename(config.updateAsarPath, config.appAsarPath)
      await unlink(backupAsarPath).catch(() => {})
      return true
    } catch {
      await restoreBackup(config.appAsarPath, backupAsarPath)
      await sleep(250)
    }
  }
  return false
}

async function main() {
  const configPath = process.argv[2]
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  await waitForParent(config.parentPid)
  await replaceAsar(config)

  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(config.executable, config.arguments, {
    cwd: config.cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: environment,
  })
  child.unref()

  await unlink(configPath).catch(() => {})
  await unlink(__filename).catch(() => {})
}

main().catch(() => process.exitCode = 1)
`

/**
 * Creates a tiny Node helper that runs through Electron's own executable.
 * This avoids cmd.exe, PowerShell, batch files, visible consoles and UAC.
 * The pending ASAR has already been downloaded and SHA-256 verified before
 * this helper is started; it only performs the atomic swap after we exit.
 */
async function prepareWindowsUpdateHelper(
  appAsarPath: string,
  updateAsarPath: string,
  appDataPath: string,
): Promise<string[]> {
  const helperPath = join(appDataPath, `MineLatinoAutoUpdate-${process.pid}.cjs`)
  const configPath = join(appDataPath, `MineLatinoAutoUpdate-${process.pid}.json`)
  await writeFile(helperPath, WINDOWS_UPDATE_HELPER, 'utf8')
  await writeFile(configPath, JSON.stringify({
    parentPid: process.pid,
    appAsarPath,
    updateAsarPath,
    executable: process.execPath,
    arguments: process.argv.slice(1),
    cwd: process.cwd(),
  }), 'utf8')
  // Clean up the legacy helper so older upgrades do not leave
  // an alarming AutoUpdate.bat behind in the application-data directory.
  await unlinkAsync(join(appDataPath, 'AutoUpdate.bat')).catch(() => {})

  return [process.execPath, helperPath, configPath]
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

function isSameVersion(a: string, b: string) {
  if (a.startsWith('v')) {
    a = a.substring(1)
  }
  if (b.startsWith('v')) {
    b = b.substring(1)
  }
  return a === b
}

export class ElectronUpdater implements LauncherAppUpdater {
  private logger: Logger

  constructor(private app: ElectronLauncherApp) {
    this.logger = app.getLogger('ElectronUpdater')
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
      newUpdate: !isSameVersion(app.version, result.tag_name),
      operation: ElectronUpdateOperation.Manual,
    }

    // Asks for the exact asset `downloadAsarUpdate` would fetch, so an install
    // is only offered an in-place update when its own platform and architecture
    // were published.
    const hasAsar = files.some((f) => f.name === asarAssetName(version))
    if (this.app.platform.os === 'linux' && this.app.env === 'appimage') {
      // An AppImage is one self-contained file; replacing the app.asar inside a
      // running copy is not how it is updated.
      updateInfo.operation = ElectronUpdateOperation.Manual
    } else {
      updateInfo.operation = hasAsar
        ? ElectronUpdateOperation.Asar
        : ElectronUpdateOperation.Manual
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
      newUpdate: !isSameVersion(info.updateInfo.version, this.app.version),
      operation: ElectronUpdateOperation.AutoUpdater,
    }

    return release
  }

  private async quitAndInstallAsar() {
    const appAsarPath = join(dirname(__dirname), 'app.asar')
    const updateAsarPath = join(this.app.appDataPath, 'pending_update')

    this.logger.log(`Install asar on ${this.app.platform.os} ${appAsarPath}`)
    if (this.app.platform.os === 'windows') {
      const appAsarPath = join(dirname(__dirname), 'app.asar')
      const updateAsarPath = join(this.app.appDataPath, 'pending_update')

      if (!existsSync(updateAsarPath)) {
        throw new Error(`No update found: ${updateAsarPath}`)
      }

      const hasWriteAccess = await new Promise<boolean>((resolve) => {
        open(appAsarPath, 'a', (e, fd) => {
          if (e) {
            resolve(false)
          } else {
            closeSync(fd)
            resolve(true)
          }
        })
      })

      if (!hasWriteAccess) {
        throw new AnyError(
          'UpdateError',
          'MineLatino no puede actualizarse porque la carpeta de instalación no permite escritura. Reinstala el launcher para tu usuario o elige una carpeta donde tengas permisos.',
          {},
          { appAsarPath },
        )
      }
      this.logger.log(`Process has write access to ${appAsarPath}; install without elevation`)

      const args = await prepareWindowsUpdateHelper(
        appAsarPath,
        updateAsarPath,
        this.app.appDataPath,
      )
      this.logger.log(`Install from windows: ${args.join(' ')}`)
      const x = spawn(args[0], args.slice(1), {
        cwd: this.app.appDataPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      x.unref()
      this.app.quit()
    } else {
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
  }

  async checkUpdateTask(): Promise<ReleaseInfo> {
    if (this.app.platform.os === 'windows' || this.app.platform.os === 'osx') {
      return this.#getUpdateFromSelfHost()
    }
    try {
      return await this.#getUpdateFromAutoUpdater()
    } catch (e) {
      if (isSystemError(e) && e.code === 'ENOENT') {
        return this.#getUpdateFromSelfHost()
      }
      this.logger.warn(e as Error)
      throw e
    }
  }

  async downloadUpdate(updateInfo: ReleaseInfo, options?: DownloadUpdateOptions): Promise<void> {
    const tracker = options?.tracker
    const abortSignal = options?.abortSignal

    if (updateInfo.operation === ElectronUpdateOperation.AutoUpdater) {
      await downloadFullUpdate(this.app, updater.autoUpdater, {
        tracker,
        abortSignal,
      })
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
      this.logger.log('Currently is development environment. Skip to install update')
      return
    }
    if (updateInfo.operation === ElectronUpdateOperation.Asar) {
      await this.quitAndInstallAsar()
    } else {
      updater.autoUpdater.quitAndInstall()
    }
  }
}
