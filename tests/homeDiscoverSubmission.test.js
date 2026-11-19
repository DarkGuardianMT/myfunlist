import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
const { mount, flushPromises } = await import('@vue/test-utils')
const { h } = await import('vue')
const { createRouter, createMemoryHistory, RouterView } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { clearDiscoverCache } = await import('../src/composables/useDiscoverSearch.js')
const { clearOpenLibraryCache } = await import('../src/services/openLibrary.js')
const { isDiscoverSubmission, submitDiscoverSearch } = await import('../src/router/discoverSubmission.js')
const Home = await loadVueComponent(new URL('../src/views/HomeView.vue', import.meta.url))
const Discover = await loadVueComponent(new URL('../src/views/DiscoverView.vue', import.meta.url))
const originalFetch = globalThis.fetch
const mounted = []
const work = { provider: 'open-library', workId: 'OL1W', workTitle: 'Inception', authors: [], firstPublicationYear: null,
  editionCount: 1, cover: null, selectedEdition: { editionId: 'OL2M', title: 'Inception', languages: [],
    languageStatus: 'unknown', publicationDates: [], isbns: [] } }
beforeEach(() => {
  currentUser.value = null
  isAuthLoading.value = false
  clearDiscoverCache()
  clearOpenLibraryCache()
})
afterEach(() => { mounted.splice(0).forEach(view => view.unmount()); globalThis.fetch = originalFetch })
after(() => dom.window.close())
const settle = async () => { await flushPromises(); await flushPromises() }
async function historyMove(router, direction) {
  const done = new Promise(resolve => { const remove = router.afterEach(() => { remove(); resolve() }) })
  router[direction]()
  await done
  await settle()
}

for (const type of ['movie', 'tv', 'game', 'book', 'open-library']) {
  test(`Home ${type} submission replaces a restored draft, reuses results and retains contextual/history restoration`, async () => {
    const category = type === 'open-library' ? 'book' : type
    let calls = 0
    globalThis.fetch = async path => {
      calls++
      if (path.startsWith('https://www.googleapis.com/')) return { ok: true, json: async () => ({ items: [{ id: 'volume1', volumeInfo: { title: 'Inception' } }] }) }
      const data = type === 'open-library' ? { provider: 'open-library', items: [work], providerTotal: 1,
        omitted: { invalid: 0, duplicateWork: 0, language: 0, isbn: 0 } }
        : [{ source: type === 'game' ? 'rawg' : 'tmdb', mediaType: type, sourceId: '42', title: 'Inception', platforms: [] }]
      return { ok: true, json: async () => ({ data }) }
    }
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: Home },
      { path: '/discover', component: Discover, props: { openLibraryEnabled: type === 'open-library' } },
      { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: { render: () => null } },
      ...['/login', '/register', '/library'].map(path => ({ path, component: { render: () => null } })),
    ] })
    const target = `/discover?type=${category}&q=Inception`
    await router.push(target)
    const view = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    mounted.push(view)
    await settle()
    const input = () => view.get('input[type=search]')
    await input().setValue('Inception unsent edit')
    await router.push('/media/movie/tmdb/42')
    await router.push(target)
    await settle()
    assert.equal(input().element.value, 'Inception unsent edit')
    await router.push('/')
    await settle()
    await view.get(`.home-search-types button:nth-child(${['movie', 'tv', 'game', 'book'].indexOf(category) + 1})`).trigger('click')
    await view.get('#home-query').setValue('  Inception  ')
    await view.get('form').trigger('submit')
    await settle()
    assert.equal(input().element.value, 'Inception')
    assert.equal(router.currentRoute.value.query.q, 'Inception')
    assert.equal(calls, 1)
    assert.match(view.get('article h3').text(), /Inception/)
    await input().setValue('New contextual draft')
    await router.push('/')
    await historyMove(router, 'back')
    assert.equal(input().element.value, 'New contextual draft')
    assert.equal(isDiscoverSubmission(router), false)
    await historyMove(router, 'forward')
    await view.get(`.home-search-types button:nth-child(${['movie', 'tv', 'game', 'book'].indexOf(category) + 1})`).trigger('click')
    await view.get('#home-query').setValue('Different query')
    await view.get('form').trigger('submit')
    await settle()
    assert.equal(input().element.value, 'Different query')
    assert.equal(calls, 2)
    await router.push(target)
    await settle()
    assert.equal(input().element.value, 'New contextual draft')
    assert.equal(calls, 2)
  })
}

test('cancelled explicit navigation does not mark a later ordinary navigation', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/discover'].map(path => ({ path, component: {} })) })
  await router.push('/')
  const remove = router.beforeEach(() => false)
  await submitDiscoverSearch(router, '/discover?q=cancelled')
  remove()
  await router.push('/discover?q=cancelled')
  assert.equal(isDiscoverSubmission(router), false)
})
