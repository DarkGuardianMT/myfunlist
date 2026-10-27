export class ApiError extends Error {
  constructor(message, status = 0, code = 'request_failed', fields = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

let csrfToken = null
let csrfPromise = null
let csrfVersion = 0
let authEpoch = 0
let sessionExpired = null

export function setSessionExpiredHandler(handler) {
  sessionExpired = handler
}

export function advanceAuthEpoch() {
  authEpoch++
}

export function clearCsrfToken() {
  csrfVersion++
  csrfToken = null
  csrfPromise = null
}

export async function refreshCsrfToken() {
  if (!csrfPromise) {
    clearCsrfToken()
    const version = csrfVersion
    csrfPromise = request('/api/v1/auth/csrf', { handleUnauthorized: false })
      .then((data) => {
        if (typeof data?.csrfToken !== 'string' || !data.csrfToken) {
          throw new ApiError('Invalid CSRF response.', 0, 'invalid_response')
        }
        if (version === csrfVersion) csrfToken = data.csrfToken
        return csrfToken
      })
      .finally(() => { if (version === csrfVersion) csrfPromise = null })
  }
  return csrfPromise
}

export async function request(path, options = {}) {
  const { method = 'GET', body, handleUnauthorized = true, timeoutMs = 0, isCurrent } = options
  const requestEpoch = authEpoch
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!['GET', 'HEAD'].includes(method)) {
    headers['X-CSRF-Token'] = csrfToken || await refreshCsrfToken()
  }
  if (requestEpoch !== authEpoch) {
    throw new ApiError('Account changed during request.', 0, 'stale_request')
  }
  if (isCurrent && !isCurrent()) {
    throw new ApiError('Request context changed.', 0, 'stale_request')
  }

  const controller = timeoutMs > 0 ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const timeoutError = () => new ApiError('The request timed out. Please try again.', 0, 'request_timeout')
  try {
    let response
    try {
      response = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(controller ? { signal: controller.signal } : {}),
      })
    } catch {
      if (controller?.signal.aborted) throw timeoutError()
      throw new ApiError('Could not connect to the server. Please try again.', 0, 'network_error')
    }

    if (response.status === 204) return null
    let payload
    try {
      payload = await response.json()
    } catch {
      if (controller?.signal.aborted) throw timeoutError()
      if (response.status === 401 && handleUnauthorized && requestEpoch === authEpoch) {
        sessionExpired?.()
      }
      throw new ApiError('The server returned an unreadable response.', response.status, 'invalid_response')
    }
    if (!response.ok) {
      const error = payload?.error
      const apiError = new ApiError(
        typeof error?.message === 'string' ? error.message : 'The request failed.',
        response.status,
        typeof error?.code === 'string' ? error.code : 'request_failed',
        error?.fields ?? null,
      )
      if (response.status === 401 && handleUnauthorized && requestEpoch === authEpoch) {
        sessionExpired?.()
      }
      throw apiError
    }
    if (!payload || !Object.hasOwn(payload, 'data')) {
      throw new ApiError('The server returned an invalid response.', response.status, 'invalid_response')
    }
    return payload.data
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}
