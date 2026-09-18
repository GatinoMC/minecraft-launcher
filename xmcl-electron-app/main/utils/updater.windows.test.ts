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
    if (await readFile(path).then(() => true).catch(() => false)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${path}`)
}

function runHelper(helperPath: string, configPath: string) {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const powershell = join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return spawn(powershell, [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    configPath,
  ], { stdio: 'pipe' })
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  return await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
}

const describeWindows = process.platform === 'win32' ? describe : describe.skip

describeWindows('Windows ASAR update helper', () => {
  it('verifies, swaps, relaunches and records transactional status', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gatinolauncher-updater-'))
    try {
      const appAsarPath = join(root, 'app.asar')
      const updateAsarPath = join(root, 'pending_update')
      const helperPath = join(root, 'helper.ps1')
      const configPath = join(root, 'helper.json')
      const statusPath = join(root, 'status.json')
      const logPath = join(root, 'update.log')
      const markerPath = join(root, 'relaunched.txt')
      const completedPath = join(root, 'relaunch-complete.txt')
      const relaunchScript = join(root, 'relaunch.cjs')
      const transactionId = 'transaction-success'
      const nextContents = Buffer.from('new signed application')
      const expectedSha256 = createHash('sha256').update(nextContents).digest('hex')

      await writeFile(appAsarPath, 'old application')
      await writeFile(updateAsarPath, nextContents)
      await writeFile(updateAsarPath + '.sha256', expectedSha256)
      await writeFile(updateAsarPath + '.sha256.sig', 'test-signature')
      await writeFile(helperPath, await getWindowsUpdateHelper())
      await writeFile(relaunchScript, String.raw`
const fs = require('fs')
const [marker, status, transaction, completed] = process.argv.slice(2)
fs.writeFileSync(marker, 'ok')
fs.writeFileSync(status, JSON.stringify({ transactionId: transaction, state: 'booted' }))
setTimeout(() => fs.writeFileSync(completed, 'ok'), 500)
`)
      await writeFile(configPath, JSON.stringify({
        parentPid: 2147483647,
        transactionId,
        processPids: [2147483647],
        appAsarPath,
        updateAsarPath,
        checksumPath: updateAsarPath + '.sha256',
        signaturePath: updateAsarPath + '.sha256.sig',
        expectedSha256,
        executable: process.execPath,
        arguments: [relaunchScript, markerPath, statusPath, transactionId, completedPath],
        cwd: root,
        logPath,
        statusPath,
      }))

      expect(await waitForExit(runHelper(helperPath, configPath))).toBe(0)
      await waitForFile(markerPath)
      await waitForFile(completedPath)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect(await readFile(appAsarPath, 'utf8')).toBe('new signed application')
      expect(JSON.parse(await readFile(statusPath, 'utf8'))).toMatchObject({ state: 'relaunched' })
      expect(await readFile(logPath, 'utf8')).toContain('"phase":"relaunched"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it('waits for every launcher process before replacing app.asar', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gatinolauncher-updater-processes-'))
    const blocker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'])
    try {
      const appAsarPath = join(root, 'app.asar')
      const updateAsarPath = join(root, 'pending_update')
      const helperPath = join(root, 'helper.ps1')
      const configPath = join(root, 'helper.json')
      const statusPath = join(root, 'status.json')
      const logPath = join(root, 'update.log')
      const markerPath = join(root, 'relaunched.txt')
      const relaunchScript = join(root, 'relaunch.cjs')
      const transactionId = 'transaction-process-wait'
      const nextContents = Buffer.from('new application after every process exits')
      const expectedSha256 = createHash('sha256').update(nextContents).digest('hex')

      await writeFile(appAsarPath, 'old application')
      await writeFile(updateAsarPath, nextContents)
      await writeFile(updateAsarPath + '.sha256', expectedSha256)
      await writeFile(updateAsarPath + '.sha256.sig', 'test-signature')
      await writeFile(helperPath, await getWindowsUpdateHelper())
      await writeFile(relaunchScript, String.raw`
const fs = require('fs')
const [marker, status, transaction] = process.argv.slice(2)
fs.writeFileSync(marker, 'ok')
fs.writeFileSync(status, JSON.stringify({ transactionId: transaction, state: 'booted' }))
`)
      await writeFile(configPath, JSON.stringify({
        parentPid: 2147483647,
        transactionId,
        processPids: [2147483647, blocker.pid],
        appAsarPath,
        updateAsarPath,
        checksumPath: updateAsarPath + '.sha256',
        signaturePath: updateAsarPath + '.sha256.sig',
        expectedSha256,
        executable: process.execPath,
        arguments: [relaunchScript, markerPath, statusPath, transactionId],
        cwd: root,
        logPath,
        statusPath,
      }))

      const startedAt = Date.now()
      const exitCode = await waitForExit(runHelper(helperPath, configPath))
      const failureDetail = exitCode === 0
        ? ''
        : await readFile(statusPath, 'utf8').catch(() => 'missing status')
      expect(exitCode, failureDetail).toBe(0)
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1200)
      await waitForFile(markerPath)
      expect(await readFile(appAsarPath, 'utf8')).toBe('new application after every process exits')
      expect(await readFile(logPath, 'utf8')).toContain('"phase":"waiting-for-exit"')
    } finally {
      blocker.kill()
      await new Promise((resolve) => setTimeout(resolve, 500))
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it('restores the previous archive when the updated launcher never confirms boot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gatinolauncher-updater-rollback-'))
    try {
      const appAsarPath = join(root, 'app.asar')
      const updateAsarPath = join(root, 'pending_update')
      const helperPath = join(root, 'helper.ps1')
      const configPath = join(root, 'helper.json')
      const statusPath = join(root, 'status.json')
      const logPath = join(root, 'update.log')
      const recoveryMarkerPath = join(root, 'recovery-relaunched.txt')
      const relaunchScript = join(root, 'relaunch.cjs')
      const transactionId = 'transaction-rollback'
      const nextContents = Buffer.from('update that cannot boot')
      const expectedSha256 = createHash('sha256').update(nextContents).digest('hex')

      await writeFile(appAsarPath, 'known good application')
      await writeFile(updateAsarPath, nextContents)
      await writeFile(updateAsarPath + '.sha256', expectedSha256)
      await writeFile(updateAsarPath + '.sha256.sig', 'test-signature')
      await writeFile(helperPath, await getWindowsUpdateHelper())
      await writeFile(relaunchScript, String.raw`
const fs = require('fs')
const [recoveryMarker] = process.argv.slice(2)
if (process.env.MINELATINO_UPDATE_TRANSACTION_ID) setTimeout(() => {}, 5000)
else fs.writeFileSync(recoveryMarker, 'ok')
`)
      await writeFile(configPath, JSON.stringify({
        parentPid: 2147483647,
        processPids: [2147483647],
        transactionId,
        bootConfirmationTimeoutMs: 300,
        appAsarPath,
        updateAsarPath,
        checksumPath: updateAsarPath + '.sha256',
        signaturePath: updateAsarPath + '.sha256.sig',
        expectedSha256,
        executable: process.execPath,
        arguments: [relaunchScript, recoveryMarkerPath],
        cwd: root,
        logPath,
        statusPath,
      }))

      expect(await waitForExit(runHelper(helperPath, configPath))).toBe(1)
      await waitForFile(recoveryMarkerPath)
      expect(await readFile(appAsarPath, 'utf8')).toBe('known good application')
      expect(JSON.parse(await readFile(statusPath, 'utf8'))).toMatchObject({
        transactionId,
        state: 'failed',
      })
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)
})
