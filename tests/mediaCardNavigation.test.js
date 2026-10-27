import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { identities, ok } from './support/mediaDetails.js'
import { getMediaDetailRoute, getMediaDetailPath } from '../src/domain/mediaIdentity.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { mount, flushPromises } = await import('@vue/test-utils')
const { createRouter, createMemoryHistory, RouterLink } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { resetLibrary } = await import('../src/composables/useLibrary.js')
const { clearCsrfToken } = await import('../src/services/apiClient.js')

const compiled = new Map()
async function componentModule(url) {
  if (compiled.has(url.href)) return compiled.get(url.href)
  const { descriptor } = parse(readFileSync(url, 'utf8'))
  let code = descriptor.script || descriptor.scriptSetup
    ? compileScript(descriptor, { id: url.pathname, inlineTemplate: true }).content
    : compileTemplate({ source: descriptor.template.content, filename: url.pathname, id: url.pathname }).code
      .replace('export function render', 'function render') + '\nexport default { render }'
  code = code.replace(/from ['"](vue|vue-router)['"]/g, (_, name) => `from '${import.meta.resolve(name)}'`)
  code = code.replace(/from ['"](\.[^'"]+\.js)['"]/g, (_, relative) => `from '${new URL(relative, url).href}'`)
  code = code.replace(/import (\w+) from ['"][^'"]+\.svg['"]/g, (_, name) => `const ${name} = '/fixture-logo.svg'`)
  for (const match of [...code.matchAll(/import (\w+) from ['"](\.[^'"]+\.vue)['"]/g)]) {
    code = code.replace(match[0], `import ${match[1]} from '${await componentModule(new URL(match[2], url))}'`)
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  compiled.set(url.href, result)
  return result
}
async function loadComponent(name) {
  return (await import(await componentModule(new URL(`../src/${name}.vue`, import.meta.url)))).default
}
const DiscoverView = await loadComponent('views/DiscoverView')
const LibraryItemCard = await loadComponent('components/LibraryItemCard')
const ListMediaCard = await loadComponent('components/ListMediaCard')
const cards = {
  book: [await loadComponent('components/BookCard'), 'book'],
  movie: [await loadComponent('components/MovieCard'), 'movie'],
  tv: [await loadComponent('components/TvCard'), 'show'],
  game: [await loadComponent('components/GameCard'), 'game'],
}
const mounted = []
const originalFetch = globalThis.fetch
const artwork = 'https://example.test/cover.jpg'
function media(type, overrides = {}) {
  return { ...identities[type], title: `Fixture ${type}`, coverImage: artwork, posterImage: artwork,
    authors: ['Author'], platforms: ['PC'], publishedYear: '2020', releaseYear: '2020',
    firstAirYear: '2020', description: 'Search summary', ...overrides }
}
function libraryItem(type, overrides = {}) {
  return { media: media(type, overrides), userMedia: {
    id: '7', mediaKey: `${identities[type].source}:${type}:${identities[type].sourceId}`,
    status: { book: 'reading', movie: 'watched', tv: 'watching', game: 'playing' }[type],
    rating: 8, addedAt: '2026-01-01T00:00:00Z',
  } }
}
async function render(component, props = {}, path = '/discover') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    ...['/discover', '/library', '/lists/1', '/login', '/register'].map((path) => ({ path, component: {} })),
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: {} },
  ] })
  await router.push(path)
  const view = mount(component, { props, attachTo: document.body, global: { plugins: [router] } })
  mounted.push(view)
  await flushPromises()
  return { view, router }
}
function assertLinks(view, item) {
  const card = view.get('article')
  const links = card.findAll('a')
  assert.equal(links.length, 2)
  const expected = `/media/${item.mediaType}/${item.source}/${item.sourceId}`
  assert.equal(getMediaDetailPath(item), expected)
  for (const link of links) {
    assert.equal(link.attributes('href'), expected)
    assert.equal(link.element.tagName, 'A')
    assert.equal(link.element.tabIndex, 0)
    assert.equal(link.attributes('role'), undefined)
    link.element.focus()
    assert.equal(document.activeElement, link.element)
    assert.equal(link.find('button, select').exists(), false)
  }
  assert.equal(card.get('h3 a').text(), item.title)
  assert.equal(links[0].attributes('aria-label'), `View details for ${item.title}`)
  assert.equal(links[0].find('img').exists(), true)
  for (const link of card.findAllComponents(RouterLink)) {
    assert.deepEqual(link.props('to'), getMediaDetailRoute(item))
  }
  return links
}
afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount())
  currentUser.value = null
  isAuthLoading.value = false
  resetLibrary()
  clearCsrfToken()
  globalThis.fetch = originalFetch
})
after(() => dom.window.close())

for (const [index, type] of ['book', 'movie', 'tv', 'game'].entries()) {
  test(`${type} Discover artwork/title link to canonical details while Add to Library stays independent`, async () => {
    currentUser.value = { id: '1', email: 'fixture@example.test' }
    isAuthLoading.value = false
    const item = libraryItem(type)
    const calls = []
    globalThis.fetch = async (path, options = {}) => {
      calls.push({ path, options })
      if (path === '/api/v1/auth/csrf') return ok({ csrfToken: 'fixture-csrf' })
      if (path === '/api/v1/library') return options.method === 'POST' ? ok({ added: true, item }) : ok([])
      if (path.startsWith(`/api/v1/discover/${type}?`)) return ok([item.media])
      if (path.startsWith('https://www.googleapis.com/books/v1/volumes?')) {
        return { ok: true, json: async () => ({ items: [{ id: item.media.sourceId, volumeInfo: {
          title: item.media.title, authors: item.media.authors, publishedDate: '2020', imageLinks: { thumbnail: artwork },
        } }] }) }
      }
      throw new Error('Unexpected test request')
    }
    const { view, router } = await render(DiscoverView)
    await view.findAll('.discover-type-switcher__button')[index].trigger('click')
    await view.get(`#${type}-query`).setValue('Fixture')
    await view.get('form').trigger('submit')
    await flushPromises()
    const links = assertLinks(view, item.media)
    await view.get('.library-add-button').trigger('click')
    await flushPromises()
    assert.equal(router.currentRoute.value.path, '/discover')
    assert.equal(view.get('.library-add-button').text(), 'In Library')
    const added = calls.filter(({ path, options }) => path === '/api/v1/library' && options.method === 'POST')
    assert.equal(added.length, 1)
    assert.deepEqual(JSON.parse(added[0].options.body), { media: identities[type] })
    assert.ok(calls.every(({ path }) => !path.startsWith('/api/v1/media/')))
    await links[1].trigger('click')
    await flushPromises()
    assert.equal(router.currentRoute.value.path, getMediaDetailPath(item.media))
  })
}

test('anonymous Discover keeps login/register prompts separate from detail navigation', async () => {
  isAuthLoading.value = false
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [{
    id: identities.book.sourceId, volumeInfo: { title: 'Anonymous book' },
  }] }) })
  const { view, router } = await render(DiscoverView)
  await view.get('#book-query').setValue('Fixture')
  await view.get('form').trigger('submit')
  await flushPromises()
  await view.get('.library-add-button').trigger('click')
  assert.equal(router.currentRoute.value.path, '/discover')
  assert.match(view.get('[role="alert"]').text(), /Log in or register/)
  assert.deepEqual(view.findAll('.library-feedback a').map((link) => link.attributes('href')), ['/login', '/register'])
  assert.equal(view.get('article h3 a').attributes('href'), getMediaDetailPath(identities.book))
})

test('Library artwork/title links coexist with status, rating, remove, and busy controls for every media type', async () => {
  for (const type of Object.keys(identities)) {
    const item = libraryItem(type)
    const { view, router } = await render(LibraryItemCard, { item, busy: false }, '/library')
    const links = assertLinks(view, item.media)
    const controls = view.findAll('select')
    const status = { book: 'finished', movie: 'want-to-watch', tv: 'completed', game: 'completed' }[type]
    await controls[0].setValue(status)
    await controls[1].setValue('7.5')
    await view.get('button').trigger('click')
    assert.deepEqual(view.emitted('status-change')[0][0], item)
    assert.equal(view.emitted('status-change')[0][1].target.value, status)
    assert.deepEqual(view.emitted('rating-change')[0][0], item)
    assert.equal(view.emitted('rating-change')[0][1].target.value, '7.5')
    assert.deepEqual(view.emitted('remove'), [[item]])
    assert.equal(router.currentRoute.value.path, '/library')
    assert.ok([...view.element.querySelectorAll('select, button')].every((control) => !control.closest('a')))
    await view.setProps({ busy: true })
    for (const control of view.findAll('select, button')) assert.equal(control.element.disabled, true)
    await links[0].trigger('click')
    await flushPromises()
    assert.equal(router.currentRoute.value.path, getMediaDetailPath(item.media))
    router.back()
    await flushPromises()
    assert.equal(router.currentRoute.value.path, '/library')
  }
})

test('Custom List artwork/title links leave removal independent and preserve personal information', async () => {
  for (const type of Object.keys(identities)) {
    const item = libraryItem(type)
    const { view, router } = await render(ListMediaCard, { item, busy: false }, '/lists/1')
    const links = assertLinks(view, item.media)
    assert.match(view.text(), /8 \/ 10/)
    assert.match(view.text(), /Library status:/)
    await view.get('button').trigger('click')
    assert.deepEqual(view.emitted('remove'), [[item]])
    assert.equal(router.currentRoute.value.path, '/lists/1')
    assert.equal(view.get('button').element.closest('a'), null)
    await view.setProps({ busy: true })
    assert.equal(view.get('button').element.disabled, true)
    await links[1].trigger('click')
    await flushPromises()
    assert.equal(router.currentRoute.value.path, getMediaDetailPath(item.media))
  }
})

test('missing and failed artwork retain fallbacks with only a working title link in all card contexts', async () => {
  for (const [type, [card, prop]] of Object.entries(cards)) {
    const item = libraryItem(type, { coverImage: null, posterImage: null })
    for (const [component, props] of [[card, { [prop]: item.media }],
      [LibraryItemCard, { item, busy: false }], [ListMediaCard, { item, busy: false }]]) {
      const { view } = await render(component, props)
      assert.equal(view.findAll('article a').length, 1)
      assert.equal(view.get('h3 a').attributes('href'), getMediaDetailPath(item.media))
      assert.match(view.text(), /No cover|No poster|No artwork/)
      assert.equal(view.find('img').exists(), false)
    }
    const { view } = await render(card, { [prop]: media(type) })
    await view.get('img').trigger('error')
    assert.equal(view.findAll('a').length, 1)
    assert.equal(view.get('h3 a').attributes('href'), getMediaDetailPath(item.media))
    assert.match(view.text(), /No cover|No poster|No artwork/)
    await view.setProps({ [prop]: media(type, { coverImage: `${artwork}?new`, posterImage: `${artwork}?new` }) })
    assert.equal(view.findAll('a').length, 2)
  }
})

test('movie and TV with the same provider ID remain distinct, and modified clicks keep browser behavior', async () => {
  const movie = await render(cards.movie[0], { movie: media('movie') })
  const tv = await render(cards.tv[0], { show: media('tv') })
  assert.notEqual(movie.view.get('h3 a').attributes('href'), tv.view.get('h3 a').attributes('href'))
  for (const link of movie.view.findAll('a')) {
    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    let preventedByRouter
    link.element.addEventListener('click', (event) => {
      preventedByRouter = event.defaultPrevented
      // JSDOM kan geen nieuw tabblad openen; controleer eerst dat RouterLink dit toestaat.
      event.preventDefault()
    }, { once: true })
    link.element.dispatchEvent(event)
    assert.equal(preventedByRouter, false)
  }
  await flushPromises()
  assert.equal(movie.router.currentRoute.value.path, '/discover')
})

test('invalid identities retain card presentation and actions without creating broken detail links', async () => {
  for (const [type, [card, prop]] of Object.entries(cards)) {
    const { view } = await render(card, { [prop]: media(type, { source: 'untrusted-provider' }) })
    assert.equal(view.findAll('a').length, 0)
    assert.equal(view.get('h3').text(), `Fixture ${type}`)
    assert.equal(view.find('img').exists(), true)
  }
})
