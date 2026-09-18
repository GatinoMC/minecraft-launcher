import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createGunzip } from 'node:zlib'

const publicKey = createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5D3LdWco7AMlwFmC7n3OiWrq7+q4UUkxiIWQAku4xPY=
-----END PUBLIC KEY-----`)

const outputDirectory = resolve(process.argv[2] || 'xmcl-electron-app/build/output')

async function sha256(readable) {
  const hash = createHash('sha256')
  for await (const chunk of readable) hash.update(chunk)
  return hash.digest('hex')
}

const checksumFiles = (await readdir(outputDirectory)).filter(name =>
  /^(?:app-.+\.asar|minelatino-.+-win32-x64\.exe)\.sha256$/.test(name),
)
if (checksumFiles.length === 0) throw new Error(`No release checksum files found in ${outputDirectory}`)

for (const checksumName of checksumFiles) {
  const asarName = checksumName.slice(0, -'.sha256'.length)
  const expected = (await readFile(resolve(outputDirectory, checksumName), 'utf8')).trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid checksum in ${checksumName}`)

  const actual = await sha256(createReadStream(resolve(outputDirectory, asarName)))
  if (actual !== expected) throw new Error(`${asarName} does not match its checksum`)

  const signature = Buffer.from(
    (await readFile(resolve(outputDirectory, `${checksumName}.sig`), 'utf8')).trim(),
    'base64',
  )
  if (signature.length !== 64 || !verify(null, Buffer.from(expected, 'ascii'), publicKey, signature)) {
    throw new Error(`${checksumName} does not have a valid GatinoLauncher signature`)
  }

  if (asarName.endsWith('.asar')) {
    const gzipName = `${asarName}.gz`
    const gzipHash = await sha256(createReadStream(resolve(outputDirectory, gzipName)).pipe(createGunzip()))
    if (gzipHash !== expected) throw new Error(`${gzipName} does not expand to the signed ASAR`)
  }

  console.log(`Verified ${asarName}`)
}
