import test from 'node:test'
import assert from 'node:assert/strict'
import { currentUser } from '../src/composables/authState.js'
import { resetLists, useLists } from '../src/composables/useLists.js'
import { clearCsrfToken } from '../src/services/apiClient.js'

const ok = (data, status = 200) => ({ ok: true, status, json: async () => ({ data }) })
const fail = (status, code, message, fields) => ({ ok: false, status, json: async () => ({
  error: { code, message, ...(fields ? { fields } : {}) },
}) })
const summary = (id, title, itemCount = 0) => ({ id, title, description: null, itemCount,
  createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z' })
const item = (id, mediaType) => ({
  media: { source: mediaType === 'book' ? 'google-books' : mediaType === 'game' ? 'rawg' : 'tmdb',
    mediaType, sourceId: id, title: `${mediaType} ${id}` },
  userMedia: { id, mediaKey: `source:${mediaType}:${id}`, status: 'completed', rating: 8,
    addedAt: '2026-09-29T00:00:00Z' },
  listItem: { addedAt: '2026-09-29T01:00:00Z' },
})

test('Lists distinguish loading, empty, failure, and loaded summaries', async () => {
  currentUser.value = { id: 'A' }
  resetLists()
  const lists = useLists()
  let finish
  globalThis.fetch = async () => new Promise((resolve) => { finish = resolve })
  const pending = lists.loadLists()
  assert.equal(lists.isListsLoading.value, true)
  assert.equal(lists.isListsLoaded.value, false)
  finish(ok([]))
  await pending
  assert.equal(lists.isListsLoading.value, false)
  assert.equal(lists.isListsLoaded.value, true)
  assert.deepEqual(lists.lists.value, [])

  globalThis.fetch = async () => fail(503, 'service_unavailable', 'Service unavailable.')
  await assert.rejects(lists.loadLists(true), { status: 503 })
  assert.equal(lists.listsError.value, 'Service unavailable.')
  globalThis.fetch = async () => ok([summary('2', 'Favorites')])
  await lists.loadLists(true)
  assert.equal(lists.listsError.value, '')
  assert.equal(lists.lists.value[0].title, 'Favorites')
})

test('List creation validates errors and detail mutations keep media shapes', async () => {
  clearCsrfToken()
  currentUser.value = { id: 'A' }
  resetLists()
  const lists = useLists()
  let storedList = summary('3', 'Favorites')
  let storedItems = [item('1', 'book'), item('2', 'movie'), item('3', 'tv'), item('4', 'game')]
  let createError = false
  const calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'csrf' })
    if (path === '/api/v1/lists' && options.method === 'GET') return ok([])
    if (path === '/api/v1/lists' && options.method === 'POST') {
      return createError ? fail(422, 'validation_error', 'Check fields.', { title: 'Title required.' })
        : ok(storedList, 201)
    }
    if (path === '/api/v1/lists/3' && options.method === 'GET') {
      return ok({ list: { ...storedList, itemCount: storedItems.length }, items: storedItems })
    }
    if (path === '/api/v1/lists/3' && options.method === 'PATCH') {
      storedList = { ...storedList, ...JSON.parse(options.body) }
      return ok(storedList)
    }
    if (path === '/api/v1/lists/3' && options.method === 'DELETE') return { ok: true, status: 204 }
    if (path === '/api/v1/lists/3/items' && options.method === 'POST') {
      const id = JSON.parse(options.body).userMediaId
      if (storedItems.some((entry) => entry.userMedia.id === id)) return ok({ added: false })
      storedItems = [item(id, 'game'), ...storedItems]
      return ok({ added: true }, 201)
    }
    if (path.startsWith('/api/v1/lists/3/items/') && options.method === 'DELETE') {
      storedItems = storedItems.filter((entry) => entry.userMedia.id !== path.split('/').at(-1))
      return { ok: true, status: 204 }
    }
    throw new Error(path)
  }
  await lists.loadLists()
  createError = true
  await assert.rejects(lists.createCustomList(' ', ''), { status: 422,
    fields: { title: 'Title required.' } })
  assert.deepEqual(lists.lists.value, [])
  createError = false
  await lists.createCustomList('Favorites', '')
  assert.equal(lists.lists.value[0].id, '3')
  await lists.loadList('3')
  assert.deepEqual(lists.selectedItems.value.map((entry) => entry.media.mediaType),
    ['book', 'movie', 'tv', 'game'])
  assert.equal(lists.selectedItems.value[0].listItem.addedAt, '2026-09-29T01:00:00Z')
  assert.deepEqual(await lists.addToList('3', '1'), { added: false })
  assert.deepEqual(await lists.addToList('3', '5'), { added: true })
  assert.equal(lists.selectedList.value.itemCount, 5)
  await lists.removeFromList('3', '2')
  assert.equal(lists.selectedList.value.itemCount, 4)
  assert.equal(storedItems.some((entry) => entry.userMedia.id === '2'), false)
  await lists.updateCustomList('3', { title: 'Updated', description: 'New' })
  assert.equal(lists.selectedList.value.title, 'Updated')
  assert.equal(lists.lists.value[0].description, 'New')
  await lists.deleteCustomList('3')
  assert.deepEqual(lists.lists.value, [])
  assert.equal(lists.selectedList.value, null)
  assert.ok(calls.filter((call) => call.options.method !== 'GET'
    && !call.path.endsWith('/csrf')).every((call) => call.options.headers['X-CSRF-Token']))
})

test('Account reset clears lists and stale responses cannot cross accounts', async () => {
  currentUser.value = { id: 'A' }
  resetLists()
  const lists = useLists()
  let finishA
  globalThis.fetch = async () => new Promise((resolve) => { finishA = resolve })
  const pendingA = lists.loadLists()
  currentUser.value = { id: 'B' }
  resetLists()
  assert.deepEqual(lists.lists.value, [])
  assert.equal(lists.selectedList.value, null)
  globalThis.fetch = async () => ok([summary('8', 'B list')])
  await lists.loadLists()
  finishA(ok([summary('7', 'A list')]))
  await pendingA
  assert.equal(lists.lists.value[0].title, 'B list')
  currentUser.value = null
  resetLists()
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected request') }
  assert.deepEqual(await lists.loadLists(), [])
  assert.equal(await lists.loadList('8'), null)
  assert.equal(calls, 0)
})

test('List detail distinguishes an empty list from a failed load and ignores stale detail', async () => {
  currentUser.value = { id: 'A' }
  resetLists()
  const lists = useLists()
  globalThis.fetch = async () => ok({ list: summary('1', 'Empty'), items: [] })
  await lists.loadList('1')
  assert.equal(lists.isDetailLoaded.value, true)
  assert.deepEqual(lists.selectedItems.value, [])
  assert.equal(lists.detailError.value, '')

  globalThis.fetch = async () => fail(503, 'service_unavailable', 'Service unavailable.')
  await assert.rejects(lists.loadList('1', true), { status: 503 })
  assert.equal(lists.isDetailLoaded.value, false)
  assert.equal(lists.detailError.value, 'Service unavailable.')

  let finishA
  globalThis.fetch = async () => new Promise((resolve) => { finishA = resolve })
  const pendingA = lists.loadList('2', true)
  currentUser.value = { id: 'B' }
  resetLists()
  globalThis.fetch = async () => ok({ list: summary('3', 'B list'), items: [] })
  await lists.loadList('3')
  finishA(ok({ list: summary('2', 'A list'), items: [item('1', 'book')] }))
  await pendingA
  assert.equal(lists.selectedList.value.title, 'B list')
  assert.deepEqual(lists.selectedItems.value, [])
})
