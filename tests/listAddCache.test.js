import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { currentUser } from '../src/composables/authState.js'
import { resetLists, useLists } from '../src/composables/useLists.js'
import { clearCsrfToken } from '../src/services/apiClient.js'
import { ok, fail } from './support/mediaDetails.js'

const summary = { id: '1', title: 'Favorites', itemCount: 0, updatedAt: '2026-01-01T00:00:00Z' }
const item = { media: { title: 'Movie' }, userMedia: { id: '100' } }
const lists = useLists()
const originalFetch = globalThis.fetch
function backend() {
  const state = { summary, items: [], calls: [], handlers: new Map(), added: true }
  globalThis.fetch = async (path, options) => {
    state.calls.push({ path, method: options.method, body: options.body && JSON.parse(options.body) })
    const handler = state.handlers.get(`${options.method} ${path}`)
    if (handler) return handler()
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
    if (path === '/api/v1/lists') return ok([state.summary])
    if (path === '/api/v1/lists/1') return ok({ list: state.summary, items: state.items })
    if (path === '/api/v1/lists/1/items') {
      state.items = [item]
      state.summary = { ...summary, itemCount: 1, updatedAt: '2026-01-02T00:00:00Z' }
      return ok({ added: state.added })
    }
    throw new Error('Unexpected fixture request')
  }
  return state
}
beforeEach(() => {
  currentUser.value = { id: 'A' }
  resetLists()
  clearCsrfToken()
})
afterEach(() => {
  currentUser.value = null
  resetLists()
  clearCsrfToken()
  globalThis.fetch = originalFetch
})

test('Media Detail add invalidates summaries and cached target detail without fetching contents', async () => {
  const state = backend()
  await lists.loadLists()
  await lists.loadList('1')
  const before = state.calls.length
  await lists.addToList('1', '100', { refreshDetail: false })
  assert.equal(lists.isListsLoaded.value, false)
  assert.equal(lists.isDetailLoaded.value, false)
  assert.equal(lists.selectedList.value, null)
  assert.deepEqual(lists.selectedItems.value, [])
  assert.equal(lists.lists.value[0].title, 'Favorites')
  assert.ok(state.calls.slice(before).every((call) => call.path !== '/api/v1/lists/1'))
  assert.deepEqual(state.calls.find((call) => call.method === 'POST').body, { userMediaId: '100' })
  await lists.loadLists()
  assert.equal(lists.lists.value[0].itemCount, 1)
  assert.equal(lists.lists.value[0].updatedAt, '2026-01-02T00:00:00Z')
  await lists.loadList('1')
  assert.equal(lists.selectedItems.value.length, 1)
})

test('default List Detail add still refreshes the displayed items and summary immediately', async () => {
  const state = backend()
  await lists.loadLists()
  await lists.loadList('1')
  await lists.addToList('1', '100')
  assert.equal(lists.isDetailLoaded.value, true)
  assert.equal(lists.selectedItems.value[0].userMedia.id, '100')
  assert.equal(lists.selectedList.value.itemCount, 1)
  assert.equal(lists.lists.value[0].itemCount, 1)
  assert.equal(state.calls.filter((call) => call.path === '/api/v1/lists/1').length, 2)
})

test('older summary/detail reads cannot restore stale caches after a Media Detail add', async () => {
  const state = backend()
  let finishLists
  let finishDetail
  state.handlers.set('GET /api/v1/lists', () => new Promise((resolve) => { finishLists = resolve }))
  state.handlers.set('GET /api/v1/lists/1', () => new Promise((resolve) => { finishDetail = resolve }))
  const overview = lists.loadLists()
  const detail = lists.loadList('1')
  await lists.addToList('1', '100', { refreshDetail: false })
  finishLists(ok([summary]))
  finishDetail(ok({ list: summary, items: [] }))
  await Promise.all([overview, detail])
  assert.equal(lists.isListsLoaded.value, false)
  assert.equal(lists.isDetailLoaded.value, false)
  assert.equal(lists.isListsLoading.value, false)
  assert.equal(lists.isDetailLoading.value, false)
})

test('an unrelated cached List Detail stays loaded when adding to another list', async () => {
  const state = backend()
  state.handlers.set('GET /api/v1/lists/2', () => ok({ list: { ...summary, id: '2' }, items: [] }))
  await lists.loadList('2')
  await lists.addToList('1', '100', { refreshDetail: false })
  assert.equal(lists.isDetailLoaded.value, true)
  assert.equal(lists.selectedList.value.id, '2')
})

test('missing-list errors invalidate summaries without a detail fetch, while transient failures preserve valid cache', async () => {
  const state = backend()
  await lists.loadLists()
  state.handlers.set('POST /api/v1/lists/1/items', () => fail(503, 'service_unavailable'))
  await assert.rejects(lists.addToList('1', '100', { refreshDetail: false }))
  assert.equal(lists.isListsLoaded.value, true)
  state.handlers.set('POST /api/v1/lists/1/items', () => fail(404, 'list_not_found'))
  await assert.rejects(lists.addToList('1', '100', { refreshDetail: false }))
  assert.equal(lists.isListsLoaded.value, false)
  assert.ok(state.calls.every((call) => call.path !== '/api/v1/lists/1'))
})

test('a late membership response from another account cannot invalidate the new account cache', async () => {
  const state = backend()
  let finish
  state.handlers.set('POST /api/v1/lists/1/items', () => new Promise((resolve) => { finish = resolve }))
  const pending = lists.addToList('1', '100', { refreshDetail: false })
  await new Promise((resolve) => setImmediate(resolve))
  currentUser.value = { id: 'B' }
  resetLists()
  await lists.loadLists()
  finish(ok({ added: true }))
  await pending
  assert.equal(lists.isListsLoaded.value, true)
})
