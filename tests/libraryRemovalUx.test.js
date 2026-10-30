import test, { beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'
import { identities, mediaDetail, ok, fail } from './support/mediaDetails.js'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
const { mount, flushPromises } = await import('@vue/test-utils')
const { h } = await import('vue')
const { createRouter, createMemoryHistory, RouterView } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { resetLibrary, useLibrary } = await import('../src/composables/useLibrary.js')
const { resetLists, useLists } = await import('../src/composables/useLists.js')
const { useLibraryBrowsing } = await import('../src/composables/useLibraryBrowsing.js')
const { advanceAuthEpoch, clearCsrfToken } = await import('../src/services/apiClient.js')
const { getMediaKey, getMediaDetailPath } = await import('../src/domain/mediaIdentity.js')
const Library = await loadVueComponent(new URL('../src/views/LibraryView.vue', import.meta.url))
const Detail = await loadVueComponent(new URL('../src/views/MediaDetailView.vue', import.meta.url))
const Notices = await loadVueComponent(new URL('../src/components/LibraryRemovalNotices.vue', import.meta.url))
const mounted = []
const originalFetch = globalThis.fetch
const library = useLibrary()
function deferred() {
  let resolve
  const promise = new Promise((finish) => { resolve = finish })
  return { promise, resolve }
}
function backend() {
  const state = { items: Object.entries(identities).map(([type, identity], index) => ({
    media: { ...identity, title: `Fixture ${type}`, authors: ['Author'], platforms: [] },
    userMedia: { id: String(index + 100), mediaKey: getMediaKey(identity),
      status: { book: 'reading', movie: 'watched', tv: 'watching', game: 'playing' }[type],
      rating: 8.5, addedAt: '2026-10-30T00:00:00Z' },
  })), calls: [], handlers: new Map() }
  globalThis.fetch = async (path, options) => {
    state.calls.push({ path, method: options.method })
    const handler = state.handlers.get(`${options.method} ${path}`)
    if (handler) return handler(options)
    if (path.startsWith('/api/v1/media/')) return ok(mediaDetail(path.split('/')[4]))
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
    if (path === '/api/v1/library') return ok(state.items)
    if (path === '/api/v1/lists') return ok([{ id: '1', title: 'Favorites' }])
    if (path === '/api/v1/lists/memberships') return ok({ memberships: state.items.map((item) => ({ listId: '1', userMediaId: item.userMedia.id })), nextCursor: null })
    if (options.method === 'DELETE') {
      state.items = state.items.filter((item) => item.userMedia.id !== path.split('/').at(-1))
      return { ok: true, status: 204 }
    }
    throw new Error(`Unexpected fixture request: ${path}`)
  }
  return state
}
async function page(path = '/library') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/library', component: Library },
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: Detail },
    ...['/lists', '/discover', '/login', '/register'].map((path) => ({ path, component: { render: () => h('h1', 'Other page') } })),
  ] })
  await router.push(path)
  const view = mount({ render: () => h('main', { id: 'main-content' }, [h(RouterView), h(Notices)]) },
    { attachTo: document.body, global: { plugins: [router] } })
  mounted.push(view)
  await flushPromises()
  return { view, router }
}
const panel = (view) => view.get('.library-removal-notices')
const undo = (view) => panel(view).get('button[aria-label^="Undo"]')
const cards = (view) => view.findAll('.library-grid > article')
const deletes = (state) => state.calls.filter((call) => call.method === 'DELETE')
beforeEach((t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 30) })
  currentUser.value = { id: 'A' }
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
  advanceAuthEpoch()
  resetLibrary()
  resetLists()
  clearCsrfToken()
  globalThis.fetch = originalFetch
  document.head.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
})
after(() => dom.window.close())

test('Remove hides only the Library card, announces its title and moves focus to a native Undo button', async () => {
  const state = backend()
  const { view } = await page()
  await view.get('#library-media-filter').setValue('book')
  await view.get('#library-status-filter').setValue('reading')
  await view.get('#library-sort-order').setValue('rating-high-low')
  view.get('.remove-button').element.focus()
  await view.get('.remove-button').trigger('click')
  await flushPromises()
  assert.equal(cards(view).length, 0)
  assert.match(view.get('.library-empty').text(), /No items match/)
  const notices = view.findComponent(Notices)
  assert.match(notices.get('[role="status"]').text(), /Fixture book.*Undo within 8 seconds/)
  assert.equal(notices.get('[role="status"]').attributes('aria-atomic'), 'true')
  assert.equal(undo(view).attributes('type'), 'button')
  assert.equal(undo(view).attributes('aria-label'), 'Undo removal of Fixture book')
  assert.equal(document.activeElement, undo(view).element)
  assert.equal(deletes(state).length, 0)
  assert.match(panel(view).text(), /Refresh or close this tab/)
  undo(view).element.click()
  await flushPromises()
  assert.equal(cards(view).length, 1)
  assert.equal(document.activeElement, view.get('.remove-button').element)
  assert.equal(view.get('.library-item-controls select').element.value, 'reading')
  assert.match(view.get('.personal-rating').text(), /8.5/)
  assert.equal(view.get('#library-sort-order').element.value, 'rating-high-low')
  assert.equal(state.items[0].userMedia.id, '100')
  assert.equal(panel(view).find('button[aria-label^="Undo"]').exists(), false)
  assert.match(notices.get('[role="status"]').text(), /was undone.*unchanged/)
})

test('expiry replaces Undo with progress and final feedback, and moves focus off the expired button', async (t) => {
  const state = backend()
  const waiting = deferred()
  state.handlers.set('DELETE /api/v1/library/100', () => waiting.promise)
  const { view } = await page()
  await view.get('#remove-library-100').trigger('click')
  await flushPromises()
  t.mock.timers.tick(8000)
  await flushPromises()
  assert.equal(deletes(state).length, 1)
  assert.equal(panel(view).find('button[aria-label^="Undo"]').exists(), false)
  assert.match(panel(view).text(), /Removing.*Fixture book.*Undo is no longer available/)
  assert.equal(document.activeElement, panel(view).get('article').element)
  waiting.resolve({ ok: true, status: 204 })
  await flushPromises()
  assert.match(panel(view).text(), /Fixture book.*was removed from your Library and Custom Lists/)
  assert.equal(library.libraryItems.value.length, 3)
  await panel(view).get('button').trigger('click')
  assert.equal(panel(view).isVisible(), false)
  assert.equal(document.activeElement, view.get('h1').element)
})

test('multiple removals show separate named Undo actions without losing the earlier one', async (t) => {
  const state = backend()
  const { view } = await page()
  await view.get('#remove-library-100').trigger('click')
  t.mock.timers.tick(2000)
  await view.get('#remove-library-101').trigger('click')
  await flushPromises()
  assert.equal(panel(view).findAll('button[aria-label^="Undo"]').length, 2)
  assert.equal(cards(view).length, 2)
  const bookUndo = panel(view).get('button[aria-label="Undo removal of Fixture book"]')
  await bookUndo.trigger('click')
  t.mock.timers.tick(6000)
  await flushPromises()
  assert.equal(deletes(state).length, 0)
  t.mock.timers.tick(2000)
  await flushPromises()
  assert.deepEqual(deletes(state).map((call) => call.path), ['/api/v1/library/101'])
  assert.equal(cards(view).length, 3)
})

test('hiding every item reports pending removal rather than an empty Library or absent filter matches', async () => {
  const state = backend()
  const { view } = await page()
  for (const id of ['100', '101', '102', '103']) await view.get(`#remove-library-${id}`).trigger('click')
  await flushPromises()
  assert.match(view.get('.library-empty').text(), /Library items are pending removal/)
  assert.doesNotMatch(view.get('.library-empty').text(), /Library is empty|No items match/)
  assert.equal(panel(view).findAll('button[aria-label^="Undo"]').length, 4)
  await undo(view).trigger('click')
  await flushPromises()
  assert.equal(cards(view).length, 1)
  assert.equal(deletes(state).length, 0)
})

test('navigation keeps Undo available; Detail retains the original entry and disables editing until Undo', async (t) => {
  const state = backend()
  const { view, router } = await page()
  await view.get('#remove-library-101').trigger('click')
  await router.push(getMediaDetailPath(identities.movie))
  await flushPromises()
  assert.match(view.get('h1').text(), /Fixture movie/)
  assert.equal(undo(view).attributes('aria-label'), 'Undo removal of Fixture movie')
  assert.equal(view.find('.library-add-button').exists(), false)
  assert.ok(view.findAll('.library-item-controls select, .library-item-controls button').every((control) => control.element.disabled))
  assert.equal(view.find('.media-detail-lists').exists(), false)
  await undo(view).trigger('click')
  await flushPromises()
  assert.equal(view.get('.library-item-controls button').element.disabled, false)
  await router.push('/library')
  await flushPromises()
  assert.equal(cards(view).length, 4)
  t.mock.timers.tick(10000)
  await flushPromises()
  assert.equal(deletes(state).length, 0)
})

test('route unmounting does not reset the eight-second deadline or drop removal feedback', async (t) => {
  const state = backend()
  const { view, router } = await page()
  await view.get('#remove-library-100').trigger('click')
  t.mock.timers.tick(4000)
  await router.push('/discover')
  t.mock.timers.tick(4000)
  await flushPromises()
  assert.equal(deletes(state).length, 1)
  assert.match(panel(view).text(), /Fixture book.*was removed/)
  await router.push('/library')
  await flushPromises()
  assert.equal(cards(view).length, 3)
})

test('refresh/pagehide cancels unsent removals; remounting and reloading keeps records and memberships', async (t) => {
  const state = backend()
  const { view } = await page()
  await useLists().loadMemberships()
  await view.get('#remove-library-100').trigger('click')
  window.dispatchEvent(new Event('pagehide'))
  await flushPromises()
  t.mock.timers.tick(10000)
  await flushPromises()
  assert.equal(deletes(state).length, 0)
  assert.equal(cards(view).length, 4)
  assert.equal(useLists().isListMember('1', '100'), true)
  view.unmount()
  mounted.splice(mounted.indexOf(view), 1)
  resetLibrary()
  resetLists()
  const fresh = await page()
  assert.equal(cards(fresh.view).length, 4)
  assert.deepEqual(library.removalNotices.value, [])
  assert.equal(state.items[0].userMedia.rating, 8.5)
})

test('unmounting the application cancels unsent work and pagehide cannot start a deletion later', async (t) => {
  const state = backend()
  const { view } = await page()
  await view.get('#remove-library-100').trigger('click')
  view.unmount()
  mounted.splice(mounted.indexOf(view), 1)
  t.mock.timers.tick(10000)
  window.dispatchEvent(new Event('pagehide'))
  await flushPromises()
  assert.equal(deletes(state).length, 0)
  assert.equal(library.displayLibraryItems.value.length, 4)
})

test('API failure restores visibility, announces the uncertain outcome and supports a new explicit attempt', async (t) => {
  const state = backend()
  state.handlers.set('DELETE /api/v1/library/100', () => fail(503, 'service_unavailable'))
  const { view } = await page()
  await view.get('#remove-library-100').trigger('click')
  t.mock.timers.tick(8000)
  await flushPromises()
  assert.equal(cards(view).length, 4)
  assert.match(view.findComponent(Notices).get('[role="alert"]').text(), /Fixture book.*could not be confirmed.*Refresh/)
  assert.equal(panel(view).find('button[aria-label^="Undo"]').exists(), false)
  state.handlers.clear()
  await view.get('#remove-library-100').trigger('click')
  t.mock.timers.tick(8000)
  await flushPromises()
  assert.equal(cards(view).length, 3)
  assert.equal(deletes(state).length, 2)
})

test('Light and Dark use theme tokens and Undo retains a 44px keyboard-focusable target', async () => {
  backend()
  const { view } = await page()
  const style = document.createElement('style')
  const componentCss = readFileSync(new URL('../src/components/LibraryRemovalNotices.vue', import.meta.url), 'utf8').match(/<style scoped>([\s\S]*?)<\/style>/)[1]
  style.textContent = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8') + componentCss
  document.head.append(style)
  await view.get('#remove-library-100').trigger('click')
  await flushPromises()
  for (const theme of ['light', 'dark']) {
    document.documentElement.setAttribute('data-theme', theme)
    const button = undo(view)
    assert.equal(window.getComputedStyle(button.element).minHeight, '44px')
    assert.equal(window.getComputedStyle(button.element).minWidth, '44px')
    button.element.focus()
    assert.equal(document.activeElement, button.element)
    assert.equal(button.element.disabled, false)
  }
})
