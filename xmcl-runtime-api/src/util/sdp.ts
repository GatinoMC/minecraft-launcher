/**
 * Deep-link scheme of the launcher, mirroring `LAUNCHER_PROTOCOL` in
 * `xmcl-runtime/constant.ts`. This package cannot import that module (the
 * runtime depends on the API, not the other way round), so the literal is
 * repeated here — change both together.
 */
const LAUNCHER_PROTOCOL = 'minelatino'

export function createOfferLauncherUrl(description: string) {
  return `${LAUNCHER_PROTOCOL}://peer/offer/${description}`
}

export function createAnswerLauncherUrl(description: string) {
  return `${LAUNCHER_PROTOCOL}://peer/answer/${description}`
}

/**
 * The LAN-invite web page is still upstream's: it renders a button that opens
 * the peer URL above in the other player's launcher. MineLatino does not host a
 * replacement, so LAN invites only complete when both players run a build whose
 * registered scheme matches what that page emits. Re-host the page (or drop the
 * multiplayer dialogs) before relying on this.
 */
export function createOfferAppUrl(description: string, inviter: string) {
  return `https://xmcl.app/peer?description=${description}?type=offer?inviter=${inviter}`
}

export function createAnswerAppUrl(description: string, inviter: string) {
  return `https://xmcl.app/peer?description=${description}?type=answer?inviter=${inviter}`
}
