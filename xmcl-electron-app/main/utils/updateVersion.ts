import { gt, valid } from 'semver'

export function isNewerRelease(current: string, available: string): boolean {
  const installed = valid(current), candidate = valid(available)
  return !!installed && !!candidate && gt(candidate, installed)
}
