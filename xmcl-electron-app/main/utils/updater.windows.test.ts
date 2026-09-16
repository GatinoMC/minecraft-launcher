import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

async function getWindowsUpdateHelper(): Promise<string> {
  const updaterSource = await readFile(join(__dirname, 'updater.ts'), 'utf8')
  const match = /const WINDOWS_UPDATE_HELPER = String\.raw`([\s\S]*?)`\r?\n\r?\n\/\*\*/.exec(
    updaterSource,
  )
  if (!match) throw new Error('Unable to locate embedded Windows update helper')
  return match[1]
}

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (
      await readFile(path)
        .then(() => true)
        .catch(() => false)
    )
      return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${path}`)
}

describe('Windows ASAR update helper', () => {
  it('verifies, swaps, relaunches and records transactional status', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gatinolauncher-updater-'))
    try {
      const appAsarPath = join(root, 'app.asar')
      const updateAsarPath = join(root, 'pending_update')
      const helperPath = join(root, 'helper.cjs')
      const configPath = join(root, 'helper.json')
      const statusPath = join(root, 'status.json')
      const logPath = join(root, 'update.log')
      const markerPath = join(root, 'relaunched.txt')
      const completedPath = join(root, 'relaunch-complete.txt')
      const nextContents = Buffer.from('new signed application')
      const expectedSha256 = createHash('sha256').update(nextContents).digest('hex')

      await writeFile(appAsarPath, 'old application')
      await writeFile(updateAsarPath, nextContents)
      await writeFile(updateAsarPath + '.sha256', expectedSha256)
      await writeFile(updateAsarPath + '.sha256.sig', 'test-signature')
      await writeFile(helperPath, await getWindowsUpdateHelper())
      await writeFile(
        configPath,
        JSON.stringify({
          parentPid: 2147483647,
          processPids: [2147483647],
          appAsarPath,
          updateAsarPath,
          checksumPath: updateAsarPath + '.sha256',
          signaturePath: updateAsarPath + '.sha256.sig',
          expectedSha256,
          executable: process.execPath,
          arguments: [
            '-e',
            `const fs=require('fs'); fs.writeFileSync(${JSON.stringify(markerPath)}, 'ok'); setTimeout(() => fs.writeFileSync(${JSON.stringify(completedPath)}, 'ok'), 2200)`,
          ],
          cwd: root,
          logPath,
          statusPath,
        }),
      )

      const helper = spawn(process.execPath, [helperPath, configPath], { stdio: 'pipe' })
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        helper.once('error', reject)
        helper.once('exit', resolve)
      })

      expect(exitCode).toBe(0)
      await waitForFile(markerPath)
      await waitForFile(completedPath)
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(await readFile(appAsarPath, 'utf8')).toBe('new signed application')
      expect(JSON.parse(await readFile(statusPath, 'utf8'))).toMatchObject({ state: 'relaunched' })
      expect(await readFile(logPath, 'utf8')).toContain('"phase":"relaunched"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('waits for every process from the launcher before replacing app.asar', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gatinolauncher-updater-processes-'))
    const blocker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 500)'])
    try {
      const appAsarPath = join(root, 'app.asar')
      const updateAsarPath = join(root, 'pending_update')
      const helperPath = join(root, 'helper.cjs')
      const configPath = join(root, 'helper.json')
      const statusPath = join(root, 'status.json')
      const logPath = join(root, 'update.log')
      const markerPath = join(root, 'relaunched.txt')
      const nextContents = Buffer.from('new application after every process exits')
      const expectedSha256 = createHash('sha256').update(nextContents).digest('hex')

      await writeFile(appAsarPath, 'old application')
      await writeFile(updateAsarPath, nextContents)
      await writeFile(updateAsarPath + '.sha256', expectedSha256)
      await writeFile(updateAsarPath + '.sha256.sig', 'test-signature')
      await writeFile(helperPath, await getWindowsUpdateHelper())
      await writeFile(
        configPath,
        JSON.stringify({
          parentPid: 2147483647,
          processPids: [2147483647, blocker.pid],
          appAsarPath,
          updateAsarPath,
          checksumPath: updateAsarPath + '.sha256',
          signaturePath: updateAsarPath + '.sha256.sig',
          expectedSha256,
          executable: process.execPath,
          arguments: [
            '-e',
            `require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'ok'); setTimeout(() => {}, 2200)`,
          ],
          cwd: root,
          logPath,
          statusPath,
        }),
      )

      const startedAt = Date.now()
      const helper = spawn(process.execPath, [helperPath, configPath], { stdio: 'pipe' })
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        helper.once('error', reject)
        helper.once('exit', resolve)
      })

      expect(exitCode).toBe(0)
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(400)
      await waitForFile(markerPath)
      expect(await readFile(appAsarPath, 'utf8')).toBe('new application after every process exits')
      expect(await readFile(logPath, 'utf8')).toContain('"phase":"waiting-for-exit"')
    } finally {
      blocker.kill()
      await new Promise((resolve) => setTimeout(resolve, 500))
      await rm(root, { recursive: true, force: true })
    }
  })
})
