export const IS_DEV = process.env.NODE_ENV === 'development'
/**
 * Directory name under the OS app-data folder (`%APPDATA%/xmcl`, ...).
 *
 * Deliberately NOT renamed by the MineLatino fork: it is where every account,
 * secret and setting lives, so changing it would orphan existing data rather
 * than brand anything. Branding lives in `LAUNCHER_PROTOCOL` and the packaging
 * product name instead.
 */
export const LAUNCHER_NAME = 'xmcl'
/**
 * The OS-registered deep-link scheme (`minelatino://launcher/...`).
 *
 * Upstream's `xmcl` is replaced wholesale: the installer's registry entry, the
 * `setAsDefaultProtocolClient` call and every `protocol.registerHandler` must
 * agree on one string, so it is defined once here.
 */
export const LAUNCHER_PROTOCOL = 'minelatino'
/**
 * Human-readable product name: window titles, shortcuts, the installer.
 *
 * Kept next to the packaging values it has to agree with
 * (`productName`/`protocols.name` in
 * `xmcl-electron-app/build/electron-builder.config.ts`). The builder config is
 * loaded outside the app's module graph, so it repeats the literals instead of
 * importing them — change both together.
 */
export const LAUNCHER_PRODUCT_NAME = 'MineLatino'
/**
 * Windows AppUserModelID, which must equal the builder's `appId`: the NSIS
 * installer stamps `appId` into the Start-menu shortcut, and a mismatch makes
 * Windows treat the running app as a second, unpinned taskbar entry and
 * attribute toast notifications to the wrong application.
 */
export const LAUNCHER_APP_ID = 'com.minelatino.launcher'
export const RESOURCE_FILE_VERSION = 2
export const HAS_DEV_SERVER = !!process.env.HAS_DEV_SERVER
