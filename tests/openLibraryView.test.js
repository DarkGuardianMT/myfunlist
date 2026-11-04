import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
const { mount, flushPromises } = await import('@vue/test-utils')
const { createRouter, createMemoryHistory } = await import('vue-router')
const { clearOpenLibraryCache } = await import('../src/services/openLibrary.js')
const { clearDiscoverCache } = await import('../src/composables/useDiscoverSearch.js')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const OpenLibraryDiscover = await loadVueComponent(new URL('../src/components/OpenLibraryDiscover.vue', import.meta.url))
OpenLibraryDiscover.name = 'OpenLibraryDiscover'
const DiscoverView = await loadVueComponent(new URL('../src/views/DiscoverView.vue', import.meta.url))
const WorkCard = await loadVueComponent(new URL('../src/components/OpenLibraryWorkCard.vue', import.meta.url))
const originalFetch = globalThis.fetch
const mounted = []
const work = { provider: 'open-library', workId: 'OL1W', workTitle: 'A modern book', authors: [], firstPublicationYear: 2024,
  editionCount: 2, cover: null, provenance: {}, selectedEdition: { editionId: 'OL2M', title: 'Een modern boek',
    languages: ['dut'], languageStatus: 'match', publicationDates: ['2025-03'], isbns: [] } }
const response = (items = [work], omitted = {}) => ({ provider: 'open-library', items, providerTotal: items.length,
  omitted: { invalid: 0, duplicateWork: 0, language: 0, isbn: 0, ...omitted } })
const ok = data => ({ ok: true, json: async () => ({ data }) })
async function page(path = '/discover?provider=open-library&q=modern', component = OpenLibraryDiscover, props = { enabled: true }, stubs = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    ...['/discover', '/library', '/login', '/register'].map(path => ({ path, component: {} })),
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: {} },
  ] })
  await router.push(path)
  const view = mount(component, { props, global: { plugins: [router], stubs } })
  mounted.push(view)
  await flushPromises()
  return { view, router }
}
beforeEach(() => {
  clearOpenLibraryCache()
  clearDiscoverCache()
  currentUser.value = null
  isAuthLoading.value = false
})
afterEach(() => { mounted.splice(0).forEach(view => view.unmount()); globalThis.fetch = originalFetch })
after(() => dom.window.close())

test('blocked Open Library sends zero requests and Google remains separately functional', async () => {
  const calls = []
  globalThis.fetch = async path => { calls.push(path); return { ok: true, json: async () => ({ items: [{ id: 'volume1', volumeInfo: { title: 'Google volume' } }] }) } }
  const { view } = await page('/discover?provider=open-library&q=modern', DiscoverView, {})
  assert.match(view.text(), /awaiting operational and policy checks/)
  assert.equal(view.get('#open-library-query').attributes('disabled'), '')
  assert.equal(calls.length, 0)
  await view.get('#book-provider').setValue('google-books')
  await flushPromises()
  assert.equal(calls.length, 1)
  assert.ok(calls[0].startsWith('https://www.googleapis.com/'))
  assert.match(view.text(), /Google volume/)
  assert.equal(view.get('.google-attribution img').attributes('alt'), 'Powered by Google')
  assert.equal(view.get('.book-provider-link').attributes('href'), 'https://books.google.com/books?id=volume1')
  assert.equal(view.find('#book-search-sort').exists(), false)
  await view.get('#book-provider').setValue('open-library')
  await flushPromises()
  assert.equal(calls.length, 1)
  assert.equal(view.find('.google-attribution').exists(), false)
})

test('Work and edition dates/identities remain separate; selection has no Library action or write', async () => {
  const calls = []
  globalThis.fetch = async (path, options) => { calls.push([path, options]); return ok(response()) }
  const { view, router } = await page()
  assert.match(view.text(), /First publication \(Work\): 2024/)
  assert.match(view.text(), /Edition publication: 2025-03/)
  assert.match(view.text(), /Author information unavailable/)
  assert.match(view.text(), /ISBN: Unavailable/)
  assert.match(view.text(), /No cover available/)
  assert.match(view.text(), /not a complete edition catalogue/)
  const choose = view.findAll('button').find(button => button.text() === 'Use this edition for preview')
  await choose.trigger('click')
  assert.match(view.get('article [role="status"]').text(), /OL1W \/ OL2M/)
  assert.equal(view.find('.library-add-button').exists(), false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].method, 'GET')
  await view.get('#open-library-language').setValue('tr')
  await flushPromises()
  assert.equal(router.currentRoute.value.query.lang, 'tr')
  assert.equal(view.find('article [role="status"]').exists(), false)
  assert.equal(new URL(calls.at(-1)[0], 'http://localhost').searchParams.get('language'), 'tr')
  await view.get('#open-library-mode').setValue('strict')
  await flushPromises()
  assert.equal(router.currentRoute.value.query.mode, 'strict')
  await view.get('#open-library-field').setValue('isbn')
  await flushPromises()
  assert.match(view.get('[role="alert"]').text(), /valid ISBN/)
})

test('an enabled Open Library view never dispatches Google or Library reads; switching rejects its late result', async () => {
  const calls = []
  let finish
  globalThis.fetch = path => {
    calls.push(path)
    if (path.startsWith('/api/v1/pilot/open-library/')) return new Promise(resolve => { finish = resolve })
    if (path.startsWith('https://www.googleapis.com/')) return Promise.resolve({ ok: true, json: async () => ({ totalItems: 0 }) })
    throw new Error(`Unexpected request: ${path}`)
  }
  currentUser.value = { id: '1', email: 'fixture@example.test' }
  const enabledComponent = { ...OpenLibraryDiscover, props: { enabled: { type: Boolean, default: true } } }
  const { view, router } = await page('/discover?provider=open-library&q=modern&lang=nl&mode=strict', DiscoverView, {}, { OpenLibraryDiscover: enabledComponent })
  assert.equal(calls.length, 1)
  assert.ok(calls[0].startsWith('/api/v1/pilot/open-library/search?'))
  currentUser.value = null
  await view.get('#book-provider').setValue('google-books')
  await flushPromises()
  assert.equal(calls.length, 2)
  assert.ok(calls[1].startsWith('https://www.googleapis.com/'))
  finish(ok(response()))
  await flushPromises()
  assert.match(view.text(), /No books found/)
  assert.doesNotMatch(view.text(), /A modern book/)
  assert.equal(router.currentRoute.value.query.provider, 'google-books')
  assert.equal(router.currentRoute.value.query.lang, undefined)
})

test('a returned cover keeps Work provenance and a failed image becomes an honest placeholder', async () => {
  const view = mount(WorkCard, { props: { work: { ...work,
    cover: { id: 100, url: 'https://covers.openlibrary.org/b/id/100-M.jpg?default=false' },
    provenance: { cover: { field: 'cover_i', state: 'present' } } } } })
  mounted.push(view)
  assert.match(view.text(), /Work cover; edition cover unavailable/)
  await view.get('img').trigger('error')
  assert.match(view.text(), /No cover available/)
  assert.equal(view.find('img').exists(), false)
})

test('missing edition and conflicting language metadata cannot become a selectable edition', async () => {
  for (const selectedEdition of [null, { ...work.selectedEdition, title: null },
    ...['inconsistent', 'mismatch', 'ambiguous'].map(languageStatus => ({ ...work.selectedEdition, languageStatus }))]) {
    const view = mount(WorkCard, { props: { work: { ...work, selectedEdition } } })
    mounted.push(view)
    const buttons = view.findAll('button')
    assert.ok(!buttons.length || buttons[0].attributes('disabled') !== undefined)
    assert.match(view.text(), /Saving Open Library editions.*not available/)
  }
})

test('loading, empty and omission counts remain distinct; successful empty retry uses cache', async () => {
  let finish
  let calls = 0
  globalThis.fetch = () => { calls++; return new Promise(resolve => { finish = resolve }) }
  const { view } = await page()
  assert.match(view.get('[role="status"]').text(), /Searching Open Library/)
  assert.equal(view.get('button[type="submit"]').attributes('disabled'), '')
  finish(ok(response([], { language: 2 })))
  await flushPromises()
  assert.match(view.text(), /No supported Works found/)
  assert.match(view.text(), /2 language mismatch\/unknown/)
  await view.get('form').trigger('submit')
  await flushPromises()
  assert.equal(calls, 1)
})

test('rate-limited and busy states respect cooldown, with no automatic retry after the deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 })
  for (const [status, code, seconds, text] of [[429, 'rate_limited', 60, /Too many searches/], [503, 'provider_busy', 2, /shared provider budget/], [503, 'provider_unavailable', 60, /temporarily unavailable/]]) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return { ok: false, status, headers: new Headers({ 'Retry-After': String(seconds) }), json: async () => ({ error: { code } }) } }
    const { view, router } = await page()
    assert.match(view.get('[role="alert"]').text(), text)
    assert.equal(view.findAll('button').at(-1).attributes('disabled'), '')
    await view.get('form').trigger('submit')
    await router.push('/discover?provider=open-library&q=other')
    await flushPromises()
    assert.equal(calls, 1)
    t.mock.timers.tick(seconds * 1000 - 1)
    await flushPromises()
    assert.equal(view.findAll('button').at(-1).attributes('disabled'), '')
    assert.equal(calls, 1)
    t.mock.timers.tick(2)
    await flushPromises()
    assert.equal(view.findAll('button').at(-1).attributes('disabled'), undefined)
    assert.equal(calls, 1)
    globalThis.fetch = async () => { calls++; return ok(response()) }
    await view.findAll('button').at(-1).trigger('click')
    await flushPromises()
    assert.equal(calls, 2)
    assert.equal(view.findAll('article').length, 1)
    view.unmount()
    clearOpenLibraryCache()
  }
})

test('late search responses cannot replace a newer language selection or a disposed view', async () => {
  let finish
  const calls = []
  globalThis.fetch = path => {
    calls.push(path)
    if (calls.length === 1) return new Promise(resolve => { finish = resolve })
    return Promise.resolve(ok(response([{ ...work, workTitle: 'Current Turkish result' }])))
  }
  const { view } = await page()
  await view.get('#open-library-language').setValue('tr')
  await flushPromises()
  finish(ok(response([{ ...work, workTitle: 'Stale result' }])))
  await flushPromises()
  assert.match(view.text(), /Current Turkish result/)
  assert.doesNotMatch(view.text(), /Stale result/)
  assert.ok(calls.every(path => path.startsWith('/api/v1/pilot/open-library/search?')))
})
