import test from 'node:test'
import assert from 'node:assert/strict'
import { readLegacyLibrary } from '../src/services/legacyLibrary.js'
import {
  importChunks, importLegacyItems, isImportCompleted, legacyCandidate,
  markImportCompleted, toImportItem,
} from '../src/services/legacyImport.js'
import { clearCsrfToken } from '../src/services/apiClient.js'
import { currentUser } from '../src/composables/authState.js'
import { checkLegacyImport, useLegacyImport } from '../src/composables/useLegacyImport.js'
import { resetLibrary, useLibrary } from '../src/composables/useLibrary.js'

const book = { source: 'google-books', mediaType: 'book', sourceId: 'b1',
  title: 'Local title', authors: ['Author'] }
const localItem = (version = 2, addedAt = '2026-01-01T01:02:03.000Z') => ({
  media: version === 1 ? { ...book, mediaType: undefined } : book,
  userMedia: { mediaKey: version === 1 ? 'google-books:b1' : 'google-books:book:b1',
    status: 'reading', rating: 7.5, addedAt },
})

function storage(entries = []) {
  const values = new Map(entries)
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } }
  return values
}

test('v2, v1, and Trackora data remain readable without writes', () => {
  for (const [key, version] of [
    ['myfunlist_library', 2], ['myfunlist_library', 1], ['trackora_library', 1],
  ]) {
    const raw = JSON.stringify({ version, items: [localItem(version)] })
    const values = storage([[key, raw]])
    const [entry] = readLegacyLibrary()
    assert.equal(entry.userMedia.mediaKey, 'google-books:book:b1')
    assert.equal(entry.userMedia.rating, 7.5)
    assert.equal(values.get(key), raw)
    assert.equal(legacyCandidate().length, 1)
  }
})

test('import payload omits local metadata and replaces only known epoch placeholder', () => {
  const stamp = '2026-09-27T12:00:00.000Z'
  const converted = toImportItem(localItem(2, '1970-01-01T00:00:00.000Z'), stamp)
  assert.deepEqual(converted, { media: {
    source: 'google-books', mediaType: 'book', sourceId: 'b1',
  }, userMedia: { status: 'reading', rating: 7.5, addedAt: stamp } })
  assert.equal(toImportItem(localItem(), stamp).userMedia.addedAt, '2026-01-01T01:02:03.000Z')
})

test('more than 200 items are chunked and completed flag leaves browser data intact', async () => {
  clearCsrfToken()
  const items = Array.from({ length: 215 }, (_, index) => ({
    ...localItem(), media: { ...book, sourceId: `b${index}` },
  }))
  const values = storage([['myfunlist_library', JSON.stringify({ version: 2, items: [localItem()] })]])
  assert.deepEqual(importChunks(items.map((entry) => toImportItem(entry, new Date().toISOString())))
    .map((chunk) => chunk.length), [200, 15])
  const sizes = []
  globalThis.fetch = async (path, options) => {
    if (path.endsWith('/csrf')) return { ok: true, status: 200,
      json: async () => ({ data: { csrfToken: 'csrf' } }) }
    const payload = JSON.parse(options.body)
    sizes.push(payload.items.length)
    assert.ok(payload.items.every((entry) => Object.keys(entry.media).length === 3))
    return { ok: true, status: 200, json: async () => ({ data: {
      summary: { imported: payload.items.length, existing: 0, duplicate: 0, failed: 0 },
    } }) }
  }
  const result = await importLegacyItems(items)
  assert.deepEqual(sizes, [200, 15])
  assert.equal(result.summary.imported, 215)
  markImportCompleted('user-1', items)
  assert.equal(isImportCompleted('user-1', items), true)
  assert.equal(isImportCompleted('user-2', items), false)
  assert.ok(values.has('myfunlist_library'))
})

test('a failed later chunk keeps successful progress and local data', async () => {
  clearCsrfToken()
  const items = Array.from({ length: 201 }, (_, index) => ({
    ...localItem(), media: { ...book, sourceId: `b${index}` },
  }))
  const values = storage([['myfunlist_library', JSON.stringify({ version: 2, items: [localItem()] })]])
  let chunks = 0
  globalThis.fetch = async (path) => {
    if (path.endsWith('/csrf')) return { ok: true, status: 200,
      json: async () => ({ data: { csrfToken: 'csrf' } }) }
    chunks++
    if (chunks === 2) throw new Error('offline')
    return { ok: true, status: 200, json: async () => ({ data: {
      summary: { imported: 199, existing: 1, duplicate: 0, failed: 0 },
    } }) }
  }
  const result = await importLegacyItems(items)
  assert.equal(result.summary.imported, 199)
  assert.equal(result.summary.existing, 1)
  assert.equal(result.summary.pending, 1)
  assert.equal(result.error.code, 'network_error')
  assert.ok(values.has('myfunlist_library'))
})

test('completed import refetches account Library, marks completion, and leaves old data', async () => {
  clearCsrfToken()
  currentUser.value = { id: 'import-user', email: 'import@example.test' }
  resetLibrary()
  const values = storage([['myfunlist_library', JSON.stringify({ version: 2, items: [localItem()] })]])
  let loaded = []
  let libraryGets = 0
  globalThis.fetch = async (path) => {
    if (path.endsWith('/csrf')) return { ok: true, status: 200,
      json: async () => ({ data: { csrfToken: 'csrf' } }) }
    if (path.endsWith('/import')) {
      loaded = [{ media: book, userMedia: { id: '7', mediaKey: 'google-books:book:b1',
        status: 'reading', rating: 7.5, addedAt: '2026-01-01T01:02:03.000Z' } }]
      return { ok: true, status: 200, json: async () => ({ data: {
        summary: { imported: 1, existing: 0, duplicate: 0, failed: 0 },
      } }) }
    }
    libraryGets++
    return { ok: true, status: 200, json: async () => ({ data: loaded }) }
  }
  checkLegacyImport()
  const offer = useLegacyImport()
  assert.equal(offer.offerVisible.value, true)
  await offer.startImport()
  assert.equal(offer.offerVisible.value, false)
  assert.equal(offer.importSummary.value.imported, 1)
  assert.equal(libraryGets, 1)
  assert.equal(useLibrary().libraryItems.value[0].media.title, 'Local title')
  assert.ok(values.has('myfunlist_library'))
  checkLegacyImport()
  assert.equal(offer.offerVisible.value, false)
  currentUser.value = null
  resetLibrary()
})

test('partial import failure stays retryable and does not set completion flag', async () => {
  clearCsrfToken()
  currentUser.value = { id: 'partial-user', email: 'partial@example.test' }
  resetLibrary()
  const values = storage([['myfunlist_library', JSON.stringify({ version: 2, items: [localItem()] })]])
  globalThis.fetch = async (path) => {
    if (path.endsWith('/csrf')) return { ok: true, status: 200,
      json: async () => ({ data: { csrfToken: 'csrf' } }) }
    if (path.endsWith('/import')) return { ok: true, status: 200,
      json: async () => ({ data: { summary: { imported: 0, existing: 0, duplicate: 0, failed: 1 } } }) }
    return { ok: true, status: 200, json: async () => ({ data: [] }) }
  }
  checkLegacyImport()
  const offer = useLegacyImport()
  await offer.startImport()
  assert.equal(offer.offerVisible.value, true)
  assert.equal(offer.importSummary.value.failed, 1)
  assert.equal(isImportCompleted('partial-user', legacyCandidate()), false)
  assert.ok(values.has('myfunlist_library'))
  currentUser.value = null
  resetLibrary()
})
