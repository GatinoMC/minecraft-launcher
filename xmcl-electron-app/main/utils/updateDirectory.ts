import { mkdtemp, rmdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Check the directory where the helper will swap files after Electron exits.
 * Opening the running app.asar for writing fails on Windows even with full
 * directory permissions, because Electron holds the archive open. */
export async function probeUpdateDirectory(appAsarPath: string): Promise<void> {
  const probe = await mkdtemp(join(dirname(appAsarPath), '.minelatino-update-'))
  await rmdir(probe)
}
