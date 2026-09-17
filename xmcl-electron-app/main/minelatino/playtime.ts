/** Sum persisted instance counters while ignoring malformed or negative data. */
export function sumInstancePlaytime(values: unknown[]): number {
  return values.reduce<number>((total, value) => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? total + value
      : total
  ), 0)
}
