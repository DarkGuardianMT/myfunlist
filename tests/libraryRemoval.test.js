import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { currentUser } from '../src/composables/authState.js'
import { resetLibrary, useLibrary, cancelUnsentLibraryRemovals, LIBRARY_UNDO_MS } from '../src/composables/useLibrary.js'
import { resetLists, useLists } from '../src/composables/useLists.js'
import { advanceAuthEpoch, clearCsrfToken } from '../src/services/apiClient.js'
import { getVisibleLibraryItems } from '../src/utils/libraryDisplay.js'
import { useLibraryBrowsing } from '../src/composables/useLibraryBrowsing.js'
import { identities, ok, fail } from './support/mediaDetails.js'
import { getMediaKey } from '../src/domain/mediaIdentity.js'

const library = useLibrary()
const lists = useLists()
const originalFetch = globalThis.fetch
const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve
  const promise = new Promise((finish) => { resolve = finish })
  return { promise, resolve }
}
function backend() {
  const items = Object.entries(identities).map(([type, identity], index) => ({
    media: { ...identity, title: `Fixture ${type}` },
    userMedia: { id: String(index + 100), mediaKey: getMediaKey(identity),
      status: { book: 'reading', movie: 'watched', tv: 'watching', game: 'playing' }[type],
      rating: 8.5, addedAt: `2026-10-${20 + index}T00:00:00Z` },
  }))
  const state = { items, members: [...items], calls: [], handlers: new Map() }
  globalThis.fetch = async (path, options = {}) => {
    state.calls.push({ path, method: options.method })
    const handler = state.handlers.get(`${options.method} ${path}`)
    if (handler) return handler(options)
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
    if (path === '/api/v1/library') return ok(state.items)
    if (path === '/api/v1/lists') return ok([{ id: '1', title: 'Favorites', itemCount: state.members.length }])
    if (path === '/api/v1/lists/1') return ok({ list: { id: '1', title: 'Favorites' }, items: state.members })
    if (options.method === 'DELETE') {
      const id = path.split('/').at(-1)
      state.items = state.items.filter((item) => item.userMedia.id !== id)
      state.members = state.members.filter((item) => item.userMedia.id !== id)
      return { ok: true, status: 204 }
    }
    throw new Error('Unexpected fixture request')
  }
  return state
}
const deletes = (state) => state.calls.filter((call) => call.method === 'DELETE')
beforeEach((t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 30) })
  currentUser.value = { id: 'A' }
  advanceAuthEpoch()
  resetLibrary()
  resetLists()
  clearCsrfToken()
})
afterEach(() => {
  currentUser.value = null
  advanceAuthEpoch()
  resetLibrary()
  resetLists()
  clearCsrfToken()
  globalThis.fetch = originalFetch
})

for (const type of Object.keys(identities)) {
  test(`${type}: Remove then Undo keeps the exact original record, personal state and list memberships`, async (t) => {
    const state = backend()
    await library.loadLibrary()
    await lists.loadList('1')
    const original = structuredClone(state.items)
    const item = library.libraryItems.value.find((item) => item.media.mediaType === type)
    const id = library.scheduleLibraryRemoval(item.userMedia.mediaKey)
    assert.equal(library.displayLibraryItems.value.length, 3)
    assert.equal(library.libraryItems.value.length, 4)
    assert.equal(library.hasLibraryItem(item.media), true)
    assert.equal(lists.isListMember('1', item.userMedia.id), true)
    assert.equal(lists.isDetailLoaded.value, true)
    t.mock.timers.tick(7999)
    assert.equal(deletes(state).length, 0)
    assert.equal(library.undoLibraryRemoval(id), true)
    assert.equal(library.undoLibraryRemoval(id), false)
    t.mock.timers.tick(10000)
    await tick()
    assert.deepEqual(library.libraryItems.value, original)
    assert.deepEqual(state.items, original)
    assert.deepEqual(state.members, original)
    assert.equal(library.displayLibraryItems.value.length, 4)
    assert.equal(lists.isListMember('1', item.userMedia.id), true)
    assert.equal(state.calls.some((call) => ['POST', 'PATCH', 'DELETE'].includes(call.method)), false)
  })
}

test('expiry sends one authenticated DELETE; shared state and list caches change only after confirmed success', async (t) => {
  const state = backend()
  await library.loadLibrary()
  await lists.loadLists()
  await lists.loadList('1')
  const waiting = deferred()
  state.handlers.set('DELETE /api/v1/library/100', () => waiting.promise)
  const key = state.items[0].userMedia.mediaKey
  const id = library.scheduleLibraryRemoval(key)
  assert.equal(library.scheduleLibraryRemoval(key), id)
  t.mock.timers.tick(LIBRARY_UNDO_MS)
  await tick()
  assert.deepEqual(deletes(state), [{ path: '/api/v1/library/100', method: 'DELETE' }])
  assert.equal(library.removalNotices.value[0].state, 'deleting')
  assert.equal(library.undoLibraryRemoval(id), false)
  assert.equal(library.libraryItems.value.length, 4)
  assert.equal(lists.isDetailLoaded.value, true)
  t.mock.timers.tick(5000)
  await tick()
  assert.equal(deletes(state).length, 1)
  waiting.resolve({ ok: true, status: 204 })
  await tick()
  assert.equal(library.libraryItems.value.length, 3)
  assert.equal(library.removalNotices.value[0].state, 'removed')
  assert.equal(lists.isListsLoaded.value, false)
  assert.equal(lists.isDetailLoaded.value, false)
  assert.equal(library.undoLibraryRemoval(id), false)
})

test('multiple pending removals have independent deadlines, deduplicate Remove and allow individual Undo', async (t) => {
  const state = backend()
  await library.loadLibrary()
  const first = library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.tick(2000)
  const second = library.scheduleLibraryRemoval(state.items[1].userMedia.mediaKey)
  assert.notEqual(first, second)
  assert.equal(library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey), first)
  t.mock.timers.tick(6000)
  await tick()
  assert.equal(deletes(state).length, 1)
  assert.equal(library.isLibraryRemovalPending('tmdb:movie:42'), true)
  assert.equal(library.undoLibraryRemoval(second), true)
  t.mock.timers.tick(2000)
  await tick()
  assert.equal(deletes(state).length, 1)
  assert.equal(library.libraryItems.value.length, 3)
})

test('Undo preserves the active type/status filters and every existing sort order', async () => {
  const state = backend()
  await library.loadLibrary()
  const browsing = useLibraryBrowsing()
  browsing.mediaTypeFilter.value = 'movie'
  browsing.statusFilter.value = 'watched'
  for (const order of ['recent', 'title', 'rating-high-low', 'rating-low-high']) {
    browsing.sortOrder.value = order
    const visible = () => getVisibleLibraryItems(library.displayLibraryItems.value,
      browsing.mediaTypeFilter.value, browsing.statusFilter.value, browsing.sortOrder.value)
    const before = visible()
    const id = library.scheduleLibraryRemoval(before[0].userMedia.mediaKey)
    assert.deepEqual(visible(), [])
    library.undoLibraryRemoval(id)
    assert.deepEqual(visible(), before)
    assert.deepEqual([browsing.mediaTypeFilter.value, browsing.statusFilter.value, browsing.sortOrder.value], ['movie', 'watched', order])
  }
  browsing.mediaTypeFilter.value = 'all'
  for (const order of ['recent', 'title', 'rating-high-low', 'rating-low-high']) {
    const before = getVisibleLibraryItems(library.displayLibraryItems.value, 'all', 'all', order)
    const id = library.scheduleLibraryRemoval(before[1].userMedia.mediaKey)
    library.undoLibraryRemoval(id)
    assert.deepEqual(getVisibleLibraryItems(library.displayLibraryItems.value, 'all', 'all', order), before)
  }
})

test('pending records cannot be edited or re-added through another consumer', async () => {
  const state = backend()
  await library.loadLibrary()
  const item = state.items[0]
  library.scheduleLibraryRemoval(item.userMedia.mediaKey)
  await assert.rejects(library.updateLibraryStatus(item.userMedia.mediaKey, 'finished'), /Undo/)
  await assert.rejects(library.updateLibraryRating(item.userMedia.mediaKey, 9), /Undo/)
  assert.deepEqual(await library.addLibraryItem(item.media), { added: false, item })
  assert.equal(state.calls.some((call) => ['POST', 'PATCH', 'DELETE'].includes(call.method)), false)
})

test('API failure shows the unchanged item again without restoration POSTs or automatic retries', async (t) => {
  const state = backend()
  await library.loadLibrary()
  await lists.loadList('1')
  const original = structuredClone(state.items)
  state.handlers.set('DELETE /api/v1/library/100', () => fail(503, 'service_unavailable'))
  library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.tick(LIBRARY_UNDO_MS)
  await tick()
  assert.equal(library.removalNotices.value[0].state, 'error')
  assert.deepEqual(library.libraryItems.value, original)
  assert.deepEqual(library.displayLibraryItems.value, original)
  assert.deepEqual(state.members, original)
  t.mock.timers.tick(20000)
  await tick()
  assert.equal(deletes(state).length, 1)
  assert.equal(state.calls.some((call) => call.method === 'POST'), false)
  state.handlers.clear()
  library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.tick(LIBRARY_UNDO_MS)
  await tick()
  assert.equal(library.libraryItems.value.length, 3)
})

for (const account of [null, 'B']) {
  test(`${account ? 'switching accounts' : 'logout'} cancels all unsent removals even without a manual store reset`, async (t) => {
    const state = backend()
    await library.loadLibrary()
    state.items.forEach((item) => library.scheduleLibraryRemoval(item.userMedia.mediaKey))
    currentUser.value = account ? { id: account } : null
    advanceAuthEpoch()
    t.mock.timers.tick(20000)
    await tick()
    assert.deepEqual(library.removalNotices.value, [])
    assert.deepEqual(library.libraryItems.value, [])
    assert.equal(deletes(state).length, 0)
  })
}

test('account change during CSRF resolution never sends the queued DELETE', async (t) => {
  const state = backend()
  await library.loadLibrary()
  const csrf = deferred()
  state.handlers.set('GET /api/v1/auth/csrf', () => csrf.promise)
  library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.tick(LIBRARY_UNDO_MS)
  await tick()
  assert.equal(deletes(state).length, 0)
  currentUser.value = { id: 'B' }
  advanceAuthEpoch()
  await library.loadLibrary()
  csrf.resolve(ok({ csrfToken: 'old-account-csrf' }))
  await tick()
  assert.equal(deletes(state).length, 0)
  assert.deepEqual(library.removalNotices.value, [])
  assert.equal(library.libraryItems.value.length, 4)
})

test('an already-sent old-account response cannot delete new-account state or removal notices', async (t) => {
  const state = backend()
  await library.loadLibrary()
  const old = deferred()
  state.handlers.set('DELETE /api/v1/library/100', () => old.promise)
  library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.tick(LIBRARY_UNDO_MS)
  await tick()
  currentUser.value = { id: 'B' }
  advanceAuthEpoch()
  await library.loadLibrary()
  const newId = library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  old.resolve({ ok: true, status: 204 })
  await tick()
  assert.equal(library.libraryItems.value.length, 4)
  assert.equal(library.removalNotices.value[0].id, newId)
  assert.equal(library.removalNotices.value[0].state, 'pending')
})

test('refresh/tab closure cancellation sends no DELETE and a fresh load finds the original records', async (t) => {
  const state = backend()
  await library.loadLibrary()
  const original = structuredClone(state.items)
  state.items.forEach((item) => library.scheduleLibraryRemoval(item.userMedia.mediaKey))
  cancelUnsentLibraryRemovals()
  t.mock.timers.tick(20000)
  await tick()
  assert.equal(deletes(state).length, 0)
  assert.deepEqual(library.displayLibraryItems.value, original)
  resetLibrary()
  await library.loadLibrary()
  assert.deepEqual(library.libraryItems.value, original)
  assert.deepEqual(state.members, original)
})

test('page interruption while waiting for CSRF cancels without sending or later restoring the job', async (t) => {
  const state = backend()
  await library.loadLibrary()
  const csrf = deferred()
  state.handlers.set('GET /api/v1/auth/csrf', () => csrf.promise)
  library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.tick(LIBRARY_UNDO_MS)
  await tick()
  cancelUnsentLibraryRemovals()
  csrf.resolve(ok({ csrfToken: 'fixture-csrf' }))
  await tick()
  assert.equal(deletes(state).length, 0)
  assert.equal(library.removalNotices.value[0].state, 'cancelled')
  assert.equal(library.displayLibraryItems.value.length, 4)
})

test('a delayed timer cannot extend Undo beyond the published deadline', async (t) => {
  const state = backend()
  await library.loadLibrary()
  const id = library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.setTime(Date.now() + LIBRARY_UNDO_MS)
  assert.equal(library.undoLibraryRemoval(id), false)
  await tick()
  assert.equal(deletes(state).length, 1)
  t.mock.timers.tick(1)
  await tick()
  assert.equal(deletes(state).length, 1)
})

test('a timed-out DELETE has no Undo or automatic retry and never attempts a reconstruction', async (t) => {
  const state = backend()
  await library.loadLibrary()
  state.handlers.set('DELETE /api/v1/library/100', ({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Request aborted')), { once: true })
  }))
  const id = library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  t.mock.timers.tick(8000)
  await tick()
  t.mock.timers.tick(11000)
  await tick()
  assert.equal(library.removalNotices.value[0].state, 'error')
  assert.equal(library.undoLibraryRemoval(id), false)
  assert.equal(library.displayLibraryItems.value.length, 4)
  assert.equal(deletes(state).length, 1)
  assert.equal(state.calls.some((call) => call.method === 'POST'), false)
})

test('forced Library reload cancels unsent removals and never replays a saved deletion intent', async (t) => {
  const state = backend()
  await library.loadLibrary()
  library.scheduleLibraryRemoval(state.items[0].userMedia.mediaKey)
  await library.loadLibrary(true)
  t.mock.timers.tick(10000)
  await tick()
  assert.equal(deletes(state).length, 0)
  assert.equal(library.displayLibraryItems.value.length, 4)
  assert.deepEqual(library.removalNotices.value, [])
})

test('a stale card identity cannot schedule deletion of another account entry with the same media key', async (t) => {
  const state = backend()
  await library.loadLibrary()
  const old = state.items[0]
  currentUser.value = { id: 'B' }
  advanceAuthEpoch()
  state.items = [{ ...old, userMedia: { ...old.userMedia, id: '900' } }]
  await library.loadLibrary()
  assert.equal(library.scheduleLibraryRemoval(old.userMedia.mediaKey, { expectedId: old.userMedia.id }), null)
  t.mock.timers.tick(10000)
  await tick()
  assert.equal(deletes(state).length, 0)
  assert.equal(library.libraryItems.value[0].userMedia.id, '900')
})
