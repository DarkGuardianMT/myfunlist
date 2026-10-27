import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'
import { identities, metadata, mediaDetail, ok, fail } from './support/mediaDetails.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { mount, flushPromises } = await import('@vue/test-utils')
const { h, nextTick } = await import('vue')
const { createRouter, createMemoryHistory, RouterView } = await import('vue-router')
const { clearMediaDetailCache } = await import('../src/composables/useMediaDetails.js')

const MediaDetailView = await loadVueComponent(new URL('../src/views/MediaDetailView.vue', import.meta.url))

// Gebruik de echte routerconfiguratie; alleen geschiedenis en view-imports worden voor Node vervangen.
let routerCode = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
routerCode = routerCode.replace(/import (\w+) from ['"][^'"]+\.vue['"]/g, (_, name) => `const ${name} = { render: () => null }`)
routerCode = routerCode.replace("from 'vue-router'", `from '${import.meta.resolve('vue-router')}'`)
routerCode = routerCode.replace('createWebHistory(import.meta.env.BASE_URL)', 'testHistory()')
routerCode = `import { createMemoryHistory as testHistory } from '${import.meta.resolve('vue-router')}'\n${routerCode}`
const { default: configuredRouter } = await import(`data:text/javascript;base64,${Buffer.from(routerCode).toString('base64')}`)
const detailRoute = configuredRouter.getRoutes().find((route) => route.name === 'media-detail')
const mounted = []
const originalFetch = globalThis.fetch

async function page(path = '/media/movie/tmdb/42') {
  const navigation = createRouter({ history: createMemoryHistory(), routes: [
    { path: detailRoute.path, name: detailRoute.name, component: MediaDetailView },
    { path: '/discover', component: { render: () => null } },
  ] })
  await navigation.push(path)
  await navigation.isReady()
  const view = mount({ render: () => h(RouterView) }, { global: { plugins: [navigation] } })
  mounted.push(view)
  return { view, navigation }
}
afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount())
  clearMediaDetailCache()
  globalThis.fetch = originalFetch
  delete document.documentElement.dataset.theme
})
after(() => dom.window.close())

test('named detail route resolves canonical identities on direct entry without an account', async () => {
  assert.ok(detailRoute)
  for (const identity of Object.values(identities)) {
    const resolved = configuredRouter.resolve({ name: 'media-detail', params: identity })
    assert.equal(resolved.path, `/media/${identity.mediaType}/${identity.source}/${identity.sourceId}`)
    assert.deepEqual(resolved.params, identity)
  }
  const calls = []
  globalThis.fetch = async (path) => { calls.push(path); return ok(mediaDetail()) }
  const { view } = await page()
  await flushPromises()
  assert.equal(view.get('h1').text(), 'Fixture movie')
  assert.deepEqual(calls, ['/api/v1/media/movie/tmdb/42'])
  assert.equal(view.find('select').exists(), false)
  assert.equal(view.find('button').exists(), false)
  assert.doesNotMatch(view.text(), /Add to Library|Add to list|Personal rating/)
})

test('router starts new pages at the top and restores the browser history scroll position', () => {
  const scroll = configuredRouter.options.scrollBehavior
  assert.deepEqual(scroll({ name: 'media-detail' }, { path: '/discover' }, null), { left: 0, top: 0 })
  assert.deepEqual(scroll({ name: 'media-detail' }, { name: 'media-detail' }, null), { left: 0, top: 0 })
  const savedPosition = { left: 0, top: 640 }
  assert.equal(scroll({ path: '/library' }, { name: 'media-detail' }, savedPosition), savedPosition)
})

test('Book/Movie/TV/Game pages render their own metadata and provider attribution', async () => {
  for (const [type, identity] of Object.entries(identities)) {
    globalThis.fetch = async () => ok(mediaDetail(type))
    const { view } = await page(`/media/${type}/${identity.source}/${identity.sourceId}`)
    await flushPromises()
    assert.equal(view.get('h1').text(), `Fixture ${type}`)
    assert.equal(view.get('ul[aria-label="Genres"]').text(), 'Adventure')
    assert.equal(view.get('.media-detail-hero__description').text(), 'A public description.')
    assert.equal(view.findAll('.media-detail-metadata__row').length, Object.keys(metadata[type]).length)
    for (const [field, value] of Object.entries(metadata[type])) {
      const display = Array.isArray(value) ? value.join(', ') : field === 'runtimeMinutes' ? `${value} minutes` : String(value)
      assert.equal(view.get(`[data-field="${field}"] dd`).text(), display)
    }
    if (type === 'book') {
      assert.equal(view.get('time').attributes('datetime'), '1997-06')
      assert.equal(view.get('.media-detail-credits a').attributes('href'), 'https://books.google.com/')
    } else if (type === 'game') {
      assert.equal(view.get('.rawg-attribution a').attributes('href'), 'https://rawg.io/')
    } else {
      assert.match(view.get('.tmdb-attribution').text(), /not endorsed or certified by TMDB/)
      assert.equal(view.get('.tmdb-attribution img').attributes('alt'), 'TMDB')
    }
  }
})

test('sparse detail pages omit metadata, date, genres, descriptions, and artwork without placeholders', async () => {
  for (const [type, identity] of Object.entries(identities)) {
    globalThis.fetch = async () => ok({ ...identity, title: 'Sparse item', details: {} })
    const { view } = await page(`/media/${type}/${identity.source}/${identity.sourceId}`)
    await flushPromises()
    assert.equal(view.get('h1').text(), 'Sparse item')
    for (const selector of ['.media-detail-metadata', '.media-detail-hero__artwork', '.media-detail-hero__backdrop',
      '.media-detail-hero__description', '.media-detail-hero__genres', 'time']) assert.equal(view.find(selector).exists(), false)
    assert.ok(view.get('.media-detail-hero__body').classes().includes('media-detail-hero__body--text-only'))
    assert.doesNotMatch(view.text(), /unknown|No artwork|No description|Unavailable/)
  }
})

test('broken images collapse cleanly and provider text is rendered literally without HTML execution', async () => {
  globalThis.fetch = async () => ok(mediaDetail('movie', { backdropImage: 'https://example.test/backdrop.jpg',
    description: '<script>fixture-secret</script><b>Not markup</b>' }))
  const { view } = await page()
  await flushPromises()
  assert.equal(view.get('.media-detail-hero__description').text(), '<script>fixture-secret</script><b>Not markup</b>')
  assert.equal(view.find('script').exists(), false)
  assert.equal(view.find('.media-detail-hero__description b').exists(), false)
  await view.get('.media-detail-hero__artwork img').trigger('error')
  await view.get('.media-detail-hero__backdrop img').trigger('error')
  assert.equal(view.find('.media-detail-hero__artwork').exists(), false)
  assert.equal(view.find('.media-detail-hero__backdrop').exists(), false)
  assert.ok(view.get('.media-detail-hero__body').classes().includes('media-detail-hero__body--text-only'))
})

test('loading and errors have safe, distinct messages with explicit retry and Discover navigation', async () => {
  for (const [status, code, state, heading] of [[404, 'media_not_found', 'not-found', 'Media not found'],
    [503, 'provider_unavailable', 'provider-unavailable', 'Media provider temporarily unavailable'],
    [429, 'rate_limited', 'rate-limited', 'Too many detail requests'],
    [502, 'provider_error', 'error', 'Could not load media details'],
    [503, 'service_unavailable', 'error', 'Could not load media details']]) {
    clearMediaDetailCache()
    let finish
    let calls = 0
    globalThis.fetch = () => { calls++; return new Promise((resolve) => { finish = resolve }) }
    const { view } = await page()
    assert.equal(view.get('article').attributes('aria-busy'), 'true')
    assert.match(view.get('[role="status"]').text(), /Loading media/)
    finish(fail(status, code))
    await flushPromises()
    assert.equal(view.get('[role="alert"]').attributes('data-state'), state)
    assert.equal(view.get('h1').text(), heading)
    assert.equal(view.get('article').attributes('aria-busy'), 'false')
    assert.doesNotMatch(view.text(), /fixture-secret|provider\.test/)
    await flushPromises()
    assert.equal(calls, 1)
    if (status === 404) {
      assert.equal(view.get('[role="alert"] a').attributes('href'), '/discover')
      assert.equal(view.find('button').exists(), false)
    } else {
      globalThis.fetch = async () => { calls++; return ok(mediaDetail()) }
      await view.get('button').trigger('click')
      await flushPromises()
      assert.equal(view.get('h1').text(), 'Fixture movie')
      assert.equal(calls, 2)
    }
  }
})

test('invalid routes and network failures remain friendly and retryable where appropriate', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('fixture-secret') }
  const invalid = await page('/media/movie/rawg/42')
  await flushPromises()
  assert.equal(invalid.view.get('h1').text(), 'Media not found')
  assert.equal(calls, 0)
  const network = await page()
  await flushPromises()
  assert.equal(network.view.get('h1').text(), 'Could not connect')
  assert.equal(network.view.get('button').text(), 'Try again')
  assert.doesNotMatch(network.view.text(), /fixture-secret/)
})

test('a timed-out detail request renders a retryable timeout state', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  globalThis.fetch = async (_path, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
  const { view } = await page()
  context.mock.timers.tick(11000)
  await flushPromises()
  assert.equal(view.get('h1').text(), 'The request timed out')
  assert.equal(view.get('button').text(), 'Try again')
})

test('same-component route changes immediately clear old content and ignore late responses', async () => {
  const waiting = []
  globalThis.fetch = (path) => new Promise((resolve) => waiting.push({ path, resolve }))
  const { view, navigation } = await page()
  const instance = view.getComponent(MediaDetailView).vm
  await navigation.push('/media/tv/tmdb/42')
  await nextTick()
  assert.equal(view.getComponent(MediaDetailView).vm, instance)
  waiting[0].resolve(ok(mediaDetail('movie')))
  await flushPromises()
  assert.match(view.text(), /Loading media/)
  assert.doesNotMatch(view.text(), /Fixture movie/)
  waiting[1].resolve(ok(mediaDetail('tv')))
  await flushPromises()
  assert.equal(view.get('h1').text(), 'Fixture tv')
  await navigation.push('/media/book/google-books/Book_9-x')
  await nextTick()
  assert.equal(view.find('.media-detail-metadata').exists(), false)
  assert.doesNotMatch(view.text(), /Fixture tv/)
  waiting[2].resolve(ok(mediaDetail('book')))
  await flushPromises()
  assert.equal(view.get('h1').text(), 'Fixture book')
  assert.ok(waiting.every(({ path }) => path.startsWith('/api/v1/media/')))
})
