import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'
import { identities, ok, fail } from './support/mediaDetails.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { mount, flushPromises } = await import('@vue/test-utils')
const { h, nextTick } = await import('vue')
const { createRouter, createMemoryHistory, RouterView } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { resetLibrary } = await import('../src/composables/useLibrary.js')
const { resetLists, useLists } = await import('../src/composables/useLists.js')
const { useLibraryBrowsing } = await import('../src/composables/useLibraryBrowsing.js')
const { advanceAuthEpoch, clearCsrfToken } = await import('../src/services/apiClient.js')
const Library = await loadVueComponent(new URL('../src/views/LibraryView.vue', import.meta.url))
const Lists = await loadVueComponent(new URL('../src/views/ListsView.vue', import.meta.url))
const Detail = await loadVueComponent(new URL('../src/views/ListDetailView.vue', import.meta.url))
const mounted = []
const originalFetch = globalThis.fetch
const date = '2026-10-29T00:00:00Z'
const entry = (type, index) => ({
  media: { ...identities[type], title: type === 'movie' ? 'Dune' : `Fixture ${type}`, authors: ['A. Author'], platforms: [] },
  userMedia: { id: String(index + 100), mediaKey: `${identities[type].source}:${type}:${identities[type].sourceId}`,
    status: { book: 'reading', movie: 'watched', tv: 'watching', game: 'playing' }[type], rating: 8.5, addedAt: date },
})
function deferred() {
  let resolve
  const promise = new Promise((finish) => { resolve = finish })
  return { promise, resolve }
}
function backend() {
  const state = { library: Object.keys(identities).map(entry), items: [], calls: [], handlers: new Map(),
    list: { id: '1', title: 'Favorites', description: 'My collection', itemCount: 0, createdAt: date, updatedAt: date } }
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || 'GET'
    state.calls.push({ path, method, body: options.body && JSON.parse(options.body) })
    const handler = state.handlers.get(`${method} ${path}`)
    if (handler) return handler(options)
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
    if (path === '/api/v1/lists/memberships') return ok({ memberships: state.items
      .map((item) => ({ listId: '1', userMediaId: item.userMedia.id }))
      .sort((a, b) => Number(a.userMediaId) - Number(b.userMediaId)), nextCursor: null })
    if (path === '/api/v1/library') return ok(state.library)
    if (path.startsWith('/api/v1/library/') && method === 'DELETE') {
      state.library = state.library.filter((item) => item.userMedia.id !== path.split('/').at(-1))
      return { ok: true, status: 204 }
    }
    if (path === '/api/v1/lists' && method === 'GET') return ok([{ ...state.list, itemCount: state.items.length }])
    if (path === '/api/v1/lists' && method === 'POST') return ok({ ...state.list, ...JSON.parse(options.body), id: '2' })
    if (path === '/api/v1/lists/1' && method === 'GET') return ok({ list: { ...state.list, itemCount: state.items.length }, items: state.items })
    if (path === '/api/v1/lists/1' && method === 'PATCH') {
      state.list = { ...state.list, ...JSON.parse(options.body) }
      return ok(state.list)
    }
    if (path === '/api/v1/lists/1/items' && method === 'POST') {
      const id = JSON.parse(options.body).userMediaId
      const added = !state.items.some((item) => item.userMedia.id === id)
      if (added) state.items = [...state.items, state.library.find((item) => item.userMedia.id === id)]
      return ok({ added })
    }
    if (path.startsWith('/api/v1/lists/1/items/') && method === 'DELETE') {
      state.items = state.items.filter((item) => item.userMedia.id !== path.split('/').at(-1))
      return { ok: true, status: 204 }
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`)
  }
  return state
}
async function page(path = '/library') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/library', component: Library }, { path: '/lists', component: Lists },
    { path: '/lists/:id', component: Detail },
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: { render: () => null } },
    ...['/discover', '/login', '/register'].map((path) => ({ path, component: { render: () => null } })),
  ] })
  await router.push(path)
  const view = mount({ render: () => h(RouterView) }, { attachTo: document.body, global: { plugins: [router] } })
  mounted.push(view)
  await flushPromises()
  return { view, router }
}
const adds = (state) => state.calls.filter((call) => call.path.endsWith('/items') && call.method === 'POST')
beforeEach(() => {
  currentUser.value = { id: 'A', email: 'a@example.test' }
  isAuthLoading.value = false
  advanceAuthEpoch()
  resetLibrary()
  resetLists()
  clearCsrfToken()
  useLibraryBrowsing().mediaTypeFilter.value = 'all'
  useLibraryBrowsing().sortOrder.value = 'recent'
})
afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount())
  currentUser.value = null
  resetLibrary()
  resetLists()
  globalThis.fetch = originalFetch
})
after(() => dom.window.close())

test('A4: a filtered successful add shows existing membership, removal makes the same match eligible again', async () => {
  const state = backend()
  const { view } = await page('/lists/1')
  assert.match(view.text(), /This list is empty/)
  assert.equal(view.get('.list-add-panel').element.open, false)
  await view.get('.list-add-panel summary').trigger('click')
  await view.get('#list-library-filter').setValue('Dune')
  await view.get('#list-library-item').setValue('101')
  await view.get('.list-add-form').trigger('submit')
  await flushPromises()
  assert.match(view.text(), /Added to this list/)
  assert.match(view.text(), /All matching Library items are already in this list/)
  assert.doesNotMatch(view.text(), /No Library items match/)
  assert.equal(view.get('#list-library-filter').element.value, 'Dune')
  assert.equal(view.get('.list-add-panel').element.open, true)
  assert.equal(view.get('.list-add-form button').element.disabled, true)
  await view.get('.remove-button').trigger('click')
  await flushPromises()
  assert.match(view.text(), /It remains in your Library/)
  assert.match(view.get('#list-library-item').text(), /Dune/)
  await view.get('#list-library-item').setValue('101')
  await view.get('.list-add-form').trigger('submit')
  await flushPromises()
  assert.equal(state.items.length, 1)
  assert.equal(adds(state).length, 2)
  await view.get('#list-library-filter').setValue('absent title')
  assert.match(view.text(), /No Library items match this filter/)
  assert.equal(state.library.length, 4)
  assert.equal(state.library[1].userMedia.rating, 8.5)
})

test('B4: create and add disclosures prioritize saved content; cancel, validation, success and edit remain usable', async () => {
  const state = backend()
  const { view, router } = await page('/lists')
  const panel = view.get('details')
  assert.equal(panel.element.open, false)
  assert.match(view.get('.list-summary-grid').text(), /Favorites/)
  await panel.get('summary').trigger('click')
  assert.equal(panel.element.open, true)
  await view.get('#list-title').setValue('Unsaved')
  await view.get('.list-form__cancel').trigger('click')
  assert.equal(panel.element.open, false)
  assert.equal(view.get('#list-title').element.value, '')
  assert.equal(document.activeElement, panel.get('summary').element)
  await panel.get('summary').trigger('click')
  await view.get('#list-title').setValue('New list')
  await view.get('.list-form').trigger('submit')
  await flushPromises()
  assert.equal(panel.element.open, false)
  assert.match(view.get('[role="status"]').text(), /Created/)
  assert.equal(view.get('[role="status"]').element.closest('details'), null)
  await router.push('/lists/1')
  await flushPromises()
  const editToggle = view.get('button[aria-controls="edit-list-panel"]')
  await editToggle.trigger('click')
  await view.get('#edit-list-title').setValue('Discard this')
  await view.get('.list-form__cancel').trigger('click')
  assert.equal(document.activeElement, editToggle.element)
  await editToggle.trigger('click')
  assert.equal(view.get('#edit-list-title').element.value, 'Favorites')
  state.handlers.set('PATCH /api/v1/lists/1', () => ({ ok: false, status: 422, json: async () => ({
    error: { code: 'validation_error', message: 'Check fields.', fields: { title: 'Title is required.' } },
  }) }))
  await view.get('.list-form').trigger('submit')
  await flushPromises()
  assert.match(view.get('[role="alert"]').text(), /Title is required/)
  assert.equal(view.get('#edit-list-title').element.value, 'Favorites')
  state.handlers.clear()
  await view.get('#edit-list-title').setValue('Updated')
  await view.get('.list-form').trigger('submit')
  await flushPromises()
  assert.equal(view.get('h1').text(), 'Updated')
  assert.match(view.text(), /List details saved/)
})

test('Library keeps filter preferences after removing the last match and distinguishes an actually empty Library', async () => {
  const state = backend()
  const { view } = await page()
  await view.get('#library-media-filter').setValue('movie')
  await view.get('#library-status-filter').setValue('watched')
  await view.get('#library-sort-order').setValue('rating-high-low')
  await view.get('.remove-button').trigger('click')
  await flushPromises()
  assert.match(view.text(), /No items match the selected filters/)
  assert.doesNotMatch(view.text(), /Your Library is empty/)
  assert.equal(view.get('#library-media-filter').element.value, 'movie')
  assert.equal(view.get('#library-status-filter').element.value, 'watched')
  await view.get('.library-empty button').trigger('click')
  assert.equal(view.findAll('article').length, 3)
  assert.equal(view.get('#library-sort-order').element.value, 'rating-high-low')
  while (state.library.length) {
    await view.findAll('.remove-button')[0].trigger('click')
    await flushPromises()
  }
  assert.match(view.text(), /Your Library is empty/)
  assert.doesNotMatch(view.text(), /No items match/)
  assert.equal(view.get('.library-empty a').attributes('href'), '/discover')
})

test('Library loading and failures never masquerade as an empty collection and retry recovers', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('GET /api/v1/library', () => waiting.promise)
  const { view } = await page()
  assert.match(view.text(), /Loading your Library/)
  assert.doesNotMatch(view.text(), /Your Library is empty|No items match/)
  waiting.resolve(fail(503, 'service_unavailable'))
  await flushPromises()
  assert.match(view.get('[role="alert"]').text(), /could not be loaded/)
  assert.doesNotMatch(view.text(), /Your Library is empty|No items match/)
  state.handlers.clear()
  state.library = []
  await view.get('.library-empty button').trigger('click')
  await flushPromises()
  assert.match(view.text(), /Your Library is empty/)
})

test('B5/D3: all Library card types have independent lazy pickers; pending summaries deduplicate and known additions disable repeat POSTs', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('GET /api/v1/lists', () => waiting.promise)
  const { view, router } = await page()
  const areas = view.findAll('.media-detail-lists')
  assert.equal(areas.length, 4)
  assert.equal(state.calls.some((call) => call.path === '/api/v1/lists'), false)
  await areas[0].get('button').trigger('click')
  await areas[1].get('button').trigger('click')
  await flushPromises()
  assert.equal(state.calls.filter((call) => call.path === '/api/v1/lists').length, 1)
  assert.match(areas[0].text(), /Loading your Custom Lists/)
  waiting.resolve(ok([state.list]))
  await flushPromises()
  const ids = areas.flatMap((area) => area.findAll('[id]').map((node) => node.attributes('id')))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(areas[0].get('label').attributes('for'), areas[0].get('select').attributes('id'))
  await areas[0].get('select').setValue('1')
  await areas[0].get('form').trigger('submit')
  await flushPromises()
  assert.match(areas[0].get('[role="status"]').text(), /Added to Favorites/)
  assert.equal(areas[0].get('button[type="submit"]').text(), 'Already in list')
  assert.equal(areas[0].get('option[value="1"]').element.disabled, true)
  await areas[0].get('form').trigger('submit')
  assert.equal(adds(state).length, 1)
  assert.equal(router.currentRoute.value.path, '/library')
  assert.equal(state.calls.some((call) => call.path === '/api/v1/lists/1'), false)
  assert.equal(view.findAll('.library-item-controls select')[0].element.value, 'reading')
  assert.equal(state.library[0].userMedia.rating, 8.5)
})

test('B5: card add errors are local and retryable, duplicate responses also disable completed additions', async () => {
  const state = backend()
  const { view } = await page()
  const area = view.findAll('.media-detail-lists')[0]
  await area.get('button').trigger('click')
  await flushPromises()
  await area.get('select').setValue('1')
  state.handlers.set('POST /api/v1/lists/1/items', () => fail(503, 'service_unavailable'))
  await area.get('form').trigger('submit')
  await flushPromises()
  assert.match(area.get('[role="alert"]').text(), /could not be added/)
  assert.equal(area.get('button[type="submit"]').element.disabled, false)
  assert.equal(view.findAll('.remove-button')[0].element.disabled, false)
  state.handlers.set('POST /api/v1/lists/1/items', () => ok({ added: false }))
  await area.get('form').trigger('submit')
  await flushPromises()
  assert.match(area.text(), /already in this list/)
  assert.equal(area.get('button[type="submit"]').element.disabled, true)
  await area.get('form').trigger('submit')
  assert.equal(adds(state).length, 2)
})

test('known membership survives card remounts, clears after list removal and never crosses accounts', async () => {
  const state = backend()
  state.items = [state.library[0]]
  const { view, router } = await page('/lists/1')
  await router.push('/library')
  await flushPromises()
  let area = view.findAll('.media-detail-lists')[0]
  await area.get('button').trigger('click')
  await flushPromises()
  assert.match(area.get('option[value="1"]').text(), /Already in list/)
  assert.equal(area.get('option[value="1"]').element.disabled, true)
  await router.push('/lists/1')
  await flushPromises()
  await view.get('.remove-button').trigger('click')
  await flushPromises()
  await router.push('/library')
  await flushPromises()
  area = view.findAll('.media-detail-lists')[0]
  await area.get('button').trigger('click')
  await flushPromises()
  assert.equal(area.get('option[value="1"]').element.disabled, false)
  await area.get('select').setValue('1')
  await area.get('form').trigger('submit')
  await flushPromises()
  assert.equal(useLists().isListMember('1', '100'), true)
  currentUser.value = { id: 'B', email: 'b@example.test' }
  advanceAuthEpoch()
  resetLists()
  resetLibrary()
  await nextTick()
  assert.equal(useLists().isListMember('1', '100'), false)
  assert.doesNotMatch(view.text(), /Added to Favorites|Already in list/)
})

test('leaving Library while a card add awaits CSRF cancels the queued POST', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('GET /api/v1/auth/csrf', () => waiting.promise)
  const { view, router } = await page()
  const area = view.findAll('.media-detail-lists')[0]
  await area.get('button').trigger('click')
  await flushPromises()
  await area.get('select').setValue('1')
  await area.get('form').trigger('submit')
  await flushPromises()
  assert.equal(adds(state).length, 0)
  await router.push('/lists')
  await flushPromises()
  waiting.resolve(ok({ csrfToken: 'fixture-csrf' }))
  await flushPromises()
  assert.equal(adds(state).length, 0)
})

test('D3: fresh Library pickers hydrate persisted memberships for all four media types in one shared read', async () => {
  const state = backend()
  state.items = [...state.library]
  state.handlers.set('GET /api/v1/lists', () => ok([state.list, { ...state.list, id: '2', title: 'Next up' }]))
  const waiting = deferred()
  state.handlers.set('GET /api/v1/lists/memberships', () => waiting.promise)
  const { view } = await page()
  const areas = view.findAll('.media-detail-lists')
  assert.equal(state.calls.some((call) => call.path.includes('memberships')), false)
  for (const area of areas) await area.get('button').trigger('click')
  await flushPromises()
  for (const area of areas) {
    assert.match(area.text(), /Loading your Custom Lists/)
    assert.equal(area.find('form').exists(), false)
  }
  assert.equal(state.calls.filter((call) => call.path.includes('memberships')).length, 1)
  waiting.resolve(ok({ memberships: state.items.map((item) => ({ listId: '1', userMediaId: item.userMedia.id })), nextCursor: null }))
  await flushPromises()
  for (const area of areas) {
    assert.match(area.get('option[value="1"]').text(), /Already in list/)
    assert.equal(area.get('option[value="1"]').element.disabled, true)
    await area.get('select').setValue('1')
    assert.equal(area.get('button[type="submit"]').text(), 'Already in list')
    await area.get('form').trigger('submit')
    assert.equal(area.get('button[type="submit"]').element.disabled, true)
    assert.equal(area.get('option[value="2"]').element.disabled, false)
    await area.get('select').setValue('2')
    assert.equal(area.get('button[type="submit"]').element.disabled, false)
  }
  assert.equal(adds(state).length, 0)
  assert.equal(state.calls.some((call) => /^\/api\/v1\/lists\/\d+$/.test(call.path)), false)
  assert.deepEqual(state.library.map((item) => [item.userMedia.status, item.userMedia.rating]),
    [['reading', 8.5], ['watched', 8.5], ['watching', 8.5], ['playing', 8.5]])
})

test('D3: remove membership, reset page state and re-add from a fresh Library picker', async () => {
  const state = backend()
  state.items = [state.library[0]]
  await useLists().loadMemberships()
  assert.equal(useLists().isListMember('1', '100'), true)
  await useLists().removeFromList('1', '100')
  resetLists()
  resetLibrary()
  const { view } = await page()
  const area = view.findAll('.media-detail-lists')[0]
  await area.get('button').trigger('click')
  await flushPromises()
  assert.equal(area.get('option[value="1"]').element.disabled, false)
  await area.get('select').setValue('1')
  await area.get('form').trigger('submit')
  await flushPromises()
  assert.equal(adds(state).length, 1)
  assert.equal(state.items.length, 1)
  assert.equal(area.get('button[type="submit"]').text(), 'Already in list')
})

test('D3: removing another Library entry reloads membership state for an already open picker', async () => {
  const state = backend()
  const { view } = await page()
  const area = view.findAll('.media-detail-lists')[0]
  await area.get('button').trigger('click')
  await flushPromises()
  await area.get('select').setValue('1')
  const waiting = deferred()
  state.handlers.set('GET /api/v1/lists/memberships', () => waiting.promise)
  await view.findAll('.remove-button')[1].trigger('click')
  await flushPromises()
  assert.match(area.text(), /Loading your Custom Lists/)
  assert.equal(area.find('form').exists(), false)
  waiting.resolve(ok({ memberships: [], nextCursor: null }))
  await flushPromises()
  assert.equal(area.get('button[type="submit"]').element.disabled, false)
  assert.equal(state.calls.filter((call) => call.path === '/api/v1/lists/memberships').length, 2)
})

test('B3-L1: Library status, rating and Remove retain 44px CSS minimums and keyboard focus', async () => {
  backend()
  const { view } = await page()
  const style = document.createElement('style')
  style.textContent = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  document.head.append(style)
  try {
    for (const control of view.findAll('.library-item-controls > select, .remove-button')) {
      const css = window.getComputedStyle(control.element)
      assert.equal(css.minHeight, '44px')
      assert.equal(css.minWidth, '44px')
      control.element.focus()
      assert.equal(document.activeElement, control.element)
      assert.ok(control.attributes('aria-label'))
    }
  } finally {
    style.remove()
  }
})
