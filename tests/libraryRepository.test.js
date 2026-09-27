import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addItem, clearLibraryRepository, getLibrary, getMediaKey, hasItem,
  removeItem, updateRating, updateStatus,
} from '../src/services/libraryRepository.js'
import { clearCsrfToken } from '../src/services/apiClient.js'
import { getVisibleLibraryItems } from '../src/utils/libraryDisplay.js'

const media = [
  { source: 'google-books', mediaType: 'book', sourceId: 'book-1', title: 'Book' },
  { source: 'tmdb', mediaType: 'movie', sourceId: '42', title: 'Movie' },
  { source: 'tmdb', mediaType: 'tv', sourceId: '42', title: 'Show' },
  { source: 'rawg', mediaType: 'game', sourceId: '42', title: 'Game' },
]

function item(entry, id) {
  return { media: entry, userMedia: {
    id: String(id), mediaKey: getMediaKey(entry), status: 'completed',
    rating: null, addedAt: '2026-01-01T00:00:00Z',
  } }
}

function json(data, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => ({ data }) }
}

test('REST Library loads four types, keeps media identity and uses string entry IDs', async () => {
  clearLibraryRepository()
  clearCsrfToken()
  const calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    if (path.endsWith('/csrf')) return json({ csrfToken: 'csrf' })
    if (path === '/api/v1/library' && options.method === 'GET') {
      return json(media.map((entry, index) => item(entry, index + 100)))
    }
    if (options.method === 'PATCH') return json({ ...item(media[3], 103), userMedia: {
      ...item(media[3], 103).userMedia, ...JSON.parse(options.body),
    } })
    if (options.method === 'DELETE') return { status: 204, ok: true }
    throw new Error('Unexpected request')
  }
  const loaded = await getLibrary()
  assert.deepEqual(loaded.map((entry) => entry.media.mediaType), ['book', 'movie', 'tv', 'game'])
  assert.equal(getMediaKey(media[1]), 'tmdb:movie:42')
  assert.equal(getMediaKey(media[2]), 'tmdb:tv:42')
  assert.equal(await hasItem(media[3]), true)
  await updateStatus(getMediaKey(media[3]), 'playing')
  await updateRating(getMediaKey(media[3]), 8.5)
  assert.equal(await removeItem(getMediaKey(media[3])), true)
  assert.equal(await hasItem(media[3]), false)
  assert.deepEqual(calls.filter((call) => ['PATCH', 'DELETE'].includes(call.options.method))
    .map((call) => call.path), Array(3).fill('/api/v1/library/103'))
  assert.equal(calls.find((call) => call.options.method === 'PATCH').options.headers['X-CSRF-Token'], 'csrf')
  assert.deepEqual(getVisibleLibraryItems(loaded, 'game', 'all', 'recent').map((entry) => entry.media.title), ['Game'])
})

test('add sends identity only and respects added and existing responses', async () => {
  clearLibraryRepository()
  clearCsrfToken()
  const bodies = []
  let additions = 0
  globalThis.fetch = async (path, options) => {
    if (path.endsWith('/csrf')) return json({ csrfToken: 'csrf' })
    bodies.push(JSON.parse(options.body))
    return json({ added: additions++ === 0, item: item(media[0], '9007199254740993') })
  }
  assert.equal((await addItem(media[0])).added, true)
  assert.equal((await addItem(media[0])).added, false)
  assert.deepEqual(bodies, Array(2).fill({ media: {
    source: 'google-books', mediaType: 'book', sourceId: 'book-1',
  } }))
  assert.equal(await hasItem(media[0]), true)
})

test('empty response is loaded, server failure remains an error', async () => {
  clearLibraryRepository()
  globalThis.fetch = async () => json([])
  assert.deepEqual(await getLibrary(), [])
  globalThis.fetch = async () => ({ status: 503, ok: false, json: async () => ({ error: {
    code: 'service_unavailable', message: 'Service unavailable.',
  } }) })
  await assert.rejects(getLibrary(), { status: 503, code: 'service_unavailable' })
  assert.equal(await hasItem(media[0]), false)
})
