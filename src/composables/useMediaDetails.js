import { onScopeDispose, readonly, ref, toValue, watch } from 'vue'
import { getMediaKey, isSupportedMediaIdentity } from '../domain/mediaIdentity.js'
import { ApiError } from '../services/apiClient.js'
import { fetchMediaDetail } from '../services/mediaDetails.js'

export const MEDIA_DETAIL_CACHE_TTL = 5 * 60 * 1000
export const MEDIA_DETAIL_CACHE_LIMIT = 50
const cache = new Map()
const pending = new Map()
let cacheGeneration = 0

export function clearMediaDetailCache() {
  cacheGeneration++
  cache.clear()
  pending.clear()
}

async function loadPublicDetail(identity) {
  const key = getMediaKey(identity)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key)
    cache.set(key, cached)
    return cached.detail
  }
  cache.delete(key)
  if (pending.has(key)) return pending.get(key)

  const generation = cacheGeneration
  const request = fetchMediaDetail(identity)
    .then((detail) => {
      if (generation !== cacheGeneration) return detail
      const now = Date.now()
      for (const [cachedKey, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(cachedKey)
      }
      cache.set(key, { detail, expiresAt: now + MEDIA_DETAIL_CACHE_TTL })
      while (cache.size > MEDIA_DETAIL_CACHE_LIMIT) cache.delete(cache.keys().next().value)
      return detail
    })
    .finally(() => { if (pending.get(key) === request) pending.delete(key) })
  pending.set(key, request)
  return request
}

export function useMediaDetails(identity) {
  const detail = ref(null)
  const status = ref('loading')
  const error = ref(null)
  let requestGeneration = 0

  async function load() {
    const generation = ++requestGeneration
    detail.value = null
    error.value = null
    status.value = 'loading'
    const media = toValue(identity)
    if (!isSupportedMediaIdentity(media)) {
      status.value = 'not-found'
      return
    }
    const requestedIdentity = { source: media.source, mediaType: media.mediaType, sourceId: media.sourceId }
    try {
      const result = await loadPublicDetail(requestedIdentity)
      if (generation !== requestGeneration) return
      detail.value = result
      status.value = 'success'
    } catch (cause) {
      if (generation !== requestGeneration) return
      error.value = cause
      status.value = cause instanceof ApiError && cause.status === 404 ? 'not-found'
        : cause instanceof ApiError && cause.status === 429 ? 'rate-limited'
          : cause instanceof ApiError && cause.code === 'provider_unavailable' ? 'provider-unavailable' : 'error'
    }
  }

  watch(() => {
    const media = toValue(identity)
    return [media?.mediaType, media?.source, media?.sourceId]
  }, load, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { requestGeneration++ })

  return { detail: readonly(detail), status: readonly(status), error: readonly(error), retry: load }
}
