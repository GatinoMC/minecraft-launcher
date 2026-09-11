import { existsSync } from 'fs'
import { posix } from 'path'

export function getOzonePlatform(env: NodeJS.ProcessEnv, exists = existsSync): 'auto' | 'x11' {
  if (!env.DISPLAY) return 'auto'

  const waylandDisplay = env.WAYLAND_DISPLAY
  if (!waylandDisplay) return 'x11'

  // DISPLAY/XDG paths always belong to the Linux guest, even when this helper
  // is exercised by cross-platform CI on Windows.
  const socket = posix.isAbsolute(waylandDisplay)
    ? waylandDisplay
    : env.XDG_RUNTIME_DIR
      ? posix.join(env.XDG_RUNTIME_DIR, waylandDisplay)
      : undefined

  return socket && exists(socket) ? 'auto' : 'x11'
}
