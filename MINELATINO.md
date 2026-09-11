# MineLatino Launcher — fork map

Fork of [XMCL](https://github.com/Voxelum/x-minecraft-launcher) v0.68.1 (MIT, commit `30b9f92`).
Upstream is kept on the `upstream` remote so our changes can be rebased.

All MineLatino code lives in a `minelatino` namespace (folders and file prefixes) so
upstream merges stay cheap. Upstream files we touch are listed at the bottom.

## Verified facts about this repo

`CONTRIBUTING.md` is stale in several places. What is actually true today:

- **No git submodule.** The core libraries are in-repo under `packages/*` (`@xmcl/core`,
  `@xmcl/installer`, `@xmcl/user`, `@xmcl/game-data`, `@xmcl/modrinth`,
  `@xmcl/user-offline-uuid`, ...). `git clone --recurse-submodules` is unnecessary.
- **pnpm monorepo**, `packageManager: pnpm@11.10.0`, `engines.node >= 22.16.0`.
  Workspace members: `packages/**`, `xmcl-electron-app`, `xmcl-runtime`,
  `xmcl-runtime-api`, `xmcl-keystone-ui`, `xmcl-client-vue`, `.github/actions/*`.
  `e2e/` is deliberately outside the workspace (`pnpm e2e:install` to opt in).
- **Renderer views are in `xmcl-keystone-ui/src/views/`**, not
  `src/windows/main/views/`. Separate Electron renderer entries live in
  `xmcl-keystone-ui/src/windows/{main,browser,logger,migration}`.
- **`protocol.json` is not a URL scheme.** It maps Minecraft protocol versions to
  game versions. The custom URL scheme is `minelatino://` (upstream's `xmcl://`),
  registered by `LauncherAppManager` (`xmcl-runtime/app/LauncherAppManager.ts`)
  from `LAUNCHER_PROTOCOL` in `xmcl-runtime/constant.ts`.
- **Locales are YAML**, not JSON: `xmcl-keystone-ui/locales/es-ES.yaml` (renderer)
  and `xmcl-electron-app/main/locales/es-ES.yaml` (main process).
- Window constraints (`xmcl-electron-app/main/defaultApp.ts`): minimum `800x400`,
  default desktop `1200x720`.

## Commands

```bash
corepack enable                 # pnpm is not installed globally on this machine
corepack pnpm install --frozen-lockfile
corepack pnpm dev:renderer      # Vite dev server on :3000 (xmcl-keystone-ui)
corepack pnpm dev:main          # Electron main, watches + loads renderer from :3000
corepack pnpm check             # typecheck every workspace package
corepack pnpm lint              # oxlint
corepack pnpm build:renderer    # required after any xmcl-keystone-ui change
corepack pnpm build:all         # production packaging
```

`dev:main` compiles with `HAS_DEV_SERVER=true`; the Electron process must be
restarted to pick up main-process changes (renderer hot-reloads).
DevTools endpoint: port `9222` (`xmcl-electron-app/dev.ts`).

## Where each feature hooks in

### Adding a service (the pattern used for MineLatinoService)

1. Contract — `xmcl-runtime-api/src/services/<Name>Service.ts`:
   `export interface <Name>Service { ... }` plus
   `export const <Name>ServiceKey: ServiceKey<<Name>Service> = '<Name>Service'`.
2. Re-export it from `xmcl-runtime-api/index.ts` (`export * from './src/services/...'`).
3. Implementation — a class decorated with `@ExposeServiceKey(<Name>ServiceKey)`
   extending `AbstractService` from `~/service` (`xmcl-runtime/service/Service.ts`).
   Constructor takes `@Inject(LauncherAppKey) app: LauncherApp`; `super(app, initializer?)`.
   Gives `this.log/warn/error`, `this.getAppDataPath(...)`, `this.app.fetch(...)`
   (pooled HTTP), `this.app.appDataPath`.
4. Register it in `xmcl-electron-app/main/definedServices.ts`.
5. Renderer — `useService(<Name>ServiceKey)` inside a composable in
   `xmcl-keystone-ui/src/composables/`.

Services that need Electron APIs live in `xmcl-electron-app/main/` instead of
`xmcl-runtime/` — see `xmcl-electron-app/main/ServerService.ts` as the reference.

### Home screen

`xmcl-keystone-ui/src/views/Home.vue` is the landing view. It renders
`HomeGrid.vue`, a user-draggable `grid-layout-plus` grid whose card types are the
`CardType` enum (Mod, ResourcePack, ShaderPack, Save, Screenshots, Server, World,
Blueprint) persisted in `localStorage`. Shared card chrome: `src/components/HomeCard.vue`.

### Launching and auto-joining the server

The launch pipeline already does all the work; the fork only supplies a value:

- `packages/core/launch.ts` accepts `LaunchOptions.quickPlayMultiplayer` and emits
  `--quickPlayMultiplayer <host:port>` (line ~936).
- `xmcl-runtime/launch/LaunchService.ts` line ~274 converts a `server` launch option
  into **both** `launchOptions.server` and `launchOptions.quickPlayMultiplayer`, i.e.
  `--server <host> --port <port>` *and* `--quickPlayMultiplayer <host:port>`.
  On 1.20+ Minecraft logs `Completely ignored arguments: [--server, ..., --port, ...]`
  and carries on, so emitting both is how upstream spans 1.19− and 1.20+ with one
  code path. It is redundant, not broken — do not "fix" it.
- `LaunchOptions.server?: { host: string; port?: number }` is part of the public
  contract in `xmcl-runtime-api/src/services/LaunchService.ts`.
- **Upstream already has a per-instance server pin.** `Instance.server`
  (`packages/instance/instance.ts:279`) is `{ host, port?, name? }`, and
  `generateLaunchOptionsWithGlobal` (`xmcl-runtime-api/src/util/launch.ts:160`)
  feeds it straight into `options.server`, with `...overrides` spread *after* it —
  so an override beats the pin. `BaseSettingServer.vue` and
  `AppJoinServerDialog.vue` are the UI for it.
- Renderer funnel: `xmcl-keystone-ui/src/composables/instanceLaunch.ts` →
  `launch(side, overrides?: Partial<LaunchOptions>, parentAction?)`; every path
  (launch button, gamepad, shortcuts, multi-instance) ends in `_launch(...)`.
  Injecting the server override there covers all of them. The command-line launch
  path (`xmcl-runtime-api/src/commands/instance/launch.ts`) does **not** go through
  `_launch`, so it only auto-joins via a real `instance.server` pin.
- Button state machine: `src/composables/launchButton.ts` (`useLaunchButton`).

### `servers.dat`

Owned by `InstanceServerInfoService` (`xmcl-runtime/instance/`), which wraps
`@xmcl/game-data`'s `readServerInfo` / `writeServerInfo` (there is no
`readServersDat`). `addServer` appends unconditionally, so the fork adds an
idempotent `ensureServer` next to it rather than duplicating the read / dedupe /
write / `pushState` logic elsewhere. `composables/serverUpstream.ts:65` is the
upstream precedent for the same "add only if absent" shape.

Instances only share one `servers.dat` when the player opted into
`linkServersList` (`composables/instanceCreation.ts:343`), so it is not safe to
write the global copy once and assume every instance sees it.

### Accounts

`packages/user` handles Microsoft; `packages/user-offline-uuid` derives the
vanilla-compatible offline UUID. `xmcl-runtime/user/` exposes Microsoft, offline,
ely.by, LittleSkin and authlib-injector (custom auth server) backends. Offline
accounts are **fully implemented upstream** (`AUTHORITY_DEV`, with a username and an
optional UUID field) — nothing had to be built, only gated.

The single choke point for which login types are offered is
`useAuthorityItems` in `xmcl-keystone-ui/src/composables/login.ts`, consumed by
`UserLoginForm.vue` through `UserLoginAuthoritySelect.vue`.

### Instance creation, loaders and mods

What a "profile preset" has to drive, and what upstream already gives you:

- `InstanceService.createInstance(options) → Promise<string>` (the new path) takes
  `CreateInstanceOptions = Partial<Omit<InstanceDataWithTime,'runtime'>> &
  { name, path?, runtime?: PartialRuntimeVersions, resourcepacks?, shaderpacks? }`
  (`packages/instance/create.ts:4`). `PartialRuntimeVersions` is
  `Partial<RuntimeVersions> & { minecraft: string }`; the runtime keys are
  `minecraft, forge, neoForged, fabricLoader, quiltLoader, optifine, labyMod`.
- **`resourcepacks`/`shaderpacks` are booleans, and XMCL only creates those folders
  when asked.** A preset that wants shaders to work out of the box must pass them.
- `InstanceInstallService.installInstanceFiles(options)` takes a union:
  `{ path, upstream, files, id? }` **or** `{ path, oldFiles, files, id? }`. It
  **awaits the whole download** (`xmcl-runtime/instanceIO/InstanceInstallService.ts:778`)
  before resolving, so a spinner bound to that promise is accurate. Files it cannot
  resolve do not fail the call — they land in `unresolved-files.json`.
- **`oldFiles` is diff semantics.** An empty `oldFiles` on a *brand-new* instance
  means "add everything"; on an existing one it can read the instance's other mods
  as removals. Never call it with `oldFiles: []` to top up a profile.
- `InstanceFile` (`packages/instance/files.ts:12-37`) requires `hashes`. There is no
  way to hand over a bare URL, so a Modrinth lookup before install is mandatory
  rather than an optimization.
- **No existing helper converts Modrinth → `InstanceFile[]`.**
  `composables/modInstall.ts`'s `getRequiredModrinthInstallVersions` yields
  `{ versionId, icon }` pairs for a different flow. That conversion is hand-rolled
  in `composables/minelatinoPreset.ts`.
- Loader resolution has two upstream shapes: `composables/instanceModLoaderDefault.ts`
  applies a loader **after** creation through `editInstance`, while
  `composables/instanceCreation.ts` can carry it in `runtime` from the start. The
  preset path resolves **before** creation so the instance is born complete.
  `VersionMetadataService` is the source: `getFabricVersions()`/`getQuiltVersions()`
  → `{ gameVersions, loaderVersions }` (newest first), `getForgeVersions(mc)` →
  `ForgeVersion[]` (prefer `type === 'recommended'`), `getNeoForgedVersions(mc)` →
  `string[]` (+ `getLatestNeoforge` in `composables/neoForgeVersion.ts`).
- The installed-mod list is `kInstanceModsContext` (`composables/instanceMods.ts:15`,
  provided at `windows/main/Context.ts:199`): `mods: Ref<ModFile[]>` throttled 500 ms
  behind the raw scan, plus `isValidating`. `ModFile` (`util/mod.ts:441`) carries
  `path, modId, name, fileName, enabled, modrinth?: { projectId, versionId }`.
- **`isValidModrinthId` (`packages/resource/ResourceMetadata.ts:53`) demands an
  8-character base62 project id.** A slug like `sodium` is fine for a Modrinth API
  call but must be normalized to `version.project_id` before it is persisted.
- Launch interception: `useLaunchButton().usePreclickListener(listener)`
  (`composables/launchButton.ts:395-401`). A listener that **rejects aborts the whole
  launch chain**; resolving lets it through. `kLaunchButton` is provided at
  `windows/main/App.vue`. `views/AppUnauthenticatedWarningDialog.vue` is the
  precedent for a dialog that gates Play.

### Opening web pages

`window.open(url, 'browser')` and `<a target="browser">` are the repo idiom, but
`ElectronController.windowOpenHandler` (`xmcl-electron-app/main/ElectronController.ts`)
sends every non-`app://`/non-localhost URL to `shell.openExternal`. So that idiom
opens the **system browser**, not an in-launcher webview. In-launcher web windows
exist only through `appsHost.bootAppByUrl(url)` (PWA-style, requires the target to
serve a web manifest) or a `BrowserWindow` created by main-process code — which is
what the MineLatino store window does.

## MineLatino files (all new, all namespaced)

| Path | Role |
| --- | --- |
| `xmcl-runtime-api/src/services/MineLatinoService.ts` | Contract: config, news, updates, web windows |
| `xmcl-electron-app/main/minelatino/config.ts` | `FALLBACK_CONFIG`, `normalizeConfig`, `resolveBackendUrl` |
| `xmcl-electron-app/main/minelatino/MineLatinoService.ts` | Stale-while-revalidate fetcher + disk cache |
| `xmcl-electron-app/main/minelatino/webWindow.ts` | `BrowserWindow` pool for Tienda / tabs / "Leer más" |
| `xmcl-keystone-ui/src/composables/minelatino.ts` | `kMineLatino`, `useMineLatino()`, `useMineLatinoConfig()`, `useMineLatinoAuth()`, `findMissingRequiredMods()`, `useRelativeTime()` |
| `xmcl-keystone-ui/src/composables/minelatinoPreset.ts` | `kMineLatinoPreset`, `useMineLatinoPreset()`: preset → runtime + Modrinth files → instance |
| `xmcl-keystone-ui/src/util/minelatinoMarkdown.ts` | Escape-first Discord markdown → HTML |
| `xmcl-keystone-ui/src/views/minelatino/MineLatinoHome.vue` | Hero, address chip, actions, panel grid |
| `xmcl-keystone-ui/src/views/minelatino/MineLatinoNews.vue` | Discord-styled feed + lightbox |
| `xmcl-keystone-ui/src/views/minelatino/MineLatinoPresets.vue` | "Crear perfil MineLatino" cards |
| `xmcl-keystone-ui/src/views/minelatino/MineLatinoRequiredModsDialog.vue` | Pre-Play gate for `server.requiredMods` |
| `xmcl-keystone-ui/src/views/minelatino/MineLatinoUpdates.vue` | Changelog list |
| `../launcher-backend/` | Separate repo: the Railway service |

## Upstream files modified by this fork

`git diff --stat` is **48 files changed, +557 / −354** (the eight icon binaries
account for most of the deletions). The table below lists the *code* hunks a
rebase has to re-apply; the Phase 5 packaging and updater files are described in
their own section further down because they are replacements rather than hooks.
Every hunk is additive except the ones marked ↱, which replace an existing line.

| File | Δ | Change |
| --- | --- | --- |
| `xmcl-runtime-api/index.ts` | +1 | export `MineLatinoService` |
| `xmcl-electron-app/main/definedServices.ts` | +4 | register `MineLatinoService` |
| `xmcl-keystone-ui/src/views/Home.vue` | +7 | render `<MineLatinoHome />` + import |
| `xmcl-keystone-ui/locales/en.yaml` | +48 | `MineLatinoHome.*`, `MineLatinoAuth.*`, `MineLatinoPreset.*`, `MineLatinoRequiredMods.*` |
| `xmcl-keystone-ui/locales/es-ES.yaml` | +48 | same, in Spanish |
| `xmcl-keystone-ui/src/index.html` | +1/−1 ↱ | `<title>` → MineLatino Launcher |
| `xmcl-electron-app/main/defaultApp.ts` | +4/−1 ↱ | pre-load window title |
| `xmcl-runtime/settings/pluginSettings.ts` | +6 | any `es-*` host locale → `es-ES` |
| `xmcl-runtime-api/src/services/InstanceServerInfoService.ts` | +13 | `ensureServer` contract |
| `xmcl-runtime/instance/InstanceServerInfoService.ts` | +37 | `ensureServer` implementation |
| `xmcl-keystone-ui/src/composables/instanceLaunch.ts` | +60/−1 ↱ | auto-join in `generateLaunchOptions`, `servers.dat` in `_launch` |
| `xmcl-keystone-ui/src/composables/login.ts` | +5 | filter authorities by `auth.modes` |
| `xmcl-keystone-ui/src/components/UserLoginForm.vue` | +25 | one-time non-premium warning |
| `xmcl-keystone-ui/src/windows/main/App.vue` | +4 | mount `MineLatinoRequiredModsDialog` + import |
| `xmcl-runtime/constant.ts` | +33 | `LAUNCHER_PROTOCOL`, `LAUNCHER_PRODUCT_NAME`, `LAUNCHER_APP_ID` |
| `xmcl-runtime/app/LauncherAppManager.ts` | +2/−1 ↱ | scheme registration reads `LAUNCHER_PROTOCOL` |
| `xmcl-runtime/app/LauncherProtocolHandler.ts` | +4/−2 ↱ | parse/serialize URLs with `LAUNCHER_PROTOCOL` |
| `xmcl-runtime/app/LauncherApp.ts` | +9/−9 ↱ | second-instance / deep-link scheme |
| `xmcl-runtime/app/win32/index.ts` | +2/−1 ↱ | desktop `.url` shortcut uses `minelatino://` |
| `xmcl-runtime/user/pluginOfficialUserApi.ts` | +2/−1 ↱ | Microsoft redirect stays on `http://localhost:<port>/auth` (scheme-independent) |
| `xmcl-runtime/user/pluginModrinthAccess.ts` | +2/−1 ↱ | OAuth redirect handler keyed on `LAUNCHER_PROTOCOL` |
| `xmcl-runtime/xmclAccount/XmclAccountService.ts` | +2/−1 ↱ | callback URL scheme |
| `xmcl-runtime/yggdrasilServer/pluginYggdrasilHandler.ts` | +2/−1 ↱ | yggdrasil redirect scheme |
| `xmcl-runtime-api/src/util/sdp.ts` | +17/−2 ↱ | LAN-invite launcher URLs use `minelatino://` |
| `xmcl-runtime-api/src/services/BaseService.ts` | +2/−1 | `handleUrl` doc no longer hardcodes `xmcl://` |
| `xmcl-electron-app/main/ElectronLauncherApp.ts` | +2/−2 ↱ | single-instance protocol check |
| `xmcl-electron-app/main/ElectronController.ts` | +3/−2 ↱ | window titles use `LAUNCHER_PRODUCT_NAME` |
| `xmcl-electron-app/main/controllers/notification.ts` | +2/−1 ↱ | `setAppUserModelId(LAUNCHER_APP_ID)` |
| `xmcl-electron-app/main/index.dev.ts` | +4/−5 | upstream `setFeedURL` removed |
| `xmcl-electron-app/main/locales/{en,es-ES}.yaml` | +1/−1 ↱ | root `title` → MineLatino Launcher (tray tooltip) |
| `xmcl-electron-app/build/electron-builder.config.ts` | +64/−37 | productName/appId/protocols/nsis/publish, appx+snap dropped |
| `xmcl-electron-app/build.ts` | +16/−22 | asar naming, `app-update.yml` removal, appx hooks dropped |
| `xmcl-electron-app/postinstall.ts` | +7/−11 | dead appx patch dropped, linux prefix → `minelatino` |
| `xmcl-electron-app/main/utils/updater.ts` | +105/−188 | self-host manifest only, see Phase 5 section |

Locale keys are sorted by **ASCII**, so the uppercase top-level keys form a leading
run — the `MineLatino*` blocks sit between `HomeLaunchMultiInstanceDialog` and
`SettingMigrationDialog`, ahead of the lowercase run that starts at `agent`.
Sub-keys are alphabetical. Values starting with `{` or containing `: ` must be
single-quoted or the i18n lint fails to parse them. (Upstream itself is not strictly
sorted — `gamepad:` is appended after `versionType:` — so position is convention,
not an enforced rule.)

## Phase 5 decisions worth remembering

**Identity lives in three constants.** `xmcl-runtime/constant.ts` now exports
`LAUNCHER_PROTOCOL = 'minelatino'`, `LAUNCHER_PRODUCT_NAME = 'MineLatino'` and
`LAUNCHER_APP_ID = 'com.minelatino.launcher'`. `build/electron-builder.config.ts`
cannot import them (electron-builder loads it outside the app's module graph), so
it repeats the literals — change both places together. `LAUNCHER_APP_ID` must equal
the builder's `appId` or Windows shows a second, unpinnable taskbar entry and
misattributes toasts. `LAUNCHER_NAME = 'xmcl'` is deliberately **not** renamed: it is
the app-data directory (`%APPDATA%/xmcl`) holding accounts, secrets and instances,
and renaming it would orphan every existing player profile.

**The updater was the ship-blocker.** Upstream's `ElectronUpdater` asked
`api.xmcl.app` (with an `azurewebsites.net` fallback) for the latest release and then
downloaded `app-<version>-win.asar` from a hardcoded `github.com/Voxelum/...`
release URL over our own `app.asar` — a shipped fork would silently become stock
XMCL on its first self-update. It also had GFW mirrors (`registry.npmmirror.com`,
`files.0xc.cn`) and an appx path that installed upstream's Azure blob. All of it is
gone. `#getUpdateFromSelfHost()` now reads `GET <backend>/api/release`, and when no
backend is configured it reports "up to date" with a warning instead of erroring on
every launch.

**`app-update.yml` is deleted at pack time.** electron-builder writes it from
`package.json`'s `repository` field *even when `publish` is `[]`*, and that repository
is still upstream's. Left in place, the Linux check path (`#getUpdateFromAutoUpdater`)
would honour its `provider: github / owner: voxelum` and install stock XMCL.
`build.ts`'s `afterPack` therefore unlinks it, which makes electron-updater throw
ENOENT on every platform and routes all of them through the MineLatino manifest.
Do not "fix" the missing file: it is the mechanism.

**The manifest contract.** `launcher-backend/src/release.ts` answers in GitHub's
release shape (`tag_name`, `published_at`, `assets[].browser_download_url`) because
that is what the client already parsed. Env: `RELEASE_TAG_NAME`, `RELEASE_BODY`,
`RELEASE_PUBLISHED_AT`, `RELEASE_PRERELEASE`, `RELEASE_ASSETS_BASE_URL`,
`RELEASE_ASSETS` (optional override). Every "no update" case — unconfigured manifest,
invalid tag, prerelease withheld, client already newer — returns the *client's own*
version with zero assets, never an error, so a stale or missing `RELEASE_TAG_NAME`
leaves players on a working build. `isNewerVersion()` compares dotted numerics so a
stale tag cannot loop players into a downgrade.

**Asset names are platform-literal.** `build.ts` writes
`app-<version>-win.asar` (+ `.sha256`, `.gz`), but electron-builder's `${platform}`
macro expands to the Node platform, so the installer and zip are
`minelatino-<version>-win32-x64.{exe,zip}` — verified against a real
`BUILD_TARGET=win` build. `defaultAssetNames()` and `.env.example` both say `win32`.
The client's `asarAssetName()` includes the arch suffix (`-arm64`/`-ia32`), fixing an
upstream bug where the manifest check looked for the arch-less name only.

**Windows is x64-only.** Upstream also shipped ia32, but the asar self-update asset
is `app-<version>-win.asar` with no arch suffix, so a 32-bit install would be offered
an update whose asset it cannot resolve. Re-add `ia32` to
`build/electron-builder.config.ts` *and* publish a matching
`app-<version>-win-ia32.asar` if 32-bit players ever matter. **This is a product
decision the operator should confirm.**

**`publish` is env-driven.** `ML_GITHUB_OWNER` / `ML_GITHUB_REPO` select a GitHub
publish target; with no owner, `publish` is `[]`. That matters because electron-builder
otherwise infers upstream from `package.json repository.url`. `build.ts` passes
`publish: 'never'`, which blocks uploads but still generates `latest.yml` — harmless
now that `app-update.yml` is stripped.

**Appx is fully dropped.** The `appx` and `snap` builder blocks, `postinstall.ts`'s
appx template patch, `build/appxmanifest.xml` and `build/appinstaller-builder.ts`
(the latter hardcoded `xmcl.blob.core.windows.net` and
`xmcl-core-api.azurewebsites.net`) are gone, and so are the 30 appx tile PNGs'
*references*. The tiles themselves could not be deleted in this environment (the
file-delete tool silently no-ops on `.png`), so 30 inert files remain under
`xmcl-electron-app/icons/`; only these eight are referenced and shipped:
`dark.ico`, `dark.icns`, `dark@256x256.png`, `dark@tray.png`, `light.ico`,
`light.icns`, `light@256x256.png`, `light@tray.png`. Clean up manually with:
`git rm 'xmcl-electron-app/icons/*@SmallTile*' 'xmcl-electron-app/icons/*@Square*'
'xmcl-electron-app/icons/*@StoreLogo*' 'xmcl-electron-app/icons/*LargeTile*'
'xmcl-electron-app/icons/*Wide310x150*' 'xmcl-electron-app/icons/*Wie310x150*'`.

**`NOTICE` at the repo root** attributes XMCL (ci010, MIT, commit `30b9f92`) and
states the Mojang trademark disclaimer. The upstream `LICENSE` is kept unmodified.

**Verified build output** (`BUILD_TARGET=win NODE_ENV=production tsx build.ts`,
~76 s after caches): `minelatino-0.68.1-win32-x64.exe` (96 MB NSIS, one-click,
per-user), `minelatino-0.68.1-win32-x64.zip` (129 MB), `app-0.68.1-win.asar`
(29 MB) + `.gz` + `.sha256`, `manifest.json` (`{version, electron}`), and
`win-unpacked/MineLatino.exe`. No `app-update.yml` inside `win-unpacked/resources`.

**Build gotcha on this machine — `NODE_PATH` is required.** `build.ts` (line 56)
and `plugins/esbuild.native.plugin.ts` (line 56, only when `NODE_ENV=production`)
`require.resolve` `@azure/msal-node-runtime` and `@azure/msal-node-extensions`.
Neither is declared by `xmcl-electron-app` — only `xmcl-runtime` declares them —
and `.npmrc` does not public-hoist `@azure`, so pnpm leaves them in the hidden
`node_modules/.pnpm/node_modules` store where a bare `require.resolve` from the
electron-app cannot see them. The build therefore fails with
`Cannot find module '@azure/msal-node-extensions/package.json'` unless the process
runs with `NODE_PATH=<repo>/node_modules/.pnpm/node_modules`. Set that env var (no
package.json change, no `pnpm install` needed) before `tsx build.ts`; the renderer
must already be built (`xmcl-keystone-ui`: `vite build`) since `buildMain` copies
its `dist/`.

**Publishing a release (done once for v0.68.1).** After the build, the seven
artifacts are uploaded with `gh release create v<version> <files…> --repo
FredyGraces20/MineLatino-Launcher --target main` (the repo has two remotes —
`origin` and upstream — so `--repo`/`gh repo set-default` is required). Then the
backend manifest is pointed at it on Railway: `RELEASE_TAG_NAME=v<version>` and
`RELEASE_ASSETS_BASE_URL=…/releases/download/v<version>` — note the base URL must
already contain the tag, because `release.ts` builds `browser_download_url` as
`${base}/${name}` and never inserts the tag itself. Verified live: `/api/release?
version=0.68.0` offers v0.68.1 with five correct GitHub asset URLs, and
`?version=0.68.1` returns zero assets ("up to date"), so no downgrade loop.

**Still upstream-branded, deliberately left.** These call upstream cloud services
and would need product decisions, not code, to repoint: `launcherNews.ts`
(`api.xmcl.app/news`, surfaced in `Me.vue`), `flights.ts`, `XmclAccountApi`,
`ElyByService`, `moddb/databaseDownload.ts`, `XmclApiEndpoints.ts`; plus telemetry
`service.namespace: 'xmcl'`, `cliDriver.ts`'s `programName ?? 'xmcl'`, and
`package.json`'s `name` / `author` / `repository` / `msstoreCliAppId`. The
`https://xmcl.app/peer` LAN-invite page referenced by `xmcl-runtime-api/src/util/sdp.ts`
is also still upstream's, so LAN invites need re-hosting before they are branded.

## Phase 4 decisions worth remembering

Presets are a *description*, not a new subsystem: `composables/minelatinoPreset.ts`
translates `config.presets[]` into XMCL's own `createInstance` + `installInstanceFiles`.
No new downloader, no new on-disk format, and the result is an ordinary instance the
player can edit, update or export like any other.

- **The preset deliberately does not set `instance.server`,** even though
  `CreateInstanceOptions` accepts it. Phase 3's auto-join is skipped when a pin
  exists (caller > player pin > operator config), so pinning at creation time would
  freeze the server IP into every profile and break the plan's central promise that
  the IP can change without shipping a new build. Leaving it empty keeps the
  config-driven path in charge.
- **The Modrinth lookup is mandatory, not an optimization.** `InstanceFile.hashes`
  is a required field, so a version has to be resolved before the file can be handed
  over at all. The same lookup normalizes the project reference: a preset names a mod
  by slug (`sodium`), which Modrinth accepts, but `@xmcl/resource` only accepts the
  canonical 8-character project id when it validates a persisted source — so
  `version.project_id` is what gets stored.
- **`pickVersion` prefers a featured release over the newest entry.** Modrinth
  returns versions newest-first and the newest is regularly an alpha; this profile is
  about to be played on a live server. An explicit `mod.version` pins by `id` *or*
  `version_number`.
- **The loader filter is relaxed on an empty result, the Minecraft filter never is.**
  Projects do not tag every loader they support (a Fabric mod also published for
  Quilt, say), so retrying without `loaders` recovers those. A missing build for the
  Minecraft version genuinely breaks the profile, so that stays fatal.
- **`loaderVersion` is trusted verbatim and skips the metadata lookup entirely.**
  That lets an operator freeze a profile to the exact loader the server was tested
  against, and lets a preset still build when the loader lists are stale or
  unreachable. `optifine` and `labyMod` are unreachable from a preset on purpose:
  both are version-fragile, and pinning them from JSON mostly yields profiles that
  fail to resolve on first launch.
- **Loaders resolve *before* creation.** `useInstanceModLoaderDefault` applies one
  *after* creation through `editInstance`; presets instead fill `runtime` up front so
  the instance is born complete and never briefly exists as a vanilla one. Both the
  runtime and the mod lookups happen before anything is written, so a preset that
  cannot be built leaves no half-created instance behind.
- **`resourcepacks: true, shaderpacks: true`** are passed because XMCL only creates
  those folders when asked, and shaders are the whole point of a Sodium + Iris
  starter set.
- **An unresolvable mod becomes `skipped`, not a failure.** A deleted project, a rate
  limit or a missing build leaves the profile short one mod but perfectly playable,
  and the player can add it later. Only a loader that cannot be resolved aborts.
- **If the mod download fails, the instance is still selected.** It already exists by
  then, so retrying the mods from the instance page beats rebuilding the profile.
  `installInstanceFiles` is therefore wrapped separately from `createInstance`.
- **`oldFiles: []` is why there is no "install the missing mods" button.** That call
  diffs against `oldFiles`, so an empty one on an *existing* instance can read its
  other mods as removals. It is safe here only because the instance was created one
  statement earlier. The required-mods dialog routes to XMCL's own
  `/store/modrinth/:id` page instead, which already knows how to install a compatible
  version — nothing in the fork downloads anything on the player's behalf there.
- **Deduplication matches on instance *name*, not a remembered path**
  (`preset.name`, or `preset.name-N` from `generateDistinctName`). That survives a
  data-root move, a cleared renderer cache and a folder rename, and it prevents the
  `-N` duplicate the button would otherwise create on a second click. It errs towards
  "already created": the worst case is a hand-made instance named the same hiding the
  button, and the ordinary Add Instance dialog is still there.
- **One message per surface.** Only the success is toasted — the player may well have
  navigated away during a long download. Failures and unresolved mods stay in `error`
  / `skipped` for the preset panel to render persistently, rather than being shown
  twice.
- **The required-mods warning fails open.** `useState` starts with
  `isValidating === false` and flips it a tick later, `mods` is throttled 500 ms
  behind the raw scan, and switching instances clears the list before the next one —
  so an unguarded check would report *every* required mod as missing in those
  windows. A `modsReady` flag armed by `watch(mods)` and disarmed by
  `watch(isValidating)` skips the warning instead. Missing a warning is far better
  than blocking a launch with a false one. The check itself is purely in-memory, so
  launches that do not need it pay nothing.
- **`satisfiesRequiredMod` matches loosely in one direction.** Operators write
  whatever they recognise into `requiredMods` — a project id, a slug or a plain mod
  id — so every identity XMCL already extracted from the jar is accepted, including
  the `sodium-0.6.0+mc1.21.1.jar` → `sodium` filename case. Disabled mods do not
  count: the game will not load them, so the server would still reject the player.
- **The dialog is eagerly mounted, not listed in `lazyDialogComponents`.** A lazy
  entry only mounts when the dialog is shown, but this one's `usePreclickListener` is
  what shows it in the first place — lazy mounting would be a deadlock. It is the
  second upstream hunk in `windows/main/App.vue` and the reason that file is touched
  at all.
- **`useMineLatinoConfig()` was extracted from `useMineLatinoAuth()`** for the same
  reason Phase 3 avoided `injection(kMineLatino)` there: the dialog sits outside the
  home screen's subtree, where nothing provides that key. The config is read during
  setup rather than in `onMounted` so the first paint already reflects the operator's
  policy.
- **Modrinth is the only preset source.** It needs no API key (just a descriptive
  User-Agent, which `clientModrinthV2` already sends) and mod authors cannot block
  third-party launchers. CurseForge remains available in the rest of XMCL but is not
  reachable from a preset, since its Core API needs approval and produces dead-end
  "blocked files" errors.

- **Presets are never empty.** `normalizeConfig` resolves
  `presets.length > 0 ? presets : base.presets`, and both `FALLBACK_CONFIG`
  (`main/minelatino/config.ts:72`) and the backend's `DEFAULT_PRESETS`
  (`launcher-backend/src/env.ts:118`) ship the same profile: `1.21.1` + Fabric +
  Sodium + Iris, `icon: 'star'`, `recommended: true`. So the panel's
  `v-if="items.length > 0"` is a defensive guard rather than the usual path, and the
  panel's real gate is `MineLatinoHome`'s `isConfigured` (Phase 2) — an unconfigured
  build hides the whole home screen, presets included. The backend also accepts a
  bare string in `mods[]` (`"sodium"`) and normalizes it to `{ projectId }`, and
  drops any preset missing `id`/`minecraftVersion`/a known loader with a warning
  instead of failing the whole config.

**Deferred:** `recommendedPreset` is normalized and exposed by `useMineLatino()` but
still unconsumed — the Play button does not yet offer a preset when the player has no
profile (the plan's "no profile → offer preset" state). The `recommended` flag
currently only renders a chip on the card.

**Verified:** `vue-tsc` (renderer), `tsc` (runtime-api, runtime, electron main,
preload), `oxlint` (643 + 134 + 354 files) and `i18n lint --missing --extra`
(renderer and main-process locales) all exit 0. Phase 4 touched no `xmcl-runtime`,
`xmcl-runtime-api`, `xmcl-electron-app` or `launcher-backend` file, so those results
are unchanged from Phase 3. **Manual QA is still outstanding:** creating a preset
needs the home screen to render at all (so a configured backend, see the open inputs
below) plus live reachability to Modrinth and the loader metadata services — none of
which a typecheck exercises.

## Phase 3 decisions worth remembering

- **Auto-join precedence is caller > player pin > operator config.**
  `generateLaunchOptions` in `instanceLaunch.ts` injects `overrides.server` only
  when `overrides?.server` *and* `instance.value.server` are both empty. Skipping
  the second guard would let the backend silently overrule a pin the player set in
  `BaseSettingServer.vue`, because `generateLaunchOptionsWithGlobal` already reads
  `instance.server` and spreads `...overrides` after it. It lives in
  `generateLaunchOptions` rather than `_launch` so `launchPreview.ts` — which
  calls it directly — shows the same `--quickPlayMultiplayer` the game gets.
- **`servers.dat` is written at launch, not at profile creation.** The plan asked
  for "profile creation and whenever config changes", but both need enumerating
  every instance from the main process, and `InstanceService` exposes no plain
  list — only `getSharedInstancesState()`. Ensuring on launch covers every
  instance the player actually uses, from one place that already has the path.
  Trade-off: a player who deletes the row by hand gets it back on the next
  launch. That is accepted, since a single-server launcher owning its own entry
  is the point.
- **`ensureServer` skips the write when nothing changed.** It runs on every
  launch, and rewriting `servers.dat` would bump `mtime` and wake the chokidar
  watcher in `InstanceServerInfoService.watch()` for no reason.
- **Icon normalisation.** `servers.dat` stores a bare base64 PNG. The config may
  carry a `data:image/...;base64,` URI (stripped to the payload) or an `http(s)`
  URL (dropped, because the file format cannot express it). Writing a URL into
  the icon field would hand Minecraft something it cannot decode.
- **Auth gating is fail-open.** `useMineLatinoAuth().isAuthorityAllowed` returns
  `true` for any authority that is not Microsoft or offline, and also when the
  config has not arrived or `auth.modes` is empty. An empty list read literally
  would lock the player out of every account because of a backend typo.
- **`allowOffline` is the real gate for offline login**, not `auth.modes`: both
  must allow it. It defaults to `false` in `normalizeConfig` (a policy regression
  is worse than a cosmetic one) but to `true` in `FALLBACK_CONFIG` and in the
  backend's `ML_ALLOW_OFFLINE`, so an unconfigured launcher still behaves like
  stock XMCL.
- **The warning lives in `UserLoginForm.vue`**, next to the offline UUID field,
  and is dismissed into `localStorage` (`minelatinoOfflineWarningDismissed`) so it
  shows once. `useMineLatinoAuth` is a standalone composable rather than
  `injection(kMineLatino)` because the login dialog sits outside the home
  screen's subtree, where nothing provides that key and `injection()` throws.

## Phase 2 decisions worth remembering

- **`isConfigured` gate.** `MineLatinoHome.vue` renders nothing unless the config
  carries a store URL, a server host, a link, or an enabled feed. The bundled
  `FALLBACK_CONFIG` is deliberately inert on all four, so a build that has never
  reached a MineLatino backend looks exactly like upstream XMCL.
- **Play is not reimplemented.** The hero renders the stock `HomeLaunchButton`,
  which reads `kLaunchButton` provided by `windows/main/App.vue`. Two buttons bound
  to one state machine cannot disagree about account / Java / install state.
- **Discord markdown has its own renderer.** `composables/markdown.ts` configures
  markdown-it with `html: true`, which is fine for trusted READMEs and unsafe for
  arbitrary Discord messages. `util/minelatinoMarkdown.ts` escapes first and only
  then applies a fixed replacement set; it was verified against `<script>`,
  `<img onerror>`, `javascript:` links, attribute-breakout quotes and a forged
  placeholder attack (the stash delimiter is a Private Use Area code point,
  `\uE000`, and any the author typed is stripped).
- **Branding.** `branding.accentColor` reaches CSS as `--ml-accent` on `.ml-root`
  (inheriting into the panels) and reaches Vuetify components through their `color`
  prop, which accepts any CSS colour. `branding.backgroundUrl` paints the hero
  behind a scrim built from `--v-theme-surface`, so contrast survives both themes;
  the URL is rejected unless it is `http(s)`/`data:image` and free of quotes,
  parentheses, backslashes and whitespace, because it is interpolated into
  `url("...")`.
- **`es-ES` primary.** `locales/es-ES.yaml` is the only Spanish bundle and the
  renderer's `useI18nSync` matches locale files by exact filename with
  `fallbackLocale: 'en'`. Without the `normalizeLocale` hunk, every Latin American
  tag (`es-MX`, `es-AR`, `es-CO`, ...) silently booted in English.
- **Deferred.** `config.minLauncherVersion` is normalised and exposed but not
  enforced: no launcher version is reachable from the renderer. Enforcing it needs
  a version source, which Phase 5's update manifest provides.

## Phase 6 decisions worth remembering (branding)

- **Real values are the defaults now.** Server `play.minelatino.com` (autoJoin),
  store `https://minelatino.shop`, updates `wordpress` on `https://minelatino.com`
  category `9188`, news channel `596193701622185994` — all baked into
  `FALLBACK_CONFIG` / builder env defaults, so a packaged launcher works without a
  backend for everything except the Discord feed (still needs `DISCORD_BOT_TOKEN`).
- **Brand palette** (sampled from the site/store/logo): accent `#E8A32E`, dark
  tile `#262726`, light tile `#FCFCFC`, network blue `#2E5D9F`, logo-letter
  gradient `#F05000 → #F0B010`. The accent flows through the existing
  `branding.accentColor` → `--ml-accent` pipeline from Phase 2.
- **The logo URL serves WebP despite the `.png` name**
  (`…/Logo-ML-1.png` → RIFF/VP8X bytes). Electron's `nativeImage` sniffs the
  extension and refuses it; `createFromBuffer` also rejects WebP. The committed
  copies (`xmcl-keystone-ui/src/assets/minelatino-logo.png`,
  `xmcl-electron-app/icons/source-logo.png`, 800×800 RGBA8) were produced by
  drawing the base64 `data:` payload onto a `<canvas>` inside a hidden
  `BrowserWindow` and reading back `toDataURL('image/png')`. Never re-fetch the
  URL expecting PNG bytes.
- **Icon pipeline: `node build/brand-icons.mjs`** in `xmcl-electron-app` (pure
  Node, no deps, committed). It decodes `icons/source-logo.png`, trims transparent
  margins, composites the logo (inner box 0.82) onto rounded tiles (radius
  0.225×size, SDF antialiasing) in the two theme colours, and writes all 8 files
  `icons.ts` references: dark/light `.ico` (16–256), `.icns` (32–1024),
  `@256x256.png`, `@tray.png`. To rebrand, replace `source-logo.png` and rerun.
- **Visual sweep — what was rebranded.** Splash (`index.html`), favicon
  (`AppCard.vue`), About page (rewritten: MineLatino logo/name/link, sponsors +
  contributors removed), window & html titles (`HomeLayout`, `browser.html`,
  `migration.html`), server-run log prefix, feedback dialog (channels now come
  from operator config via `useMineLatino()` instead of XMCL's GitHub/Reddit/QQ),
  agent prompts/tools/identity strings, crash prompts, and en + es-ES locale
  renames (XMCL Account → MineLatino Account, XMCL Agent → MineLatino Agent,
  XMCL Together → MineLatino Together). 19 orphaned keys were purged from all 29
  locales with `node scripts/i18n.mjs remove`; a new key
  `MineLatinoHome.openLink` (Open / Abrir) was added.
- **Deliberately still XMCL** (per the user's "XMCL for the code, MineLatino for
  what's visible"): all code identifiers and package names, the `LAUNCHER_NAME`
  data directory (`xmcl`, so installs keep their data), the upstream cloud-service
  *behaviour* behind rebranded labels (XMCL Account backend still talks to
  xmcl.app), the inert appx tiles (30 files), and the other 27 locales, which keep
  upstream copy as translation fallback — only en and es-ES were swept.

## Open inputs — what still blocks manual QA

Nothing below is a code gap; every one is a value only the operator can supply.
Until then the launcher runs on `FALLBACK_CONFIG` and deliberately looks inert.

- **Backend URL.** Deployed: `DEFAULT_BACKEND_URL` is now the live Railway service
  `https://minelatino-production.up.railway.app` (`main/minelatino/config.ts:20`).
  Verified in production — `/health` reports `ok:true` (only `discordBotToken` and
  `releaseManifest` still unconfigured), `/api/config` returns the MineLatino
  branding + `play.minelatino.com`, `/api/updates` returns real WordPress posts and
  `/api/release` answers "up to date". Set `MINELATINO_BACKEND_URL` to point a build
  at staging without recompiling.
- **Server address.** Supplied: `play.minelatino.com` is now the default
  `ML_SERVER_HOST` and the `FALLBACK_CONFIG` host, with `autoJoin: true`, so the
  Play button and `servers.dat` work out of the box.
- **`online-mode`.** `server.properties` decides whether `ML_ALLOW_OFFLINE=true` is
  actually usable. Non-premium players need `online-mode=false` or a hybrid auth
  plugin, otherwise they get "Failed to verify username". This is a server-side
  dependency, not a launcher one — the launcher only warns about it.
- **Tienda.** Supplied: `https://minelatino.shop` is the default `ML_STORE_URL` and
  fallback store. `ML_STORE_TABS` (JSON) still adds the extra windows (Votación,
  Wiki, Discord) if wanted.
- **Actualizaciones.** Supplied: `wordpress` against `https://minelatino.com` with
  category `9188` (the "Network" section) as the default provider; verified live —
  `/api/updates` returned ten real posts. `json` remains available via
  `UPDATES_JSON_URL`.
- **Noticias.** Channel supplied: guild `596140141668597783`, announcements channel
  `596193701622185994` (default `DISCORD_CHANNEL_ID`). What still blocks the feed
  is `DISCORD_BOT_TOKEN` (the only secret), with the bot holding View Channel +
  Read Message History there. `DISCORD_INCLUDE_BOTS=true` is needed if
  announcements are posted by a webhook.
- **`ML_REQUIRED_MODS`.** Empty by default, so the Phase 4 dialog never fires. It
  takes comma-separated Modrinth project ids, slugs or mod ids.
- **Microsoft login smoke test.** The plan's Phase 0 gate — confirming XMCL's
  bundled client ID still authenticates — has not been run, because it needs a
  running launcher and a real account. It is the one risk the fork does not control.
- **GitHub repo for releases.** Done: both repos exist under `FredyGraces20` —
  `MineLatino-Launcher` (public, so GitHub Releases downloads work without auth)
  and `MineLatino-Backend` (private). `ML_GITHUB_OWNER`/`ML_GITHUB_REPO` now default
  to them in `build/electron-builder.config.ts`. **v0.68.1 is published** (seven
  assets) and the Railway manifest is live: `RELEASE_TAG_NAME=v0.68.1` and
  `RELEASE_ASSETS_BASE_URL=…/MineLatino-Launcher/releases/download/v0.68.1`
  (the base must carry the tag — see the Phase 5 publish note). `/health` now
  reports `releaseManifest: true` and the installer download URL returns HTTP 200
  from GitHub's CDN without auth. To ship the next version, rebuild, `gh release
  create v<new>`, and bump both Railway variables to the new tag. The launcher's
  history is a clean orphan root (upstream was a shallow clone that could not be
  pushed).
- **Code signing.** The repository now contains a project-specific SignPath
  workflow and the public policy required for a free SignPath Foundation
  application. Signing remains disabled until SignPath approves MineLatino and
  the repository receives its organization/project variables plus
  `SIGNPATH_API_TOKEN`. Until then, Windows SmartScreen can still warn on first
  run. See `CODE_SIGNING_POLICY.md`.
- **Install / login QA.** The NSIS installer and the Microsoft-login flow have been
  built and typechecked but not executed end-to-end on a clean machine; that is
  operator-side manual QA.
- **Phase 5 is code-complete.** Icons, `minelatino://` scheme, `NOTICE`, the
  electron-builder rebrand, the updater repoint and the `/api/release` manifest are
  all implemented and verified; see "Phase 5 decisions worth remembering".
