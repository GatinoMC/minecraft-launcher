import { spawn } from 'node:child_process'
import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished, test } from 'vitest'
import { probeUpdateDirectory } from './updateDirectory'

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'minelatino-update-access-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const archive = join(directory, 'app.asar')
  await writeFile(archive, 'existing launcher')
  return { directory, archive }
}

test('checks the installation directory without modifying the installed archive', async () => {
  const { directory, archive } = await fixture()
  await probeUpdateDirectory(archive)
  expect(await readFile(archive, 'utf8')).toBe('existing launcher')
  expect(await readdir(directory)).toEqual(['app.asar'])
})

test('reports a directory failure instead of claiming the update can start', async () => {
  const { directory } = await fixture()
  await expect(probeUpdateDirectory(join(directory, 'missing', 'app.asar'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test.skipIf(process.platform !== 'win32')('accepts a writable directory while Windows denies writes to the running archive', async () => {
  const { archive } = await fixture()
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$lock = [IO.File]::Open($env:MINELATINO_TEST_ARCHIVE, 'Open', 'Read', 'Read'); [Console]::WriteLine('locked'); [Console]::ReadLine() | Out-Null; $lock.Dispose()"],
  { windowsHide: true, env: { ...process.env, MINELATINO_TEST_ARCHIVE: archive }, stdio: 'pipe' })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('File lock startup timed out')), 10000)
      child.once('error', error => { clearTimeout(timeout); reject(error) })
      child.stdout.once('data', () => { clearTimeout(timeout); resolve() })
    })
    // This is the previous permission check. Windows rejects it with EBUSY.
    await expect(open(archive, 'a')).rejects.toMatchObject({ code: 'EBUSY' })
    await expect(probeUpdateDirectory(archive)).resolves.toBeUndefined()
    expect(await readFile(archive, 'utf8')).toBe('existing launcher')
  } finally {
    child.stdin.end('\n')
    await exited
  }
}, 15000)
