import { createPublicKey, verify } from 'crypto'

export const ASAR_UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5D3LdWco7AMlwFmC7n3OiWrq7+q4UUkxiIWQAku4xPY=
-----END PUBLIC KEY-----`

export function verifyAsarChecksumSignature(
  checksum: string,
  signatureBase64: string,
  publicKey = ASAR_UPDATE_PUBLIC_KEY,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(checksum)) return false
  try {
    const signature = Buffer.from(signatureBase64.trim(), 'base64')
    if (signature.length !== 64) return false
    return verify(null, Buffer.from(checksum, 'ascii'), createPublicKey(publicKey), signature)
  } catch {
    return false
  }
}
