import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'
import { identities, mediaDetail, ok, fail } from './support/mediaDetails.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { mount, flushPromises } = await import('@vue/test-utils')
const { h, effectScope } = await import('vue')
const { createRouter, createMemoryHistory, RouterView } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { resetLibrary, useLibrary } = await import('../src/composables/useLibrary.js')
const { resetLists, useLists } = await import('../src/composables/useLists.js')
const { clearMediaDetailCache, useMediaDetails } = await import('../src/composables/useMediaDetails.js')
const { clearCsrfToken, advanceAuthEpoch } = await import('../src/services/apiClient.js')
const { getMediaKey, getMediaDetailPath } = await import('../src/domain/mediaIdentity.js')
const MediaDetailView = await loadVueComponent(new URL('../src/views/MediaDetailView.vue', import.meta.url))
const mounted = []
const scopes = []
const originalFetch = globalThis.fetch
const summary = (id, title) => ({ id, title, itemCount: 0, updatedAt: '2026-01-01T00:00:00Z' })
const entry = (type = 'movie', id = '987654') => ({
  media: { ...identities[type], title: `Fixture ${type}` },
  userMedia: { id, mediaKey: getMediaKey(identities[type]), status: 'want-to-watch', rating: null, addedAt: '2026-01-01T00:00:00Z' },
})
function deferred() {
  let resolve
  const promise = new Promise((finish) => { resolve = finish })
  return { promise, resolve }
}
function account(id) {
  currentUser.value = id ? { id, email: `${id}@example.test` } : null
  advanceAuthEpoch()
  resetLibrary()
  resetLists()
  clearCsrfToken()
}
function backend(items = [entry()]) {
  const state = { items, lists: [summary('11', 'Favorites'), summary('22', 'Next up')], memberships: [], calls: [], handlers: new Map(), added: true }
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || 'GET'
    state.calls.push({ path, method, body: options.body && JSON.parse(options.body) })
    const handler = state.handlers.get(`${method} ${path}`)
    if (handler) return handler(options)
    if (path.startsWith('/api/v1/media/')) return ok(mediaDetail(path.split('/')[4]))
    if (path === '/api/v1/auth/csrf') return ok({ csrfToken: 'fixture-csrf' })
    if (path === '/api/v1/lists/memberships') return ok({ memberships: state.memberships, nextCursor: null })
    if (path === '/api/v1/library' && method === 'GET') return ok(state.items)
    if (path === '/api/v1/library' && method === 'POST') {
      const item = entry(JSON.parse(options.body).media.mediaType)
      state.items = [...state.items, item]
      return ok({ added: true, item })
    }
    if (path.startsWith('/api/v1/library/') && method === 'DELETE') {
      state.items = state.items.filter((item) => item.userMedia.id !== path.split('/').at(-1))
      return { ok: true, status: 204 }
    }
    if (path === '/api/v1/lists' && method === 'GET') return ok(state.lists)
    if (/^\/api\/v1\/lists\/\d+\/items$/.test(path) && method === 'POST') return ok({ added: state.added })
    throw new Error(`Unexpected fixture request: ${method} ${path}`)
  }
  return state
}
async function page(type = 'movie') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: MediaDetailView },
    ...['/discover', '/login', '/register', '/lists'].map((path) => ({ path, component: { render: () => null } })),
  ] })
  await router.push(getMediaDetailPath(identities[type]))
  const view = mount({ render: () => h(RouterView) }, { attachTo: document.body, global: { plugins: [router] } })
  mounted.push(view)
  await flushPromises()
  return { view, router }
}
const listArea = (view) => view.get('.media-detail-lists')
const open = async (view) => { await listArea(view).get('button[aria-controls]').trigger('click'); await flushPromises() }
const choose = async (view, id = '11') => { await listArea(view).get('select').setValue(id) }
const submit = async (view) => { await listArea(view).get('form').trigger('submit'); await flushPromises() }
const summaryCalls = (state) => state.calls.filter((call) => call.path === '/api/v1/lists')
const addCalls = (state) => state.calls.filter((call) => call.method === 'POST' && call.path.includes('/items'))
function assertPublicAndLibrary(view, type = 'movie') {
  assert.equal(view.get('h1').text(), `Fixture ${type}`)
  assert.equal(view.get('.media-detail-hero__description').text(), 'A public description.')
  assert.equal(view.get('.library-item-controls button').element.disabled, false)
}
beforeEach(() => {
  account('A')
  isAuthLoading.value = false
  clearMediaDetailCache()
})
afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount())
  scopes.splice(0).forEach((scope) => scope.stop())
  account(null)
  clearMediaDetailCache()
  globalThis.fetch = originalFetch
})
after(() => dom.window.close())

test('D3: Media Detail uses persisted membership before enabling Add and leaves other lists eligible', async () => {
  const state = backend()
  state.memberships = [{ listId: '11', userMediaId: '987654' }]
  const { view } = await page()
  await open(view)
  assert.equal(listArea(view).get('option[value="11"]').element.disabled, true)
  assert.match(listArea(view).get('option[value="11"]').text(), /Already in list/)
  await choose(view)
  await submit(view)
  assert.equal(listArea(view).get('button[type="submit"]').text(), 'Already in list')
  assert.equal(addCalls(state).length, 0)
  await choose(view, '22')
  assert.equal(listArea(view).get('button[type="submit"]').element.disabled, false)
  await submit(view)
  assert.equal(addCalls(state).length, 1)
})

test('D3: failed membership loading keeps Add unavailable and explicit retry recovers', async () => {
  const state = backend()
  state.handlers.set('GET /api/v1/lists/memberships', () => fail(503, 'service_unavailable'))
  const { view } = await page()
  await open(view)
  assert.match(listArea(view).get('[role="alert"]').text(), /could not be loaded/)
  assert.equal(listArea(view).find('form').exists(), false)
  assert.equal(useLists().isMembershipsLoaded.value, false)
  assert.equal(addCalls(state).length, 0)
  state.handlers.clear()
  state.memberships = [{ listId: '11', userMediaId: '987654' }]
  await listArea(view).findAll('button').find((button) => button.text() === 'Retry lists').trigger('click')
  await flushPromises()
  assert.equal(listArea(view).get('option[value="11"]').element.disabled, true)
  assert.equal(listArea(view).get('option[value="22"]').element.disabled, false)
})

for (const target of [null, 'B']) {
  test(`D3: ${target ? 'account switch' : 'logout'} during membership loading rejects late private results`, async () => {
    const state = backend()
    const old = deferred()
    state.handlers.set('GET /api/v1/lists/memberships', () => old.promise)
    const { view } = await page()
    await open(view)
    account(target)
    await flushPromises()
    if (target) {
      state.handlers.clear()
      state.items = [entry('movie', '200')]
      await open(view)
    }
    old.resolve(ok({ memberships: [{ listId: '11', userMediaId: '987654' }], nextCursor: null }))
    await flushPromises()
    assert.equal(useLists().isListMember('11', '987654'), false)
    if (target) assert.equal(listArea(view).get('option[value="11"]').element.disabled, false)
    else assert.equal(view.find('.media-detail-lists').exists(), false)
    assert.equal(addCalls(state).length, 0)
  })
}

test('anonymous detail requests neither Library nor lists and retains normal Login/Register links', async () => {
  account(null)
  const state = backend()
  const { view } = await page()
  assert.equal(view.get('h1').text(), 'Fixture movie')
  assert.equal(view.find('.media-detail-lists').exists(), false)
  assert.deepEqual(state.calls.map((call) => call.path), ['/api/v1/media/movie/tmdb/42'])
  assert.deepEqual(view.findAll('.media-detail-library a').map((link) => link.attributes('href')), ['/login', '/register'])
})

test('non-Library items show guidance; adding to Library immediately enables the lazy list action', async () => {
  const state = backend([])
  const { view } = await page()
  assert.equal(listArea(view).text(), 'Add this item to your Library before adding it to a Custom List.')
  assert.equal(listArea(view).find('button, select').exists(), false)
  assert.equal(state.calls.filter((call) => call.method === 'POST').length, 0)
  assert.equal(summaryCalls(state).length, 0)
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  assert.equal(listArea(view).get('button').text(), 'Add to Custom List')
  assert.equal(summaryCalls(state).length, 0)
  assertPublicAndLibrary(view)
})

test('opening the real disclosure button loads summaries lazily and renders labelled keyboard controls', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('GET /api/v1/lists', () => waiting.promise)
  const { view } = await page()
  assert.equal(summaryCalls(state).length, 0)
  const toggle = listArea(view).get('button')
  assert.equal(toggle.attributes('type'), 'button')
  assert.equal(toggle.attributes('aria-expanded'), 'false')
  await toggle.trigger('click')
  await flushPromises()
  assert.match(listArea(view).get('[role="status"]').text(), /Loading your Custom Lists/)
  assert.equal(summaryCalls(state).length, 1)
  assertPublicAndLibrary(view)
  waiting.resolve(ok(state.lists))
  await flushPromises()
  assert.equal(toggle.attributes('aria-expanded'), 'true')
  assert.equal(listArea(view).get('[id="media-list-panel"]').attributes('id'), toggle.attributes('aria-controls'))
  const select = listArea(view).get('select')
  assert.equal(listArea(view).get('label').attributes('for'), select.attributes('id'))
  assert.deepEqual(select.findAll('option').map((option) => [option.element.value, option.text()]),
    [['', 'Choose a list'], ['11', 'Favorites'], ['22', 'Next up']])
  select.element.focus()
  assert.equal(document.activeElement, select.element)
  assert.equal(listArea(view).get('button[type="submit"]').element.disabled, true)
})

test('valid summary cache is reused across opening, closing, and detail-page visits', async () => {
  const state = backend([entry(), entry('tv', '200')])
  await useLists().loadLists()
  const { view, router } = await page()
  await open(view)
  await open(view)
  await router.push(getMediaDetailPath(identities.tv))
  await flushPromises()
  assert.equal(listArea(view).get('button').attributes('aria-expanded'), 'false')
  await open(view)
  assert.equal(summaryCalls(state).length, 1)
})

test('list-load failure is local and Retry reloads summaries without blocking Library', async () => {
  const state = backend()
  state.handlers.set('GET /api/v1/lists', () => fail(503, 'service_unavailable'))
  const { view } = await page()
  await open(view)
  assert.match(listArea(view).get('[role="alert"]').text(), /could not be loaded/)
  assert.doesNotMatch(listArea(view).text(), /fixture-secret|provider\.test/)
  assertPublicAndLibrary(view)
  state.handlers.clear()
  await listArea(view).get('#media-list-panel button').trigger('click')
  await flushPromises()
  assert.ok(listArea(view).find('select').exists())
  assert.equal(summaryCalls(state).length, 2)
})

test('empty summaries link to the existing Lists page without inline creation', async () => {
  const state = backend()
  state.lists = []
  const { view } = await page()
  await open(view)
  assert.match(listArea(view).text(), /do not have any Custom Lists yet/)
  assert.equal(listArea(view).get('a').attributes('href'), '/lists')
  assert.equal(listArea(view).find('form, input, select').exists(), false)
})

test('Add submits the exact Library ID once, invalidates summary cache, and never fetches list contents', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('POST /api/v1/lists/22/items', () => waiting.promise)
  const { view, router } = await page()
  await open(view)
  await choose(view, '22')
  await submit(view)
  await submit(view)
  assert.equal(addCalls(state).length, 1)
  assert.deepEqual(addCalls(state)[0], { path: '/api/v1/lists/22/items', method: 'POST', body: { userMediaId: '987654' } })
  assert.ok(listArea(view).findAll('select, button').every((control) => control.element.disabled))
  assertPublicAndLibrary(view)
  waiting.resolve(ok({ added: true }))
  await flushPromises()
  assert.equal(listArea(view).get('[role="status"]').text(), 'Added to Next up.')
  assert.equal(listArea(view).get('button[type="submit"]').element.disabled, true)
  assert.equal(listArea(view).get('option[value="22"]').element.disabled, true)
  await submit(view)
  assert.equal(addCalls(state).length, 1)
  assert.equal(router.currentRoute.value.path, getMediaDetailPath(identities.movie))
  assert.equal(useLists().isListsLoaded.value, false)
  assert.equal(state.calls.filter((call) => /^\/api\/v1\/lists\/\d+$/.test(call.path)).length, 0)
  await open(view)
  await open(view)
  assert.equal(summaryCalls(state).length, 2)
})

test('membership created elsewhere still handles backend added=false without fetching list contents', async () => {
  const state = backend()
  state.added = false
  const { view } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  assert.equal(listArea(view).get('[role="status"]').text(), 'This item is already in this list.')
  assert.equal(listArea(view).get('button[type="submit"]').element.disabled, true)
  await submit(view)
  assert.equal(addCalls(state).length, 1)
  assert.ok(state.calls.every((call) => !/^\/api\/v1\/lists\/\d+$/.test(call.path)))
})

test('Add failures are safe, local, and retryable with Library controls still usable', async () => {
  const state = backend()
  state.handlers.set('POST /api/v1/lists/11/items', () => fail(503, 'service_unavailable'))
  const { view } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  assert.match(listArea(view).get('[role="alert"]').text(), /could not be added/)
  assert.doesNotMatch(listArea(view).text(), /fixture-secret|provider\.test/)
  assert.equal(listArea(view).get('button[type="submit"]').element.disabled, false)
  assertPublicAndLibrary(view)
  state.handlers.clear()
  await submit(view)
  assert.equal(listArea(view).get('[role="status"]').text(), 'Added to Favorites.')
})

test('a deleted list gives local recovery and refreshes choices only on explicit Retry', async () => {
  const state = backend()
  state.handlers.set('POST /api/v1/lists/11/items', () => fail(404, 'list_not_found'))
  const { view } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  assert.match(listArea(view).get('[role="alert"]').text(), /list is no longer available/)
  assert.equal(summaryCalls(state).length, 1)
  state.lists = [summary('22', 'Next up')]
  await listArea(view).get('#media-list-panel button').trigger('click')
  await flushPromises()
  assert.deepEqual(listArea(view).findAll('option').map((option) => option.element.value), ['', '22'])
  assert.equal(listArea(view).get('select').element.value, '')
  assertPublicAndLibrary(view)
})

test('a missing Library entry disables stale submission and offers an explicit shared Library refresh', async () => {
  const state = backend()
  state.handlers.set('POST /api/v1/lists/11/items', () => fail(404, 'entry_not_found'))
  const { view } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  assert.match(listArea(view).get('[role="alert"]').text(), /Library entry is no longer available/)
  assert.equal(listArea(view).get('select').element.disabled, true)
  assert.equal(listArea(view).get('button[type="submit"]').element.disabled, true)
  assert.equal(listArea(view).get('button[aria-controls]').element.disabled, true)
  state.items = []
  const refresh = listArea(view).findAll('button').find((button) => button.text() === 'Refresh Library')
  await refresh.trigger('click')
  await flushPromises()
  assert.match(listArea(view).text(), /Add this item to your Library before/)
  assert.equal(view.get('.library-add-button').text(), 'Add to Library')
  assert.equal(listArea(view).find('form').exists(), false)
})

test('committed Library removal resets the selector and ignores slow Add completion and invalidated list cache', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const state = backend()
  const waiting = deferred()
  state.handlers.set('POST /api/v1/lists/11/items', () => waiting.promise)
  const { view } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  await view.get('.library-item-controls button').trigger('click')
  t.mock.timers.tick(8000)
  await flushPromises()
  assert.match(listArea(view).text(), /Add this item to your Library before/)
  assert.equal(listArea(view).find('button, select').exists(), false)
  waiting.resolve(ok({ added: true }))
  await flushPromises()
  assert.equal(listArea(view).find('[role="status"]').exists(), false)
  assert.equal(useLists().isListsLoaded.value, false)
  assert.equal(view.get('h1').text(), 'Fixture movie')
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  assert.equal(listArea(view).get('button').attributes('aria-expanded'), 'false')
})

test('a Library entry disappearing during CSRF prevents the queued list POST from being sent', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('GET /api/v1/auth/csrf', () => waiting.promise)
  const { view } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  assert.equal(addCalls(state).length, 0)
  state.items = []
  await useLibrary().loadLibrary(true)
  await flushPromises()
  waiting.resolve(ok({ csrfToken: 'fixture-csrf' }))
  await flushPromises()
  assert.equal(addCalls(state).length, 0)
  assert.match(listArea(view).text(), /Add this item to your Library before/)
})

for (const stage of ['loading', 'adding']) {
  test(`session expiry while ${stage} restores anonymous controls without hiding public detail`, async () => {
    const state = backend()
    state.handlers.set(stage === 'loading' ? 'GET /api/v1/lists' : 'POST /api/v1/lists/11/items', () => fail(401, 'unauthenticated'))
    const { view } = await page()
    await open(view)
    if (stage === 'adding') { await choose(view); await submit(view) }
    assert.equal(currentUser.value, null)
    assert.equal(view.find('.media-detail-lists').exists(), false)
    assert.equal(view.get('h1').text(), 'Fixture movie')
    assert.match(view.get('.media-detail-library').text(), /Log in to add to Library/)
  })
}

test('logout while summaries load discards private results and does not request anything as anonymous', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('GET /api/v1/lists', () => waiting.promise)
  const { view } = await page()
  await open(view)
  account(null)
  await flushPromises()
  const count = state.calls.length
  waiting.resolve(ok(state.lists))
  await flushPromises()
  assert.equal(view.find('.media-detail-lists').exists(), false)
  assert.equal(useLists().isListsLoaded.value, false)
  assert.deepEqual(useLists().lists.value, [])
  assert.equal(state.calls.length, count)
})

test('an account switch while loading ignores old choices and leaves the new account loading normally', async () => {
  const state = backend()
  const old = deferred()
  const fresh = deferred()
  state.handlers.set('GET /api/v1/lists', () => old.promise)
  const { view } = await page()
  await open(view)
  account('B')
  state.items = [entry('movie', '200')]
  state.handlers.set('GET /api/v1/lists', () => fresh.promise)
  await flushPromises()
  await open(view)
  old.resolve(ok([summary('11', 'Private A list')]))
  await flushPromises()
  assert.match(listArea(view).text(), /Loading your Custom Lists/)
  assert.doesNotMatch(view.text(), /Private A list/)
  fresh.resolve(ok([summary('33', 'Private B list')]))
  await flushPromises()
  assert.deepEqual(listArea(view).findAll('option').map((option) => option.element.value), ['', '33'])
})

test('an account switch during Add cannot alter new-account feedback, selection, or busy state', async () => {
  const state = backend()
  const old = deferred()
  const fresh = deferred()
  state.handlers.set('POST /api/v1/lists/11/items', () => old.promise)
  const { view } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  account('B')
  state.items = [entry('movie', '200')]
  await flushPromises()
  await open(view)
  await choose(view, '22')
  state.handlers.set('POST /api/v1/lists/22/items', () => fresh.promise)
  await submit(view)
  old.resolve(ok({ added: true }))
  await flushPromises()
  assert.equal(listArea(view).get('select').element.value, '22')
  assert.equal(listArea(view).get('select').element.disabled, true)
  assert.equal(listArea(view).find('[role="status"]').exists(), false)
  assert.equal(useLists().isListsLoaded.value, true)
  fresh.resolve(ok({ added: false }))
  await flushPromises()
  assert.equal(listArea(view).get('[role="status"]').text(), 'This item is already in this list.')
  assert.deepEqual(addCalls(state).at(-1).body, { userMediaId: '200' })
})

test('route changes reset selection/busy/feedback while movie and TV with the same provider ID stay distinct', async () => {
  const state = backend([entry(), entry('tv', '200')])
  const old = deferred()
  const fresh = deferred()
  state.handlers.set('POST /api/v1/lists/11/items', () => old.promise)
  const { view, router } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  await router.push(getMediaDetailPath(identities.tv))
  await flushPromises()
  assert.equal(listArea(view).get('button').attributes('aria-expanded'), 'false')
  assert.equal(listArea(view).get('button').element.disabled, false)
  await open(view)
  assert.equal(listArea(view).get('select').element.value, '')
  await choose(view, '22')
  state.handlers.set('POST /api/v1/lists/22/items', () => fresh.promise)
  await submit(view)
  old.resolve(fail(503, 'service_unavailable'))
  await flushPromises()
  assert.equal(listArea(view).get('select').element.disabled, true)
  assert.equal(listArea(view).find('[role="alert"]').exists(), false)
  fresh.resolve(ok({ added: true }))
  await flushPromises()
  assert.equal(listArea(view).get('[role="status"]').text(), 'Added to Next up.')
  assert.deepEqual(addCalls(state).map((call) => call.body), [{ userMediaId: '987654' }, { userMediaId: '200' }])
})

test('unmount while awaiting CSRF cancels queued Add and keeps cached public metadata free of private state', async () => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('GET /api/v1/auth/csrf', () => waiting.promise)
  const { view, router } = await page()
  await open(view)
  await choose(view)
  await submit(view)
  await router.push('/discover')
  waiting.resolve(ok({ csrfToken: 'fixture-csrf' }))
  await flushPromises()
  assert.equal(addCalls(state).length, 0)
  await router.push(getMediaDetailPath(identities.movie))
  await flushPromises()
  assert.equal(listArea(view).get('button').attributes('aria-expanded'), 'false')
  await open(view)
  await choose(view)
  state.handlers.clear()
  await submit(view)
  const scope = effectScope()
  scopes.push(scope)
  const cached = scope.run(() => useMediaDetails(identities.movie))
  await flushPromises()
  assert.deepEqual(cached.detail.value, mediaDetail('movie'))
  assert.equal(state.calls.filter((call) => call.path.startsWith('/api/v1/media/')).length, 1)
})
