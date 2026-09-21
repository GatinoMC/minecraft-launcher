/** Sum persisted instance counters while ignoring malformed or negative data. */
export function sumInstancePlaytime(values: unknown[]): number {
  return values.reduce<number>((total, value) => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? total + value
      : total
  ), 0)
}

/** An offline game profile may report time only for its signed-in MineLatino account. */
export function matchesPlaytimeAccount(profileName: string, accountNick: string | undefined): boolean {
  return !!accountNick && /^[A-Za-z0-9_]{3,16}$/.test(profileName)
    && profileName.toLowerCase() === accountNick.toLowerCase()
}
