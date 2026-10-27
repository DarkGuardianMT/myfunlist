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
const { resetLists } = await import('../src/composables/useLists.js')
const { clearMediaDetailCache, useMediaDetails } = await import('../src/composables/useMediaDetails.js')
const { clearCsrfToken, advanceAuthEpoch } = await import('../src/services/apiClient.js')
const { getDefaultStatus, getStatusOptions, PERSONAL_RATINGS } = await import('../src/domain/libraryMedia.js')
const { getMediaKey, getMediaDetailPath } = await import('../src/domain/mediaIdentity.js')
const MediaDetailView = await loadVueComponent(new URL('../src/views/MediaDetailView.vue', import.meta.url))
const LibraryView = await loadVueComponent(new URL('../src/views/LibraryView.vue', import.meta.url))
const LibraryItemControls = await loadVueComponent(new URL('../src/components/LibraryItemControls.vue', import.meta.url))
const mounted = []
const scopes = []
const originalFetch = globalThis.fetch
const libraryPath = '/api/v1/library'

function entry(type = 'movie', id = '100', overrides = {}) {
  return {
    media: { ...identities[type], title: `Fixture ${type}`, authors: ['Author'], platforms: ['PC'] },
    userMedia: { id, mediaKey: getMediaKey(identities[type]), status: getDefaultStatus(type),
      rating: null, addedAt: '2026-01-01T00:00:00Z', ...overrides },
  }
}
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
function backend(items = []) {
  const state = { items, calls: [], handlers: new Map(), added: true }
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || 'GET'
    state.calls.push({ path, method, body: options.body && JSON.parse(options.body) })
    const handler = state.handlers.get(`${method} ${path}`)
    if (handler) return handler(options)
    if (path.startsWith('/api/v1/media/')) return ok(mediaDetail(path.split('/')[4]))
    if (path === '/api/v1/auth/csrf') return ok({ csrfToken: 'fixture-csrf' })
    if (path === libraryPath && method === 'GET') return ok(state.items)
    if (path === libraryPath && method === 'POST') {
      const identity = JSON.parse(options.body).media
      const item = state.items.find((item) => item.userMedia.mediaKey === getMediaKey(identity)) || entry(identity.mediaType)
      state.items = [...state.items.filter((saved) => saved.userMedia.mediaKey !== item.userMedia.mediaKey), item]
      return ok({ added: state.added, item })
    }
    if (path.startsWith(`${libraryPath}/`)) {
      const id = path.split('/').at(-1)
      const item = state.items.find((item) => item.userMedia.id === id)
      if (method === 'PATCH' && item) {
        const updated = { ...item, userMedia: { ...item.userMedia, ...JSON.parse(options.body) } }
        state.items = state.items.map((item) => item.userMedia.id === id ? updated : item)
        return ok(updated)
      }
      if (method === 'DELETE' && item) {
        state.items = state.items.filter((item) => item.userMedia.id !== id)
        return { ok: true, status: 204 }
      }
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`)
  }
  return state
}
async function page(type = 'movie', path = getMediaDetailPath(identities[type])) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: MediaDetailView },
    { path: '/library', component: LibraryView },
    ...['/discover', '/login', '/register'].map((path) => ({ path, component: { render: () => null } })),
  ] })
  await router.push(path)
  const view = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  mounted.push(view)
  await flushPromises()
  return { view, router }
}
const controls = (view) => view.get('.library-item-controls')
const statusSelect = (view) => controls(view).findAll('select')[0]
const ratingSelect = (view) => controls(view).findAll('select')[1]
const libraryCalls = (state, method = 'GET') => state.calls.filter((call) => call.path === libraryPath && call.method === method)
function assertPublic(view, type = 'movie') {
  assert.equal(view.get('h1').text(), `Fixture ${type}`)
  assert.equal(view.get('.media-detail-hero__description').text(), 'A public description.')
  assert.equal(view.find('.media-detail-lists__panel').exists(), false)
}

beforeEach(() => {
  account(null)
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

test('anonymous detail remains public with real Login/Register links and no Library requests', async () => {
  const state = backend()
  const { view } = await page()
  assertPublic(view)
  assert.deepEqual(state.calls.map((call) => call.path), ['/api/v1/media/movie/tmdb/42'])
  assert.deepEqual(view.findAll('.media-detail-library a').map((link) => link.attributes('href')), ['/login', '/register'])
  assert.match(view.get('.media-detail-library').text(), /Log in to add to Library/)
  assert.equal(view.find('select').exists(), false)
})

test('session and Library loading leave public metadata visible and never offer Add prematurely', async () => {
  isAuthLoading.value = true
  const state = backend()
  const waiting = deferred()
  state.handlers.set(`GET ${libraryPath}`, () => waiting.promise)
  const { view } = await page()
  assertPublic(view)
  assert.match(view.get('.media-detail-library').text(), /Checking your session/)
  assert.equal(libraryCalls(state).length, 0)
  account('A')
  isAuthLoading.value = false
  await flushPromises()
  assertPublic(view)
  assert.match(view.get('.media-detail-library').text(), /Loading your Library/)
  assert.equal(view.find('.library-add-button').exists(), false)
  waiting.resolve(ok([]))
  await flushPromises()
  assert.equal(view.get('.library-add-button').text(), 'Add to Library')
  assert.equal(libraryCalls(state).length, 1)
})

for (const type of Object.keys(identities)) {
  test(`${type} detail reuses labelled Library controls with the correct statuses and all half-point ratings`, async () => {
    account('A')
    const item = entry(type, '100', { rating: 8 })
    const state = backend([item])
    const { view } = await page(type)
    assertPublic(view, type)
    assert.ok(view.findComponent(LibraryItemControls).exists())
    assert.deepEqual(statusSelect(view).findAll('option').map((option) => [option.element.value, option.text()]),
      getStatusOptions(type).map(({ value, label }) => [value, label]))
    assert.equal(statusSelect(view).element.value, item.userMedia.status)
    assert.deepEqual(ratingSelect(view).findAll('option').map((option) => option.element.value), ['', ...PERSONAL_RATINGS.map(String)])
    assert.equal(ratingSelect(view).findAll('option')[0].text(), 'Not rated')
    assert.equal(ratingSelect(view).element.value, '8')
    for (const select of controls(view).findAll('select')) {
      assert.ok(select.attributes('aria-label').includes(item.media.title))
      assert.ok(controls(view).findAll('label').some((label) => label.attributes('for') === select.attributes('id')))
    }
    assert.equal(controls(view).get('button').attributes('type'), 'button')
    assert.equal(controls(view).get('button').attributes('aria-label'), `Remove Fixture ${type} from Library`)
    assert.equal(libraryCalls(state).length, 1)
  })

  test(`${type} Add submits only canonical identity and immediately displays shared Library state`, async () => {
    account('A')
    const state = backend()
    const waiting = deferred()
    state.handlers.set(`POST ${libraryPath}`, () => waiting.promise)
    const { view, router } = await page(type)
    const add = view.get('.library-add-button')
    await add.trigger('click')
    await add.trigger('click')
    await flushPromises()
    assert.equal(add.element.disabled, true)
    assert.equal(libraryCalls(state, 'POST').length, 1)
    assert.deepEqual(libraryCalls(state, 'POST')[0].body, { media: identities[type] })
    waiting.resolve(ok({ added: true, item: entry(type) }))
    await flushPromises()
    assert.ok(view.findComponent(LibraryItemControls).exists())
    assert.equal(useLibrary().libraryItems.value.length, 1)
    assert.match(view.get('[role="status"]').text(), /Added to Library/)
    assert.equal(router.currentRoute.value.path, getMediaDetailPath(identities[type]))
    assertPublic(view, type)
  })
}

test('an already-existing response uses the authoritative returned status and rating', async () => {
  account('A')
  const state = backend()
  state.handlers.set(`POST ${libraryPath}`, () => ok({ added: false,
    item: entry('movie', '900', { status: 'watched', rating: 9.5 }) }))
  const { view } = await page()
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  assert.equal(statusSelect(view).element.value, 'watched')
  assert.equal(ratingSelect(view).element.value, '9.5')
  assert.match(view.get('[role="status"]').text(), /Already in your Library/)
})

test('Add failures stay local, reveal no raw provider errors, and remain retryable', async () => {
  account('A')
  const state = backend()
  state.handlers.set(`POST ${libraryPath}`, () => fail(503, 'provider_unavailable'))
  const { view } = await page()
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  assertPublic(view)
  assert.match(view.get('[role="alert"]').text(), /could not be added/)
  assert.doesNotMatch(view.text(), /fixture-secret|provider\.test/)
  assert.equal(view.get('.library-add-button').element.disabled, false)
  assert.equal(view.find('.library-item-controls').exists(), false)
  state.handlers.clear()
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  assert.ok(view.find('.library-item-controls').exists())
})

test('status, rating, Not rated, and removal update shared state while keeping the public page open', async () => {
  account('A')
  const state = backend([entry('game')])
  const { view, router } = await page('game')
  await statusSelect(view).setValue('playing')
  await flushPromises()
  assert.equal(useLibrary().libraryItems.value[0].userMedia.status, 'playing')
  await ratingSelect(view).setValue('0.5')
  await flushPromises()
  assert.equal(useLibrary().libraryItems.value[0].userMedia.rating, 0.5)
  await ratingSelect(view).setValue('10')
  await flushPromises()
  assert.equal(ratingSelect(view).element.value, '10')
  await ratingSelect(view).setValue('')
  await flushPromises()
  assert.equal(useLibrary().libraryItems.value[0].userMedia.rating, null)
  assert.match(controls(view).text(), /Unrated/)
  const waiting = deferred()
  state.handlers.set(`DELETE ${libraryPath}/100`, () => waiting.promise)
  await controls(view).get('button').trigger('click')
  await controls(view).get('button').trigger('click')
  await flushPromises()
  assert.ok(controls(view).findAll('select, button').every((control) => control.element.disabled))
  assert.equal(state.calls.filter((call) => call.method === 'DELETE').length, 1)
  waiting.resolve({ ok: true, status: 204 })
  await flushPromises()
  assert.equal(useLibrary().libraryItems.value.length, 0)
  assert.equal(view.get('.library-add-button').text(), 'Add to Library')
  assert.equal(router.currentRoute.value.path, getMediaDetailPath(identities.game))
  assert.match(view.get('[role="status"]').text(), /Removed from Library/)
  assertPublic(view, 'game')
  assert.equal(state.calls.filter((call) => call.path.startsWith('/api/v1/media/')).length, 1)
})

test('failed status, rating, and remove actions restore controls and keep public metadata', async () => {
  account('A')
  const state = backend([entry('movie', '100', { rating: 7 })])
  state.handlers.set(`PATCH ${libraryPath}/100`, () => fail(503, 'service_unavailable'))
  state.handlers.set(`DELETE ${libraryPath}/100`, () => fail(503, 'service_unavailable'))
  const { view } = await page()
  await statusSelect(view).setValue('watched')
  await flushPromises()
  assert.equal(statusSelect(view).element.value, 'want-to-watch')
  assert.match(view.get('[role="alert"]').text(), /status could not be updated/)
  await ratingSelect(view).setValue('10')
  await flushPromises()
  assert.equal(ratingSelect(view).element.value, '7')
  assert.match(view.get('[role="alert"]').text(), /rating could not be updated/)
  await controls(view).get('button').trigger('click')
  await flushPromises()
  assert.match(view.get('[role="alert"]').text(), /could not be removed/)
  assert.equal(controls(view).get('button').element.disabled, false)
  assertPublic(view)
})

test('a failed Library load is not mistaken for non-membership and Retry only reloads Library', async () => {
  account('A')
  const state = backend([entry()])
  state.handlers.set(`GET ${libraryPath}`, () => fail(503, 'service_unavailable'))
  const { view } = await page()
  assertPublic(view)
  assert.match(view.get('.media-detail-library [role="alert"]').text(), /Library is unavailable/)
  assert.equal(view.find('.library-add-button').exists(), false)
  state.handlers.clear()
  await view.get('.media-detail-library button').trigger('click')
  await flushPromises()
  assert.ok(view.find('.library-item-controls').exists())
  assert.equal(libraryCalls(state).length, 2)
  assert.equal(state.calls.filter((call) => call.path.startsWith('/api/v1/media/')).length, 1)
})

test('session expiry during Library access leaves public detail visible and offers login again', async () => {
  account('A')
  const state = backend()
  state.handlers.set(`GET ${libraryPath}`, () => fail(401, 'unauthenticated'))
  const { view } = await page()
  assertPublic(view)
  assert.equal(currentUser.value, null)
  assert.match(view.get('.media-detail-library').text(), /Log in to add to Library/)
  assert.equal(view.find('.library-add-button').exists(), false)
})

test('session expiry during a mutation drops personal controls and keeps public metadata intact', async () => {
  account('A')
  const state = backend([entry()])
  state.handlers.set(`PATCH ${libraryPath}/100`, () => fail(401, 'unauthenticated'))
  const { view } = await page()
  await ratingSelect(view).setValue('10')
  await flushPromises()
  assert.equal(currentUser.value, null)
  assert.equal(useLibrary().libraryItems.value.length, 0)
  assert.match(view.get('.media-detail-library').text(), /Log in to add to Library/)
  assert.equal(view.find('.library-item-controls').exists(), false)
  assert.equal(view.find('.library-feedback').exists(), false)
  assertPublic(view)
})

for (const action of ['add', 'status', 'rating', 'remove']) {
  test(`an account switch during ${action} ignores old results and preserves the new account's busy state`, async () => {
    account('A')
    const state = backend(action === 'add' ? [] : [entry()])
    const old = deferred()
    const method = action === 'add' ? 'POST' : action === 'remove' ? 'DELETE' : 'PATCH'
    const path = action === 'add' ? libraryPath : `${libraryPath}/100`
    state.handlers.set(`${method} ${path}`, () => old.promise)
    const { view } = await page()
    if (action === 'add') await view.get('.library-add-button').trigger('click')
    else if (action === 'remove') await controls(view).get('button').trigger('click')
    else await (action === 'status' ? statusSelect(view) : ratingSelect(view)).setValue(action === 'status' ? 'watched' : '10')
    await flushPromises()
    account('B')
    state.items = [entry('movie', '200', { rating: 2 })]
    await flushPromises()
    assert.equal(ratingSelect(view).element.value, '2')
    const fresh = deferred()
    state.handlers.set(`PATCH ${libraryPath}/200`, () => fresh.promise)
    await statusSelect(view).setValue('watched')
    await flushPromises()
    old.resolve(action === 'add' ? ok({ added: true, item: entry('movie', '100', { rating: 10 }) })
      : action === 'remove' ? { ok: true, status: 204 } : ok(entry('movie', '100', { rating: 10 })))
    await flushPromises()
    assert.equal(useLibrary().libraryItems.value[0].userMedia.id, '200')
    assert.equal(ratingSelect(view).element.value, '2')
    assert.ok(controls(view).findAll('select, button').every((control) => control.element.disabled))
    assert.equal(view.find('.library-feedback').exists(), false)
    fresh.resolve(ok(entry('movie', '200', { status: 'watched', rating: 2 })))
    await flushPromises()
    assert.equal(statusSelect(view).element.value, 'watched')
    assert.equal(controls(view).get('button').element.disabled, false)
    assertPublic(view)
  })
}

test('logout and same-account login discard a pending failure without hiding metadata or leaking feedback', async () => {
  account('A')
  const state = backend([entry()])
  const old = deferred()
  state.handlers.set(`PATCH ${libraryPath}/100`, () => old.promise)
  const { view } = await page()
  await ratingSelect(view).setValue('10')
  await flushPromises()
  account(null)
  await flushPromises()
  assertPublic(view)
  assert.match(view.get('.media-detail-library').text(), /Log in to add to Library/)
  account('A')
  state.items = []
  await flushPromises()
  old.resolve(fail(503, 'service_unavailable'))
  await flushPromises()
  assert.equal(view.get('.library-add-button').element.disabled, false)
  assert.equal(view.find('.library-feedback').exists(), false)
  assert.equal(useLibrary().libraryItems.value.length, 0)
})

test('direct identity changes reset feedback/busy and keep same-ID movie and TV mutations independent', async () => {
  account('A')
  const state = backend()
  const movieAdd = deferred()
  const tvAdd = deferred()
  state.handlers.set(`POST ${libraryPath}`, (options) => JSON.parse(options.body).media.mediaType === 'movie' ? movieAdd.promise : tvAdd.promise)
  const { view, router } = await page()
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  await router.push(getMediaDetailPath(identities.tv))
  await flushPromises()
  assertPublic(view, 'tv')
  assert.equal(view.get('.library-add-button').element.disabled, false)
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  movieAdd.resolve(ok({ added: true, item: entry('movie') }))
  await flushPromises()
  assert.equal(view.get('.library-add-button').element.disabled, true)
  assert.equal(view.find('.library-feedback').exists(), false)
  tvAdd.resolve(ok({ added: true, item: entry('tv', '200') }))
  await flushPromises()
  assert.equal(controls(view).get('button').attributes('aria-label'), 'Remove Fixture tv from Library')
  assert.equal(useLibrary().libraryItems.value.length, 2)
  await router.push(getMediaDetailPath(identities.game))
  await flushPromises()
  assert.equal(view.find('.library-feedback').exists(), false)
  assert.equal(view.get('.library-add-button').element.disabled, false)
})

test('shared public detail cache stays personal-state-free across mutations, logout, and revisits', async () => {
  account('A')
  const state = backend()
  const { view, router } = await page()
  await view.get('.library-add-button').trigger('click')
  await flushPromises()
  await ratingSelect(view).setValue('9')
  await flushPromises()
  const scope = effectScope()
  scopes.push(scope)
  const cached = scope.run(() => useMediaDetails(identities.movie))
  await flushPromises()
  assert.deepEqual(cached.detail.value, mediaDetail('movie'))
  account(null)
  await router.push('/discover')
  await router.push(getMediaDetailPath(identities.movie))
  await flushPromises()
  assertPublic(view)
  assert.match(view.get('.media-detail-library').text(), /Log in to add to Library/)
  assert.equal(state.calls.filter((call) => call.path.startsWith('/api/v1/media/')).length, 1)
})

test('Library page reuses extracted controls while filters, sorting, actions, and card links still work', async () => {
  account('A')
  const state = backend([entry('book', '100'), entry('movie', '200')])
  const { view } = await page('movie', '/library')
  assert.equal(view.findAllComponents(LibraryItemControls).length, 2)
  await view.get('#library-media-filter').setValue('book')
  assert.equal(view.findAll('article').length, 1)
  assert.equal(view.get('article h3 a').attributes('href'), getMediaDetailPath(identities.book))
  await statusSelect(view).setValue('reading')
  await flushPromises()
  await ratingSelect(view).setValue('8.5')
  await flushPromises()
  assert.equal(useLibrary().libraryItems.value.find((item) => item.media.mediaType === 'book').userMedia.rating, 8.5)
  await view.get('#library-status-filter').setValue('reading')
  assert.equal(view.findAll('article').length, 1)
  await view.get('#library-sort-order').setValue('rating-high-low')
  await controls(view).get('button').trigger('click')
  await flushPromises()
  assert.equal(view.findAll('article').length, 0)
  assert.equal(state.items.length, 1)
})
