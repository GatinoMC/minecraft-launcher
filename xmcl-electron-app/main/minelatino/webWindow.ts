import { BrowserWindow } from 'electron'

/**
 * Owns the extra windows the home screen opens (Tienda, Votar, Wiki...).
 *
 * A real `BrowserWindow` is used instead of an iframe or the in-launcher
 * `<webview>`: stores send `X-Frame-Options`/`frame-ancestors` and would render
 * blank, and a top-level window is also what lets a payment redirect and its
 * 3-D Secure iframe work. The window keeps its normal OS frame on purpose — a
 * frameless window would have no way to close a third-party page.
 */

export interface MineLatinoWebWindowEntry {
  id: string
  title: string
  url: string
}

export interface MineLatinoWebWindowOptions {
  id: string
  title?: string
  url: string
  /** Stylesheet injected on every navigation; see the runtime-api type. */
  injectCss?: string
}

/**
 * Stores commonly refuse user agents containing "Electron". This is a plain
 * desktop Chrome string, the same approach `controllers/optifine.ts` uses.
 */
const BROWSER_USER_AGENT
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'

const WIDTH = 1200
const HEIGHT = 800
const MIN_WIDTH = 800
const MIN_HEIGHT = 600

export class MineLatinoWebWindows {
  readonly #windows = new Map<string, BrowserWindow>()

  constructor(
    private readonly log: (message: string) => void,
    private readonly onChange: (windows: MineLatinoWebWindowEntry[]) => void,
    /** Handed off for schemes a browser window cannot render (mailto:, discord:...). */
    private readonly openExternal: (url: string) => Promise<unknown>,
  ) {}

  list(): MineLatinoWebWindowEntry[] {
    return [...this.#windows.entries()].map(([id, win]) => ({
      id,
      title: win.webContents.getTitle() || id,
      url: win.webContents.getURL(),
    }))
  }

  open(options: MineLatinoWebWindowOptions) {
    const existing = this.#windows.get(options.id)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return
    }

    const win = new BrowserWindow({
      title: options.title || options.id,
      width: WIDTH,
      height: HEIGHT,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      autoHideMenuBar: true,
      webPreferences: {
        // Third-party content: no preload, no node, isolated context.
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
    win.webContents.userAgent = BROWSER_USER_AGENT
    win.removeMenu()

    this.#windows.set(options.id, win)

    const emitChange = () => this.onChange(this.list())
    win.on('closed', () => {
      this.#windows.delete(options.id)
      emitChange()
    })
    // Titles and URLs change while the player navigates a store, so the list the
    // launcher shows stays in step.
    win.webContents.on('page-title-updated', emitChange)
    win.webContents.on('did-navigate', emitChange)
    win.webContents.on('did-navigate-in-page', emitChange)

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        // Payment providers and social logins open popups; letting Electron
        // create a child window is what makes them complete.
        return { action: 'allow' }
      }
      void this.openExternal(url).catch(() => undefined)
      return { action: 'deny' }
    })

    if (options.injectCss) {
      // Re-inject on every `dom-ready`: navigating inside the site builds a
      // fresh document, and a stylesheet inserted once only lives in the old
      // one. Failures (e.g. the window closed mid-injection) are harmless.
      const css = options.injectCss
      win.webContents.on('dom-ready', () => {
        win.webContents.insertCSS(css).catch(() => undefined)
      })
    }

    emitChange()
    win.loadURL(options.url).catch((error: Error) => {
      // Electron renders its own error page; logging is enough for us.
      this.log(`Failed to load ${options.url} in "${options.id}": ${error.message}`)
    })
  }

  close(id: string) {
    const win = this.#windows.get(id)
    if (win && !win.isDestroyed()) win.close()
    this.#windows.delete(id)
  }

  closeAll() {
    // Snapshot and clear first: `close()` removes the entry from the map, and
    // mutating a Map while iterating it is not something a reader should have
    // to reason about.
    const windows = Array.from(this.#windows.values())
    this.#windows.clear()
    for (const win of windows) {
      if (!win.isDestroyed()) win.close()
    }
  }
}
