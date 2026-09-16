import { createHash } from 'crypto'
import oneTwentyOneFour from './preset-defaults/1.21.4.json'
import oneTwentyOneEleven from './preset-defaults/1.21.11.json'
import twentySixTwo from './preset-defaults/26.2.json'

export interface MineLatinoPresetDefaultFile {
  path: string
  content: string
}

export interface MineLatinoPresetDefaults {
  revision: number
  files: MineLatinoPresetDefaultFile[]
  signature: string
}

type RawPresetDefaults = {
  revision: number
  files: MineLatinoPresetDefaultFile[]
}

const RAW_DEFAULTS: Record<string, RawPresetDefaults> = {
  'minelatino-1-21-4': oneTwentyOneFour,
  'minelatino-1-21-11': oneTwentyOneEleven,
  'minelatino-26-2': twentySixTwo,
}

const DEFAULT_FOV = '1.0'
const DEFAULT_GUI_SCALE = '2'

function applyLauncherGameOptions(content: string): string {
  return content
    .replace(/^fov:[^\r\n]*/m, `fov:${DEFAULT_FOV}`)
    .replace(/^guiScale:[^\r\n]*/m, `guiScale:${DEFAULT_GUI_SCALE}`)
}

function disableSodiumExtraFps(content: string): string {
  try {
    const options = JSON.parse(content) as { extra_settings?: { show_fps?: boolean } }
    if (options.extra_settings) options.extra_settings.show_fps = false
    return JSON.stringify(options, null, 2)
  } catch {
    return content
  }
}

function applyLauncherDefaults(file: MineLatinoPresetDefaultFile): MineLatinoPresetDefaultFile {
  if (file.path.endsWith('options.txt')) {
    return { ...file, content: applyLauncherGameOptions(file.content) }
  }
  if (file.path === 'config/sodium-extra-options.json') {
    return { ...file, content: disableSodiumExtraFps(file.content) }
  }
  return file
}

function isSafePresetPath(path: string): boolean {
  return path === 'options.txt'
    || (path.startsWith('config/')
      && !path.includes('..')
      && !path.includes('\\')
      && !path.includes('\0'))
}

/**
 * Return the curated defaults bundled with a GatinoLauncher profile.
 *
 * The files are local build inputs, never backend-controlled. Keeping a
 * content fingerprint in the preset state makes a launcher upgrade apply a
 * changed optimization once without overwriting later player edits on every
 * startup.
 */
export function getPresetDefaults(presetId: string): MineLatinoPresetDefaults | undefined {
  const defaults = RAW_DEFAULTS[presetId]
  if (!defaults) return undefined
  const files = defaults.files
    .filter(file => isSafePresetPath(file.path))
    .map(applyLauncherDefaults)
  const signature = createHash('sha256')
    .update(JSON.stringify({ revision: defaults.revision, files }))
    .digest('hex')
  return { ...defaults, files, signature }
}
