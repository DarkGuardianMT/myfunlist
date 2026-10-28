import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { mount, flushPromises } = await import('@vue/test-utils')
const { h, nextTick } = await import('vue')
const { createRouter, createMemoryHistory, RouterView } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { useAuth } = await import('../src/composables/useAuth.js')
const { resetLibrary } = await import('../src/composables/useLibrary.js')
const { clearCsrfToken } = await import('../src/services/apiClient.js')
const { clearMediaDetailCache } = await import('../src/composables/useMediaDetails.js')
const { clearDiscoverCache, DISCOVER_CACHE_TTL, DISCOVER_CACHE_LIMIT } = await import('../src/composables/useDiscoverSearch.js')
const { browsingScrollBehavior, rememberBrowsingPosition, clearBrowsingPositions, discoverReturnLocation } = await import('../src/router/browsingContext.js')

const DiscoverView = await loadVueComponent(new URL('../src/views/DiscoverView.vue', import.meta.url))
const LibraryView = await loadVueComponent(new URL('../src/views/LibraryView.vue', import.meta.url))
const MediaDetailView = await loadVueComponent(new URL('../src/views/MediaDetailView.vue', import.meta.url))
const mounted = []
const originalFetch = globalThis.fetch
const calls = []
const scrolls = []
const identities = {
  book: { mediaType: 'book', source: 'google-books', sourceId: 'OlCHcjX0RT4C' },
  movie: { mediaType: 'movie', source: 'tmdb', sourceId: '438631' },
  tv: { mediaType: 'tv', source: 'tmdb', sourceId: '1399' },
  game: { mediaType: 'game', source: 'rawg', sourceId: '9767' },
}
function media(type, title = { book: 'The Hobbit', movie: 'Dune', tv: 'Game of Thrones', game: 'Hollow Knight' }[type]) {
  return { ...identities[type], title, authors: ['Author'], platforms: ['PC'] }
}
function libraryItem(type, status) {
  const identity = identities[type]
  return { media: media(type), userMedia: { id: type === 'game' ? '1' : '2',
    mediaKey: `${identity.source}:${type}:${identity.sourceId}`, status, rating: 8,
    addedAt: '2026-01-01T00:00:00Z' } }
}
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }) })
function providerReply(type, query) {
  if (type === 'book') return { ok: true, status: 200, json: async () => ({ items: [{
    id: identities.book.sourceId, volumeInfo: { title: query, publishedDate: '2012' },
  }] }) }
  return ok([media(type, query)])
}
function defaultFetch(path, options = {}) {
  calls.push(path)
  const url = new URL(path, 'http://localhost')
  if (url.hostname === 'www.googleapis.com') return Promise.resolve(providerReply('book', url.searchParams.get('q')))
  if (url.pathname.startsWith('/api/v1/discover/')) return Promise.resolve(providerReply(url.pathname.split('/').at(-1), url.searchParams.get('q')))
  if (url.pathname.startsWith('/api/v1/media/')) {
    const type = url.pathname.split('/')[4]
    return Promise.resolve(ok({ ...media(type), details: {} }))
  }
  if (path === '/api/v1/auth/csrf') return Promise.resolve(ok({ csrfToken: 'fixture-csrf' }))
  if (path === '/api/v1/auth/logout') return Promise.resolve({ ok: true, status: 204 })
  if (path === '/api/v1/auth/login') return Promise.resolve(ok({ user: { id: '2', email: 'second@example.test' } }))
  if (path === '/api/v1/library') {
    return Promise.resolve(ok(currentUser.value?.id === '2' ? [libraryItem('tv', 'watching')]
      : [libraryItem('game', 'playing'), libraryItem('book', 'reading')]))
  }
  throw new Error(`Unexpected request: ${path} ${options.method || 'GET'}`)
}
function providerCalls() {
  return calls.filter((path) => path.includes('/volumes?') || path.includes('/discover/'))
}
async function settle() {
  await flushPromises()
  await flushPromises()
}
async function page(path = '/discover') {
  const router = createRouter({ history: createMemoryHistory(), scrollBehavior: browsingScrollBehavior, routes: [
    { path: '/', component: { render: () => h('h1', 'Home') } },
    { path: '/discover', component: DiscoverView },
    { path: '/library', component: LibraryView },
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: MediaDetailView },
    ...['/login', '/register', '/lists'].map((path) => ({ path, component: { render: () => null } })),
  ] })
  router.beforeEach((_to, from) => rememberBrowsingPosition(from, { left: window.scrollX, top: window.scrollY }))
  await router.push(path)
  await router.isReady()
  const view = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  mounted.push(view)
  await settle()
  return { view, router }
}
async function back(router) {
  const completed = new Promise((resolve) => {
    const remove = router.afterEach(() => { remove(); resolve() })
  })
  router.back()
  await completed
  await settle()
}
async function submit(view, query) {
  await view.get('input[type="search"]').setValue(query)
  await view.get('form').trigger('submit')
  await settle()
}

beforeEach(() => {
  currentUser.value = null
  isAuthLoading.value = false
  resetLibrary()
  clearCsrfToken()
  clearDiscoverCache()
  clearMediaDetailCache()
  clearBrowsingPositions('/discover')
  clearBrowsingPositions('/library')
  discoverReturnLocation.value = { path: '/discover' }
  calls.length = 0
  scrolls.length = 0
  window.scrollY = 0
  window.scrollTo = (position) => { scrolls.push(position); window.scrollY = position.top }
  globalThis.fetch = defaultFetch
})
afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount())
  globalThis.fetch = originalFetch
})
after(() => dom.window.close())

for (const [index, type] of Object.keys(identities).entries()) {
  test(`${type} query/results/type survive real view unmounts via Back and explicit Discover return without another search`, async () => {
    const { view, router } = await page()
    await view.findAll('.discover-type-switcher__button')[index].trigger('click')
    await settle()
    await submit(view, 'The Hobbit')
    const originalInstance = view.getComponent(DiscoverView).vm
    const location = router.currentRoute.value.fullPath
    assert.equal(router.currentRoute.value.query.q, 'The Hobbit')
    window.scrollY = 720
    await view.get('article h3 a').trigger('click')
    await settle()
    assert.equal(router.currentRoute.value.name, 'media-detail')
    assert.equal(view.findComponent(DiscoverView).exists(), false)
    await back(router)
    assert.notEqual(view.getComponent(DiscoverView).vm, originalInstance)
    assert.equal(router.currentRoute.value.fullPath, location)
    assert.equal(view.get(`#${type}-query`).element.value, 'The Hobbit')
    assert.equal(view.get('article h3').text(), 'The Hobbit')
    assert.deepEqual(scrolls.at(-1), { left: 0, top: 720 })
    await view.get('article h3 a').trigger('click')
    await settle()
    assert.equal(view.get('.media-detail-back').attributes('href'), location)
    await view.get('.media-detail-back').trigger('click')
    await settle()
    assert.equal(router.currentRoute.value.fullPath, location)
    assert.equal(view.get(`#${type}-query`).element.value, 'The Hobbit')
    assert.equal(view.get('article h3').text(), 'The Hobbit')
    assert.equal(providerCalls().length, 1)
    assert.deepEqual(scrolls.at(-1), { left: 0, top: 720 })
  })
}

test('direct URLs and refresh reconstruct searches; bare/invalid URLs and direct detail entry have safe defaults', async () => {
  const first = await page('/discover?type=game&q=Hollow%20Knight')
  assert.equal(first.view.get('#game-query').element.value, 'Hollow Knight')
  assert.equal(first.view.get('article h3').text(), 'Hollow Knight')
  const initialLocation = first.router.currentRoute.value.fullPath
  first.view.unmount()
  clearDiscoverCache()
  const refreshed = await page(initialLocation)
  assert.equal(refreshed.view.get('article h3').text(), 'Hollow Knight')
  assert.equal(providerCalls().length, 2)
  await refreshed.router.push('/discover?type=invalid&q=One&q=Two')
  await settle()
  assert.equal(refreshed.view.get('#book-query').element.value, '')
  assert.equal(refreshed.view.find('article').exists(), false)
  assert.equal(providerCalls().length, 2)
  await refreshed.router.push('/discover')
  await settle()
  assert.match(refreshed.view.text(), /Enter a title, author, or ISBN/)
  discoverReturnLocation.value = { path: '/discover' }
  await refreshed.router.push('/media/game/rawg/9767')
  await settle()
  assert.equal(refreshed.view.get('.media-detail-back').attributes('href'), '/discover')
  await refreshed.view.get('.media-detail-back').trigger('click')
  await settle()
  assert.equal(refreshed.view.find('article').exists(), false)
})

test('new queries clear old results, type keys stay separate, and late route responses cannot replace current content', async () => {
  const { view, router } = await page('/discover?type=movie&q=First')
  let finishOld
  globalThis.fetch = (path) => {
    if (path.includes('q=Slow')) {
      calls.push(path)
      return new Promise((resolve) => { finishOld = resolve })
    }
    return defaultFetch(path)
  }
  await submit(view, 'Slow')
  assert.match(view.text(), /Searching TMDB for “Slow”/)
  assert.equal(view.find('article').exists(), false)
  await router.push('/discover?type=game&q=First')
  await settle()
  assert.equal(view.get('#game-query').element.value, 'First')
  assert.equal(view.get('article h3 a').attributes('href'), '/media/game/rawg/9767')
  finishOld(providerReply('movie', 'Slow'))
  await settle()
  assert.doesNotMatch(view.text(), /Slow/)
  await router.push('/discover?type=movie&q=First')
  await settle()
  assert.equal(view.get('article h3 a').attributes('href'), '/media/movie/tmdb/438631')
  assert.equal(providerCalls().length, 3)
})

test('leaving and returning during a search deduplicates the pending request and ignores disposed view updates', async () => {
  let finish
  globalThis.fetch = (path) => {
    calls.push(path)
    return new Promise((resolve) => { finish = resolve })
  }
  const { view, router } = await page('/discover?type=game&q=Pending')
  await router.push('/')
  await settle()
  assert.equal(view.get('h1').text(), 'Home')
  await router.push('/discover?type=game&q=Pending')
  await settle()
  assert.equal(providerCalls().length, 1)
  finish(providerReply('game', 'Pending'))
  await settle()
  assert.equal(view.get('article h3').text(), 'Pending')
})

test('switching types preserves unsubmitted input without treating it as a submitted search', async () => {
  const { view } = await page('/discover?q=The%20Hobbit')
  await view.get('#book-query').setValue('Unsubmitted draft')
  await view.findAll('.discover-type-switcher__button')[3].trigger('click')
  await settle()
  await view.get('#game-query').setValue('Game draft')
  await view.findAll('.discover-type-switcher__button')[0].trigger('click')
  await settle()
  assert.equal(view.get('#book-query').element.value, 'Unsubmitted draft')
  assert.equal(view.get('article h3').text(), 'The Hobbit')
  assert.equal(providerCalls().length, 1)
  await view.findAll('.discover-type-switcher__button')[3].trigger('click')
  await settle()
  assert.equal(view.get('#game-query').element.value, 'Game draft')
  assert.equal(view.find('article').exists(), false)
  await view.get('form').trigger('submit')
  await settle()
  assert.equal(view.get('article h3').text(), 'Game draft')
})

test('successful result cache expires and evicts old searches; provider errors remain retryable', async (context) => {
  let now = Date.now()
  context.mock.method(Date, 'now', () => now)
  const { view, router } = await page('/discover?type=movie&q=Oldest')
  for (let index = 0; index < DISCOVER_CACHE_LIMIT; index++) {
    await router.push(`/discover?type=movie&q=Query${index}`)
    await settle()
  }
  const before = providerCalls().length
  await router.push('/discover?type=movie&q=Oldest')
  await settle()
  assert.equal(providerCalls().length, before + 1)
  await router.push('/')
  await router.push('/discover?type=movie&q=Oldest')
  await settle()
  assert.equal(providerCalls().length, before + 1)
  now += DISCOVER_CACHE_TTL + 1
  await router.push('/')
  await router.push('/discover?type=movie&q=Oldest')
  await settle()
  assert.equal(providerCalls().length, before + 2)
  globalThis.fetch = async (path) => {
    calls.push(path)
    return { ok: false, status: 503, json: async () => ({ error: { code: 'provider_unavailable', message: 'Unavailable' } }) }
  }
  await submit(view, 'Failure')
  assert.match(view.get('[role="alert"]').text(), /temporarily unavailable/)
  assert.equal(view.find('article').exists(), false)
  globalThis.fetch = defaultFetch
  await submit(view, 'Failure')
  assert.equal(view.get('article h3').text(), 'Failure')
})

test('book filters survive Back, explicit detail return and a fresh session reconstructed from the URL', async () => {
  const { view, router } = await page('/discover?q=Harry+Potter&field=title&sort=newest&lang=nl')
  const location = router.currentRoute.value.fullPath
  function assertFilters(target) {
    assert.equal(target.get('#book-query').element.value, 'Harry Potter')
    assert.equal(target.get('#book-search-field').element.value, 'title')
    assert.equal(target.get('#book-search-sort').element.value, 'newest')
    assert.equal(target.get('#book-search-language').element.value, 'nl')
  }
  assertFilters(view)
  assert.equal(new URL(providerCalls()[0]).searchParams.get('q'), 'intitle:"Harry" intitle:"Potter"')
  await view.get('article h3 a').trigger('click')
  await settle()
  await back(router)
  assertFilters(view)
  await view.get('article h3 a').trigger('click')
  await settle()
  assert.equal(view.get('.media-detail-back').attributes('href'), location)
  await view.get('.media-detail-back').trigger('click')
  await settle()
  assertFilters(view)
  assert.equal(providerCalls().length, 1)
  view.unmount()
  clearDiscoverCache()
  const refreshed = await page(location)
  assertFilters(refreshed.view)
  assert.equal(providerCalls().length, 2)
})

test('each book filter searches automatically, isolates cache entries and omits defaults from URLs', async () => {
  const { view, router } = await page('/discover?q=Hobbit')
  const initial = router.currentRoute.value.fullPath
  await view.get('#book-search-field').setValue('title')
  await settle()
  assert.equal(providerCalls().length, 2)
  assert.equal(router.currentRoute.value.query.field, 'title')
  await view.get('#book-search-language').setValue('tr')
  await settle()
  assert.equal(providerCalls().length, 3)
  assert.equal(new URL(providerCalls().at(-1)).searchParams.get('langRestrict'), 'tr')
  const beforeSort = router.currentRoute.value.fullPath
  await view.get('#book-search-sort').setValue('newest')
  await settle()
  assert.equal(providerCalls().length, 4)
  assert.equal(new URL(providerCalls().at(-1)).searchParams.get('orderBy'), 'newest')
  await back(router)
  assert.equal(router.currentRoute.value.fullPath, beforeSort)
  assert.equal(view.get('#book-search-sort').element.value, 'relevance')
  assert.equal(providerCalls().length, 4)
  await router.push(initial)
  await settle()
  assert.equal(view.get('#book-search-field').element.value, 'all')
  assert.equal(view.get('#book-search-language').element.value, 'any')
  assert.deepEqual(router.currentRoute.value.query, { q: 'Hobbit' })
  assert.equal(providerCalls().length, 4)
  await router.push('/discover?q=Hobbit&field=invalid&sort=invalid&lang=invalid')
  await settle()
  assert.equal(providerCalls().length, 4)
  await router.push('/discover?q=Hobbit&field=title&field=author&lang=nl&lang=tr')
  await settle()
  assert.equal(view.get('#book-search-field').element.value, 'all')
  assert.equal(view.get('#book-search-language').element.value, 'any')
  assert.equal(providerCalls().length, 4)
})

test('filter choices without a query stay idle; query encoding and type-specific filter context are retained', async () => {
  const { view, router } = await page()
  await view.get('#book-search-field').setValue('author')
  await settle()
  await view.get('#book-search-language').setValue('en')
  await settle()
  assert.equal(providerCalls().length, 0)
  const query = '"Le Guin" & İstanbul'
  await submit(view, query)
  const bookLocation = router.currentRoute.value.fullPath
  assert.equal(router.currentRoute.value.query.q, query)
  assert.match(bookLocation, /%22Le\+Guin%22/)
  for (const index of [1, 2, 3]) {
    await view.findAll('.discover-type-switcher__button')[index].trigger('click')
    await settle()
    assert.equal(view.find('#book-search-field').exists(), false)
    assert.equal(router.currentRoute.value.query.field, undefined)
    await submit(view, 'Independent')
  }
  await view.findAll('.discover-type-switcher__button')[0].trigger('click')
  await settle()
  assert.equal(router.currentRoute.value.fullPath, bookLocation)
  assert.equal(view.get('#book-search-field').element.value, 'author')
  assert.equal(view.get('#book-search-language').element.value, 'en')
  assert.equal(view.get('#book-query').element.value, query)
  assert.equal(providerCalls().length, 4)
})

test('late book filter responses cannot replace current results, and identical pending filters deduplicate', async () => {
  const { view, router } = await page('/discover?q=Hobbit')
  let finish
  globalThis.fetch = (path) => {
    if (new URL(path, 'http://localhost').searchParams.get('langRestrict') === 'nl') {
      calls.push(path)
      return new Promise((resolve) => { finish = resolve })
    }
    return defaultFetch(path)
  }
  await view.get('#book-search-language').setValue('nl')
  await settle()
  assert.match(view.text(), /Searching Google Books/)
  await view.get('#book-search-language').setValue('tr')
  await settle()
  finish(providerReply('book', 'Stale Dutch result'))
  await settle()
  assert.equal(view.get('#book-search-language').element.value, 'tr')
  assert.doesNotMatch(view.text(), /Stale Dutch result/)
  await router.push('/discover?q=Pending&lang=nl')
  await settle()
  const count = providerCalls().length
  await router.push('/')
  await router.push('/discover?q=Pending&lang=nl')
  await settle()
  assert.equal(providerCalls().length, count)
  finish(providerReply('book', 'Current Dutch result'))
  await settle()
  assert.equal(view.get('article h3').text(), 'Current Dutch result')
})

test('filtered empty searches offer broader constraints and provider errors stay visible and retryable', async () => {
  globalThis.fetch = async (path) => {
    calls.push(path)
    return { ok: true, json: async () => ({ totalItems: 0 }) }
  }
  const { view } = await page('/discover?q=Missing&field=title&lang=tr')
  assert.match(view.text(), /Try All fields or Any language/)
  await view.get('form').trigger('submit')
  await settle()
  assert.equal(providerCalls().length, 1)
  globalThis.fetch = async (path) => {
    calls.push(path)
    return { ok: false, status: 429 }
  }
  await view.get('#book-search-language').setValue('nl')
  await settle()
  assert.match(view.get('[role="alert"]').text(), /too many requests/)
  globalThis.fetch = defaultFetch
  await view.get('form').trigger('submit')
  await settle()
  assert.equal(view.findAll('article').length, 1)
  assert.equal(providerCalls().length, 3)
})

test('Library type, valid status and sort survive detail Back, and switching types resets only status', async () => {
  currentUser.value = { id: '1', email: 'first@example.test' }
  const { view, router } = await page('/library')
  await view.get('#library-media-filter').setValue('game')
  await view.get('#library-status-filter').setValue('playing')
  await view.get('#library-sort-order').setValue('title')
  window.scrollY = 460
  await view.get('article h3 a').trigger('click')
  await settle()
  await back(router)
  assert.equal(view.get('#library-media-filter').element.value, 'game')
  assert.equal(view.get('#library-status-filter').element.value, 'playing')
  assert.equal(view.get('#library-sort-order').element.value, 'title')
  assert.equal(view.get('article h3').text(), 'Hollow Knight')
  assert.deepEqual(scrolls.at(-1), { left: 0, top: 460 })
  await view.get('#library-media-filter').setValue('book')
  assert.equal(view.get('#library-status-filter').element.value, 'all')
  assert.equal(view.get('#library-sort-order').element.value, 'title')
  await view.get('#library-status-filter').setValue('reading')
  await view.get('article h3 a').trigger('click')
  await settle()
  await back(router)
  assert.equal(view.get('#library-status-filter').element.value, 'reading')
  await view.get('#library-media-filter').setValue('all')
  assert.equal(view.find('#library-status-filter').exists(), false)
  assert.equal(view.findAll('article').length, 2)
})

test('logout and account switching while off Library clear private browsing context and data', async () => {
  currentUser.value = { id: '1', email: 'first@example.test' }
  const { view, router } = await page('/library')
  await view.get('#library-media-filter').setValue('game')
  await view.get('#library-status-filter').setValue('playing')
  await view.get('#library-sort-order').setValue('title')
  await view.get('article h3 a').trigger('click')
  await settle()
  await useAuth().logout()
  await back(router)
  assert.match(view.text(), /Log in or register/)
  assert.doesNotMatch(view.text(), /Hollow Knight|The Hobbit/)
  await useAuth().login('second@example.test', 'long-fixture-password')
  await settle()
  assert.equal(view.get('#library-media-filter').element.value, 'all')
  assert.equal(view.get('#library-sort-order').element.value, 'recent')
  assert.equal(view.find('#library-status-filter').exists(), false)
  assert.equal(view.get('article h3').text(), 'Game of Thrones')
  await view.get('#library-media-filter').setValue('tv')
  await view.get('#library-status-filter').setValue('watching')
  await view.get('#library-sort-order').setValue('rating-high-low')
  await router.push('/media/game/rawg/9767')
  await settle()
  // Wissel rechtstreeks van account, zonder dat Library gemount is.
  currentUser.value = { id: '3', email: 'third@example.test' }
  resetLibrary()
  await back(router)
  assert.equal(view.get('#library-media-filter').element.value, 'all')
  assert.equal(view.get('#library-sort-order').element.value, 'recent')
})

test('scroll restoration waits for results, honors saved history positions, and cannot scroll a newer page', async () => {
  const { view, router } = await page('/discover?q=The%20Hobbit')
  window.scrollY = 650
  await view.get('article h3 a').trigger('click')
  await settle()
  assert.deepEqual(scrolls.at(-1), { left: 0, top: 0 })
  clearDiscoverCache()
  let finish
  globalThis.fetch = (path) => {
    calls.push(path)
    return new Promise((resolve) => { finish = resolve })
  }
  await back(router)
  assert.match(view.text(), /Searching Google Books/)
  const saved = { left: 0, top: 800 }
  let restored = false
  const restoration = browsingScrollBehavior(router.currentRoute.value, { name: 'media-detail' }, saved)
    .then((position) => { restored = true; return position })
  await nextTick()
  assert.equal(restored, false)
  finish(providerReply('book', 'The Hobbit'))
  await settle()
  assert.deepEqual(await restoration, saved)
  assert.equal(view.findAll('article').length, 1)
  await view.get('article h3 a').trigger('click')
  await settle()
  clearDiscoverCache()
  await back(router)
  assert.match(view.text(), /Searching Google Books/)
  await router.push('/')
  await settle()
  finish(providerReply('book', 'The Hobbit'))
  await settle()
  assert.equal(view.get('h1').text(), 'Home')
  assert.deepEqual(scrolls.at(-1), { left: 0, top: 0 })
})
