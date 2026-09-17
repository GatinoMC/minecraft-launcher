import { MicrosoftMinecraftXboxLoginError } from '@xmcl/user'

export function isAccountSuspendedError(error: unknown): error is MicrosoftMinecraftXboxLoginError {
  if (!(error instanceof MicrosoftMinecraftXboxLoginError) || error.status !== 403) return false
  try {
    return JSON.parse(error.body)?.details?.reason === 'ACCOUNT_SUSPENDED'
  } catch {
    return false
  }
}

export function isUserCanceledError(error: unknown) {
  const message = (error as Error | undefined)?.message
  return typeof message === 'string' &&
    (/\buser_cancel(?:led|ed)\b/.test(message) ||
      message === 'Microsoft authorization window was closed.')
}

export function isNetworkError(error: unknown) {
  let current = error as { errorCode?: unknown; message?: unknown; cause?: unknown } | undefined
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.errorCode === 'network_error' ||
      (typeof current.message === 'string' && /\bnetwork_error\b/.test(current.message))) {
      return true
    }
    current = current.cause as typeof current
  }
  return false
}

/** Failures that should be retried without marking the saved account invalid. */
export function isTransientMicrosoftRefreshError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return true
  let current = error as {
    name?: unknown
    message?: unknown
    status?: unknown
    retryable?: unknown
    cause?: unknown
    exception?: { status?: unknown; retryable?: unknown }
  } | undefined
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.name === 'AbortError' || current.retryable === true || current.exception?.retryable === true) return true
    const status = Number(current.status ?? current.exception?.status)
    if (status === 408 || status === 425 || status === 429 || status >= 500) return true
    if (typeof current.message === 'string' &&
      /\b(network_error|temporarily_unavailable|server_error|status code: (?:408|425|429|5\d\d))\b/i.test(current.message)) {
      return true
    }
    current = current.cause as typeof current
  }
  return isNetworkError(error)
}
