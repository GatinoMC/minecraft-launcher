/* eslint-disable no-template-curly-in-string */
import { config as dotenv } from 'dotenv'
import type { Configuration } from 'electron-builder'

dotenv()

/**
 * Packaging identity of the MineLatino fork.
 *
 * These literals mirror `LAUNCHER_PRODUCT_NAME`, `LAUNCHER_APP_ID` and
 * `LAUNCHER_PROTOCOL` in `xmcl-runtime/constant.ts`. electron-builder loads
 * this file outside the app's module graph, so it cannot import them — change
 * both places together.
 */
const productName = 'MineLatino'
const appId = 'com.minelatino.launcher'
const scheme = 'minelatino'
const artifact = 'minelatino'

/**
 * The GitHub repo that holds the release assets. Both values are optional:
 * `publish` is left empty until they exist, which matters because
 * electron-builder otherwise infers a GitHub publish target from
 * `package.json`'s `repository.url` — still upstream's — and bakes it into
 * `app-update.yml`. With no publish config the Linux auto-updater throws ENOENT
 * and `ElectronUpdater.checkUpdateTask` falls back to the MineLatino manifest,
 * which is the path Windows and macOS already take.
 */
const githubOwner = process.env.ML_GITHUB_OWNER?.trim() || 'FredyGraces20'
const githubRepo = process.env.ML_GITHUB_REPO?.trim() || 'MineLatino-Launcher'

export const config = {
  productName,
  appId,
  directories: {
    output: 'build/output',
    buildResources: 'build',
    app: '.',
  },
  protocols: {
    name: productName,
    schemes: [scheme],
  },
  publish: githubOwner
    ? [{
        provider: 'github',
        owner: githubOwner,
        repo: githubRepo,
      }]
    : [],
  files: [{
    from: 'dist',
    to: '.',
    filter: ['**/*.js', '**/*.ico', '**/*.png', '**/*.webp', '**/*.svg', '*.node', '*.dll', '**/*.html', '**/*.css', '**/*.woff2', '**/*.wasm'],
  }, {
    from: '.',
    to: '.',
    filter: 'package.json',
  }],
  extraResources: [{
    from: 'main/agent-documents',
    to: 'agent-documents',
    filter: ['**/*.md'],
  }],
  artifactName: `${artifact}-\${version}-\${platform}-\${arch}.\${ext}`,
  dmg: {
    artifactName: `${artifact}-\${version}-\${arch}.\${ext}`,
    contents: [
      {
        x: 410,
        y: 150,
        type: 'link',
        path: '/Applications',
      },
      {
        x: 130,
        y: 150,
        type: 'file',
      },
    ],
  },
  mac: {
    icon: 'icons/dark.icns',
    darkModeSupport: true,
    target: [
      {
        target: 'dmg',
        arch: ['arm64', 'x64'],
      },
    ],
    extendInfo: {
      NSMicrophoneUsageDescription: 'A Minecraft mod wants to access your microphone.',
      NSCameraUsageDescription: 'Please give us access to your camera',
      'com.apple.security.device.audio-input': true,
      'com.apple.security.device.camera': true,
    },
  },
  nsis: {
    // One-click, per-user: no UAC prompt for the initial install, and the
    // launcher lands in a directory the player owns.
    oneClick: true,
    perMachine: false,
    // The app-data directory holds accounts, secrets and instances. Removing it
    // on uninstall would delete player data, so it is left behind.
    deleteAppDataOnUninstall: false,
    allowElevation: true,
  },
  // x64 only. Upstream also shipped ia32, but the asar self-update path is
  // x64-shaped: `ElectronUpdater.#getUpdateFromSelfHost` looks for
  // `app-<version>-win.asar` with no architecture suffix, so a 32-bit install
  // would be offered an update whose asset it cannot resolve. Re-add `ia32`
  // (and publish a matching `app-<version>-win-ia32.asar`) if 32-bit players
  // ever matter.
  win: {
    signtoolOptions: { publisherName: productName },
    icon: 'icons/dark.ico',
    electronLanguages: ['en-US'],
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'zip',
        arch: ['x64'],
      },
    ],
  },
  linux: {
    executableName: scheme,
    electronLanguages: ['en-US'],
    desktop: {
      entry: {
        MimeType: `x-scheme-handler/${scheme}`,
        StartupWMClass: scheme,
      },
    },
    category: 'Game',
    icon: 'icons/dark.icns',
    artifactName: `${artifact}-\${version}-\${arch}.\${ext}`,
    target: [
      { target: 'deb', arch: ['x64', 'arm64'] },
      { target: 'rpm', arch: ['x64', 'arm64'] },
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'tar.xz', arch: ['x64', 'arm64'] },
      { target: 'pacman', arch: ['x64', 'arm64'] },
    ],
  },
} satisfies Configuration
