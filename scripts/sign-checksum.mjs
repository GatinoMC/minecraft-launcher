import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const checksumFile = resolve(process.argv[2] || '')
const privateKeyPem = process.env.ASAR_SIGNING_PRIVATE_KEY

if (!process.argv[2]) throw new Error('Pass the checksum file to sign')
if (!privateKeyPem) throw new Error('ASAR_SIGNING_PRIVATE_KEY is required')

const checksum = (await readFile(checksumFile, 'utf8')).trim().toLowerCase()
if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error(`Invalid SHA-256 checksum in ${checksumFile}`)
const privateKey = createPrivateKey(privateKeyPem)
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Signing key must be Ed25519')

const payload = Buffer.from(checksum, 'ascii')
const signature = sign(null, payload, privateKey)
if (!verify(null, payload, createPublicKey(privateKey), signature)) throw new Error('Generated signature did not verify')
await writeFile(`${checksumFile}.sig`, `${signature.toString('base64')}\n`, { mode: 0o600 })
console.log(`Signed ${checksumFile}`)
