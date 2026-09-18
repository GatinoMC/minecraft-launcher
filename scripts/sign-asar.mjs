import { createPrivateKey, sign } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve(process.argv[2] || 'xmcl-electron-app/build/output')
const privateKeyPem = process.env.ASAR_SIGNING_PRIVATE_KEY

if (!privateKeyPem) throw new Error('ASAR_SIGNING_PRIVATE_KEY is required')

const privateKey = createPrivateKey(privateKeyPem)
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('ASAR signing key must be Ed25519')

const checksumFiles = (await readdir(outputDirectory)).filter(name =>
  /^(?:app-.+\.asar|minelatino-.+-win32-x64\.exe)\.sha256$/.test(name),
)
if (checksumFiles.length === 0) throw new Error(`No release checksum files found in ${outputDirectory}`)

for (const name of checksumFiles) {
  const checksum = (await readFile(resolve(outputDirectory, name), 'utf8')).trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error(`Invalid checksum in ${name}`)
  const signature = sign(null, Buffer.from(checksum, 'ascii'), privateKey).toString('base64')
  await writeFile(resolve(outputDirectory, `${name}.sig`), `${signature}\n`, { mode: 0o600 })
  console.log(`Signed ${name}`)
}
