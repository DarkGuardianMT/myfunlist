import { request } from './apiClient.js'
import { readLegacyLibrary } from './legacyLibrary.js'

const COMPLETED_PREFIX = 'myfunlist_import_completed_'
const MAX_ITEMS = 200
const MAX_BYTES = 120 * 1024
const encoder = new TextEncoder()

function storage() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function legacyCandidate() {
  return readLegacyLibrary()
}

export function importFingerprint(items) {
  const value = JSON.stringify(items.map(({ media, userMedia }) => [
    media.source, media.mediaType, media.sourceId,
    userMedia.status, userMedia.rating, userMedia.addedAt,
  ]))
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${items.length}-${(hash >>> 0).toString(16)}`
}

export function isImportCompleted(userId, items) {
  return storage()?.getItem(`${COMPLETED_PREFIX}${userId}`) === importFingerprint(items)
}

export function markImportCompleted(userId, items) {
  storage()?.setItem(`${COMPLETED_PREFIX}${userId}`, importFingerprint(items))
}

export function toImportItem(item, importTimestamp) {
  const { media, userMedia } = item
  return {
    media: { source: media.source, mediaType: media.mediaType, sourceId: media.sourceId },
    userMedia: {
      status: userMedia.status,
      rating: userMedia.rating,
      // Een ontbrekende oude datum werd ooit als Unix epoch opgeslagen.
      addedAt: userMedia.addedAt === '1970-01-01T00:00:00.000Z'
        ? importTimestamp : userMedia.addedAt,
    },
  }
}

export function importChunks(items) {
  const chunks = []
  let chunk = []
  for (const item of items) {
    const candidate = [...chunk, item]
    if (candidate.length > MAX_ITEMS || encoder.encode(JSON.stringify({ items: candidate })).length > MAX_BYTES) {
      if (!chunk.length) throw new Error('A saved item is too large to import.')
      chunks.push(chunk)
      chunk = [item]
      if (encoder.encode(JSON.stringify({ items: chunk })).length > MAX_BYTES) {
        throw new Error('A saved item is too large to import.')
      }
    } else {
      chunk = candidate
    }
  }
  if (chunk.length) chunks.push(chunk)
  return chunks
}

export async function importLegacyItems(items, onProgress = () => {}) {
  const timestamp = new Date().toISOString()
  const chunks = importChunks(items.map((item) => toImportItem(item, timestamp)))
  const summary = { total: items.length, imported: 0, existing: 0, duplicate: 0, failed: 0, pending: items.length }
  for (const chunk of chunks) {
    try {
      const result = await request('/api/v1/library/import', { method: 'POST', body: { items: chunk } })
      for (const status of ['imported', 'existing', 'duplicate', 'failed']) {
        summary[status] += Number(result.summary?.[status] ?? 0)
      }
      summary.pending -= chunk.length
      onProgress({ ...summary })
    } catch (error) {
      return { summary, error }
    }
  }
  return { summary, error: null }
}
