import { isValidStatus, PERSONAL_RATINGS } from '../domain/libraryMedia.js'
import { request } from './apiClient.js'
import { getMediaKey } from './legacyLibrary.js'

export { getMediaKey }

const itemsByKey = new Map()
let repositoryVersion = 0

export function clearLibraryRepository() {
  repositoryVersion++
  itemsByKey.clear()
}

function remember(item) {
  if (item?.userMedia?.id && item?.userMedia?.mediaKey) {
    itemsByKey.set(item.userMedia.mediaKey, item)
  }
  return item
}

export async function getLibrary() {
  const version = repositoryVersion
  const items = await request('/api/v1/library')
  if (!Array.isArray(items)) throw new Error('Invalid Library response')
  if (version === repositoryVersion) {
    itemsByKey.clear()
    items.forEach(remember)
  }
  return items
}

export async function hasItem(media) {
  const key = typeof media === 'string' ? media : getMediaKey(media)
  return Boolean(key && itemsByKey.has(key))
}

export async function addItem(media) {
  const version = repositoryVersion
  const key = getMediaKey(media)
  if (!key) throw new Error('Invalid media type or identity')
  const result = await request('/api/v1/library', {
    method: 'POST',
    body: { media: { source: media.source, mediaType: media.mediaType, sourceId: media.sourceId } },
  })
  if (version === repositoryVersion) remember(result.item)
  return result
}

function entryFor(key) {
  return itemsByKey.get(key) || null
}

export async function updateStatus(mediaKey, status) {
  const version = repositoryVersion
  const item = entryFor(mediaKey)
  if (!item) return null
  if (!isValidStatus(item.media.mediaType, status)) throw new Error('Invalid media status')
  const updated = await request(`/api/v1/library/${encodeURIComponent(item.userMedia.id)}`, {
    method: 'PATCH', body: { status },
  })
  return version === repositoryVersion ? remember(updated) : updated
}

export async function updateRating(mediaKey, rating) {
  const version = repositoryVersion
  if (rating !== null && !PERSONAL_RATINGS.includes(rating)) throw new Error('Invalid personal rating')
  const item = entryFor(mediaKey)
  if (!item) return null
  const updated = await request(`/api/v1/library/${encodeURIComponent(item.userMedia.id)}`, {
    method: 'PATCH', body: { rating },
  })
  return version === repositoryVersion ? remember(updated) : updated
}

export async function removeItem(mediaKey, { isCurrent = () => true, expectedId } = {}) {
  const version = repositoryVersion
  const item = entryFor(mediaKey)
  if (!item) return false
  if (expectedId && item.userMedia.id !== expectedId) return false
  await request(`/api/v1/library/${encodeURIComponent(item.userMedia.id)}`, {
    method: 'DELETE', timeoutMs: 11000,
    isCurrent: () => version === repositoryVersion && entryFor(mediaKey)?.userMedia.id === item.userMedia.id && isCurrent(),
  })
  if (version === repositoryVersion) itemsByKey.delete(mediaKey)
  return true
}
