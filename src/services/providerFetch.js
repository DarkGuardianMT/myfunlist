const PROVIDER_TIMEOUT_MS = 8000

export async function fetchProvider(url, options = {}, fetchImpl = fetch, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
