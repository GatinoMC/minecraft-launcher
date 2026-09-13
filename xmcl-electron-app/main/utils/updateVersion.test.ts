import { expect, test } from 'vitest'
import { isNewerRelease } from './updateVersion'

test('offers newer versions and never downgrades a separately distributed release', () => {
  expect(isNewerRelease('0.68.64', 'v0.68.63')).toBe(false)
  expect(isNewerRelease('v0.68.64', '0.68.64')).toBe(false)
  expect(isNewerRelease('0.68.64', 'v0.68.65')).toBe(true)
  expect(isNewerRelease('0.68.9', 'v0.68.10')).toBe(true)
  expect(isNewerRelease('0.68.64', 'v0.68.64-beta.1')).toBe(false)
  expect(isNewerRelease('0.68.64-beta.1', '0.68.64')).toBe(true)
  expect(isNewerRelease('0.68.64', 'invalid')).toBe(false)
})
