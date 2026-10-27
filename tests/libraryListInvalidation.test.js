import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { currentUser } from '../src/composables/authState.js'
import { resetLibrary, useLibrary } from '../src/composables/useLibrary.js'
import { resetLists, useLists } from '../src/composables/useLists.js'
import { clearCsrfToken } from '../src/services/apiClient.js'
import { ok, fail } from './support/mediaDetails.js'

const item = { media: { source: 'tmdb', mediaType: 'movie', sourceId: '42', title: 'Movie' },
  userMedia: { id: '100', mediaKey: 'tmdb:movie:42', status: 'want-to-watch', rating: null, addedAt: '2026-01-01T00:00:00Z' } }
const summary = { id: '1', title: 'Favorites', itemCount: 1, updatedAt: '2026-01-01T00:00:00Z' }
const originalFetch = globalThis.fetch
const library = useLibrary()
const lists = useLists()
function backend() {
  const state = { calls: [], handlers: new Map(), summary, items: [item] }
  globalThis.fetch = async (path, options) => {
    state.calls.push({ path, method: options.method })
    const handler = state.handlers.get(`${options.method} ${path}`)
    if (handler) return handler()
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
    if (path === '/api/v1/library') return ok([item])
    if (path === '/api/v1/lists') return ok([state.summary])
    if (path === '/api/v1/lists/1') return ok({ list: state.summary, items: state.items })
    if (path === '/api/v1/library/100' && options.method === 'PATCH') {
      return ok({ ...item, userMedia: { ...item.userMedia, ...JSON.parse(options.body) } })
    }
    if (path === '/api/v1/library/100' && options.method === 'DELETE') {
      state.summary = { ...summary, itemCount: 0, updatedAt: '2026-01-02T00:00:00Z' }
      state.items = []
      return { ok: true, status: 204 }
    }
    throw new Error('Unexpected fixture request')
  }
  return state
}
async function loadCaches() {
  await library.loadLibrary()
  await lists.loadLists()
  await lists.loadList('1')
}
beforeEach(() => {
  currentUser.value = { id: 'A' }
  resetLibrary()
  resetLists()
  clearCsrfToken()
})
afterEach(() => {
  currentUser.value = null
  resetLibrary()
  resetLists()
  clearCsrfToken()
  globalThis.fetch = originalFetch
})

test('Library removal invalidates list summaries/counts/timestamps and detail memberships without eager reloads', async () => {
  const state = backend()
  await loadCaches()
  const before = state.calls.filter((call) => call.path.startsWith('/api/v1/lists')).length
  assert.equal(await library.removeLibraryItem(item.userMedia.mediaKey), true)
  assert.equal(lists.isListsLoaded.value, false)
  assert.equal(lists.isDetailLoaded.value, false)
  assert.deepEqual(lists.lists.value, [])
  assert.equal(lists.selectedList.value, null)
  assert.deepEqual(lists.selectedItems.value, [])
  assert.equal(state.calls.filter((call) => call.path.startsWith('/api/v1/lists')).length, before)
  await lists.loadLists()
  await lists.loadList('1')
  assert.equal(lists.lists.value[0].itemCount, 0)
  assert.equal(lists.lists.value[0].updatedAt, '2026-01-02T00:00:00Z')
  assert.deepEqual(lists.selectedItems.value, [])
})

test('status and rating changes keep list membership caches loaded and make no list requests', async () => {
  const state = backend()
  await loadCaches()
  const cachedSummary = lists.lists.value
  const cachedDetail = lists.selectedItems.value
  const before = state.calls.length
  await library.updateLibraryStatus(item.userMedia.mediaKey, 'watched')
  await library.updateLibraryRating(item.userMedia.mediaKey, 9)
  assert.equal(lists.isListsLoaded.value, true)
  assert.equal(lists.isDetailLoaded.value, true)
  assert.equal(lists.lists.value, cachedSummary)
  assert.equal(lists.selectedItems.value, cachedDetail)
  assert.ok(state.calls.slice(before).every((call) => !call.path.startsWith('/api/v1/lists')))
})

test('failed or missing Library removals leave valid list caches intact', async () => {
  const state = backend()
  await loadCaches()
  state.handlers.set('DELETE /api/v1/library/100', () => fail(503, 'service_unavailable'))
  await assert.rejects(library.removeLibraryItem(item.userMedia.mediaKey))
  assert.equal(await library.removeLibraryItem('tmdb:movie:99'), false)
  assert.equal(lists.isListsLoaded.value, true)
  assert.equal(lists.isDetailLoaded.value, true)
  assert.equal(lists.selectedItems.value.length, 1)
})

test('list reads already in flight cannot restore stale membership after Library removal', async () => {
  const state = backend()
  await loadCaches()
  let finishOverview
  let finishDetail
  state.handlers.set('GET /api/v1/lists', () => new Promise((resolve) => { finishOverview = resolve }))
  state.handlers.set('GET /api/v1/lists/1', () => new Promise((resolve) => { finishDetail = resolve }))
  const overview = lists.loadLists(true)
  const detail = lists.loadList('1', true)
  await library.removeLibraryItem(item.userMedia.mediaKey)
  finishOverview(ok([summary]))
  finishDetail(ok({ list: summary, items: [item] }))
  await Promise.all([overview, detail])
  assert.equal(lists.isListsLoaded.value, false)
  assert.equal(lists.isDetailLoaded.value, false)
  assert.equal(lists.isListsLoading.value, false)
  assert.equal(lists.isDetailLoading.value, false)
  assert.deepEqual(lists.lists.value, [])
  assert.deepEqual(lists.selectedItems.value, [])
})

test('a removal finishing after account switch does not invalidate the new account lists', async () => {
  const state = backend()
  await loadCaches()
  let finish
  state.handlers.set('DELETE /api/v1/library/100', () => new Promise((resolve) => { finish = resolve }))
  const removal = library.removeLibraryItem(item.userMedia.mediaKey)
  await new Promise((resolve) => setImmediate(resolve))
  currentUser.value = { id: 'B' }
  resetLibrary()
  resetLists()
  state.summary = { ...summary, title: 'Account B favorites' }
  await loadCaches()
  finish({ ok: true, status: 204 })
  await removal
  assert.equal(lists.isListsLoaded.value, true)
  assert.equal(lists.isDetailLoaded.value, true)
  assert.equal(lists.selectedList.value.title, 'Account B favorites')
  assert.equal(library.libraryItems.value.length, 1)
})
