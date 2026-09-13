import { generateKeyPairSync, sign } from 'crypto'
import { describe, expect, it } from 'vitest'
import { verifyAsarChecksumSignature } from './updateSignature'

describe(verifyAsarChecksumSignature.name, () => {
  it('accepts a valid Ed25519 signature for the checksum', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const checksum = 'ab'.repeat(32)
    const signature = sign(null, Buffer.from(checksum, 'ascii'), privateKey).toString('base64')

    const exported = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(verifyAsarChecksumSignature(checksum, signature, exported)).toBe(true)
  })

  it('rejects tampering and malformed signatures', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const checksum = 'ab'.repeat(32)
    const signature = sign(null, Buffer.from(checksum, 'ascii'), privateKey).toString('base64')
    const exported = publicKey.export({ type: 'spki', format: 'pem' }).toString()

    expect(verifyAsarChecksumSignature('cd'.repeat(32), signature, exported)).toBe(false)
    expect(verifyAsarChecksumSignature(checksum, 'not-a-signature', exported)).toBe(false)
  })
})
