/** Web editor uses a centered, Y-up player measured in Minecraft blocks. */
export const PET_EDITOR_ANCHOR = [1.15, 1, 0] as const

/** skinview3d uses centered Y-up coordinates measured in model pixels. */
export function petPreviewPosition(unitsPerBlock = 16): [number, number, number] {
  return [-PET_EDITOR_ANCHOR[0] * unitsPerBlock, PET_EDITOR_ANCHOR[1] * unitsPerBlock, PET_EDITOR_ANCHOR[2] * unitsPerBlock]
}
