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
const { h } = await import('vue')
const { createRouter, createMemoryHistory } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { clearDiscoverCache } = await import('../src/composables/useDiscoverSearch.js')
const Card = await loadVueComponent(new URL('../src/components/BookCard.vue', import.meta.url))
const AddButton = await loadVueComponent(new URL('../src/components/LibraryAddButton.vue', import.meta.url))
const Discover = await loadVueComponent(new URL('../src/views/DiscoverView.vue', import.meta.url))
const mounted = []
const originalFetch = globalThis.fetch
const author = 'United States. Congress. Senate. Committee on the Judiciary. Subcommittee to Investigate the Administration of the Internal Security Act and Other Internal Security Laws'
const book = Object.freeze({ source: 'google-books', sourceId: 'institutional1', mediaType: 'book',
  title: 'Organized Subversion in the U.S. Armed Forces', authors: Object.freeze([author]), publishedYear: '1976' })

async function render(component = Card, props = { book, compactMetadata: true }, slots = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/discover', component: { render: () => null } },
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: { render: () => null } },
    ...['/library', '/login', '/register'].map((path) => ({ path, component: { render: () => null } })),
  ] })
  await router.push('/discover')
  const view = mount(component, { props, slots, attachTo: document.body, global: { plugins: [router] } })
  mounted.push(view)
  await flushPromises()
  return { view, router }
}

beforeEach(() => {
  currentUser.value = null
  isAuthLoading.value = false
  clearDiscoverCache()
})
afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount())
  globalThis.fetch = originalFetch
})
after(() => dom.window.close())

test('compact book metadata retains complete institutional authors and title through a keyboard-accessible disclosure', async () => {
  const { view, router } = await render()
  assert.equal(view.get('.book-card__author-preview').text(), author)
  assert.equal(view.get('.book-card__title-preview').text(), book.title)
  assert.equal(view.get('details').element.open, false)
  const summary = view.get('summary')
  assert.match(summary.text(), /Full info/)
  summary.element.focus()
  assert.equal(document.activeElement, summary.element)
  await summary.trigger('click')
  assert.equal(view.get('details').element.open, true)
  const full = view.get('[role="region"]')
  assert.match(full.attributes('aria-label'), /Full title and authors/)
  assert.ok(full.element.textContent.includes(author))
  assert.ok(full.element.textContent.includes(book.title))
  full.element.focus()
  assert.equal(document.activeElement, full.element)
  assert.deepEqual(book.authors, [author])
  assert.equal(router.currentRoute.value.path, '/discover')
  await summary.trigger('click')
  assert.equal(view.get('details').element.open, false)
})

test('missing, empty and blank book authors produce a usable fallback without altering input data', async () => {
  for (const authors of [undefined, null, [], ['', '  ']]) {
    const input = Object.freeze({ ...book, authors })
    const { view } = await render(Card, { book: input, compactMetadata: true })
    assert.equal(view.get('.book-card__author-preview').text(), 'Unknown author')
    await view.get('summary').trigger('click')
    assert.match(view.get('.book-card__full-metadata').text(), /Authors: Unknown author/)
    assert.equal(input.authors, authors)
    assert.doesNotMatch(view.text(), /undefined|null/)
    assert.equal(view.get('h3 a').attributes('href'), '/media/book/google-books/institutional1')
  }
})

test('long titles and multiple authors remain literal complete text without changing the title link', async () => {
  const title = 'A long edition title '.repeat(12) + '<script>literal</script>'
  const authors = Object.freeze([author, 'Another author', '<b>Literal author</b>'])
  const { view, router } = await render(Card, { book: { ...book, title, authors }, compactMetadata: true })
  const link = view.get('h3 a')
  assert.equal(link.text(), title)
  link.element.focus()
  assert.equal(document.activeElement, link.element)
  await view.get('summary').trigger('click')
  assert.ok(view.get('.book-card__full-metadata').element.textContent.includes(authors.join(', ')))
  assert.equal(view.find('script, b').exists(), false)
  await link.trigger('click')
  await flushPromises()
  assert.equal(router.currentRoute.value.name, 'media-detail')
  assert.equal(router.currentRoute.value.params.sourceId, book.sourceId)
})

test('metadata expansion leaves Add to Library available and independent of navigation', async () => {
  const added = []
  const { view, router } = await render(Card, { book, compactMetadata: true }, {
    default: () => h(AddButton, { media: book, isLibraryLoaded: true, isAdded: false,
      isAdding: false, hasIdentity: true, onAdd: (item) => added.push(item) }),
  })
  const add = view.get('.library-add-button')
  assert.equal(add.element.disabled, false)
  assert.equal(add.element.closest('a, details'), null)
  await view.get('summary').trigger('click')
  await add.trigger('click')
  assert.equal(added.length, 1)
  assert.equal(added[0], book)
  assert.equal(router.currentRoute.value.path, '/discover')
  assert.equal(view.get('.book-card__actions').element, view.get('article').element.lastElementChild)
  assert.equal(view.find('img').exists(), false)
  assert.match(view.text(), /No cover/)
})

test('the shared book card keeps its existing full metadata presentation unless Discover opts into compact mode', async () => {
  const { view } = await render(Card, { book })
  assert.equal(view.get('.book-card__authors').text(), author)
  assert.equal(view.find('details').exists(), false)
  assert.equal(view.get('article').classes().includes('book-card--compact'), false)
  assert.equal(view.find('.book-card__title-preview').exists(), false)
})

test('Discover enables compact metadata for rendered Hobbit fixture results, including the institutional outlier', async () => {
  const items = Array.from({ length: 8 }, (_, index) => ({ id: `hobbit-${index}`, volumeInfo: {
    title: index === 5 ? book.title : 'The Hobbit', authors: index === 5 ? book.authors : ['J.R.R. Tolkien'],
  } }))
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items }) })
  const { view, router } = await render(Discover, {})
  await view.get('#book-query').setValue('The Hobbit')
  await view.get('form').trigger('submit')
  await flushPromises()
  const cards = view.findAllComponents(Card)
  assert.equal(cards.length, 8)
  assert.ok(cards.every((card) => card.props('compactMetadata') === true))
  const outlier = cards.find((card) => card.props('book').sourceId === 'hobbit-5')
  assert.equal(outlier.get('.book-card__author-preview').text(), author)
  assert.equal(outlier.get('.library-add-button').text(), 'Log in to add')
  await outlier.get('summary').trigger('click')
  assert.ok(outlier.get('.book-card__full-metadata').element.textContent.includes(author))
  assert.equal(router.currentRoute.value.query.q, 'The Hobbit')
})

test('all four keyboard-focusable type selectors expose one active state and restore each cached query', async () => {
  const calls = []
  globalThis.fetch = async (path) => {
    calls.push(path)
    const url = new URL(path, 'http://localhost')
    if (url.hostname === 'www.googleapis.com') return { ok: true, json: async () => ({ items: [{
      id: 'hobbit', volumeInfo: { title: 'The Hobbit', authors: ['J.R.R. Tolkien'] },
    }] }) }
    const type = url.pathname.split('/').at(-1)
    return { ok: true, status: 200, json: async () => ({ data: [{ source: type === 'game' ? 'rawg' : 'tmdb',
      mediaType: type, sourceId: '42', title: url.searchParams.get('q'), platforms: [],
    }] }) }
  }
  const { view, router } = await render(Discover, {})
  const types = ['book', 'movie', 'tv', 'game']
  const queries = ['The Hobbit', 'Dune', 'Severance', 'Portal']
  function assertActive(index) {
    const buttons = view.findAll('.discover-type-switcher__button')
    assert.deepEqual(buttons.map((button) => button.text()), ['Books', 'Movies', 'TV Shows', 'Games'])
    assert.deepEqual(buttons.map((button) => button.attributes('aria-pressed')), types.map((_, i) => String(i === index)))
    buttons[index].element.focus()
    assert.equal(document.activeElement, buttons[index].element)
  }
  for (let index = 0; index < types.length; index++) {
    await view.findAll('.discover-type-switcher__button')[index].trigger('click')
    await flushPromises()
    assertActive(index)
    await view.get(`#${types[index]}-query`).setValue(queries[index])
    await view.get('form').trigger('submit')
    await flushPromises()
  }
  assert.equal(calls.length, 4)
  for (let index = 0; index < types.length; index++) {
    await view.findAll('.discover-type-switcher__button')[index].trigger('click')
    await flushPromises()
    assertActive(index)
    assert.equal(view.get(`#${types[index]}-query`).element.value, queries[index])
    assert.equal(router.currentRoute.value.query.q, queries[index])
    assert.equal(router.currentRoute.value.query.type || 'book', types[index])
    assert.equal(view.get('article h3').text(), queries[index])
  }
  assert.equal(calls.length, 4)
})
