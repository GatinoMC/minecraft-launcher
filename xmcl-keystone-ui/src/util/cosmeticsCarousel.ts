export function wrapCarouselIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return (index + delta % length + length) % length
}

export function retainCarouselItemIndex<T extends { id: string }>(items: T[], currentId?: string): number {
  if (!currentId) return 0
  const index = items.findIndex(item => item.id === currentId)
  return index >= 0 ? index : 0
}
