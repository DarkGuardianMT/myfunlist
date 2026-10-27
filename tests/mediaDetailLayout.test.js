import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { loadVueComponent } from './support/vueComponent.js'
import { identities, mediaDetail, ok } from './support/mediaDetails.js'
import { getBookClassificationLabels } from '../src/utils/bookClassifications.js'

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
const { resetLists } = await import('../src/composables/useLists.js')
const { clearMediaDetailCache } = await import('../src/composables/useMediaDetails.js')
const { getDefaultStatus } = await import('../src/domain/libraryMedia.js')
const { getMediaKey } = await import('../src/domain/mediaIdentity.js')
const Hero = await loadVueComponent(new URL('../src/components/MediaDetailHero.vue', import.meta.url))
const Metadata = await loadVueComponent(new URL('../src/components/MediaDetailMetadata.vue', import.meta.url))
const Detail = await loadVueComponent(new URL('../src/views/MediaDetailView.vue', import.meta.url))
const mounted = []
const originalFetch = globalThis.fetch
const longDescription = ('A complete readable synopsis with multiple paragraphs.\n\n').repeat(60) + '<b>Literal provider text</b>'

function render(component, options) {
  const view = mount(component, { attachTo: document.body, ...options })
  mounted.push(view)
  return view
}
function precedes(first, second) {
  assert.ok(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
}
async function detailPage(type, saved = false) {
  const calls = []
  const source = mediaDetail(type, { description: longDescription })
  const item = { media: source, userMedia: { id: '71', mediaKey: getMediaKey(source),
    status: getDefaultStatus(type), rating: 8.5, addedAt: '2026-01-01T00:00:00Z' } }
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET' })
    if (path.startsWith('/api/v1/media/')) return ok(source)
    if (path === '/api/v1/library') return ok(saved ? [item] : [])
    if (path === '/api/v1/lists') return ok([{ id: '11', title: 'Favorites', itemCount: 0 }])
    if (path === '/api/v1/auth/csrf') return ok({ csrfToken: 'fixture-csrf' })
    if (path === '/api/v1/lists/11/items') return ok({ added: true })
    throw new Error(`Unexpected fixture request: ${path}`)
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: Detail },
    ...['/discover', '/login', '/register', '/lists'].map((path) => ({ path, component: { render: () => null } })),
  ] })
  const identity = identities[type]
  await router.push({ name: 'media-detail', params: identity })
  const view = render({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return { view, calls, source }
}

beforeEach(() => {
  currentUser.value = null
  isAuthLoading.value = false
  resetLibrary()
  resetLists()
  clearMediaDetailCache()
})
afterEach(() => {
  mounted.splice(0).forEach((view) => view.unmount())
  globalThis.fetch = originalFetch
})
after(() => dom.window.close())

test('book identity shows complete authors next to the title while Details retains edition information', () => {
  const authors = Object.freeze(['J.R.R. Tolkien', 'A very long institutional author '.repeat(7)])
  const source = mediaDetail('book', { details: { authors, publisher: 'Example edition', isbn13: '9780306406157' } })
  const hero = render(Hero, { props: { media: source } })
  const authorLine = hero.get('.media-detail-hero__authors')
  assert.equal(authorLine.element.textContent, `By ${authors.join(', ')}`)
  assert.equal(hero.get('h1').element.nextElementSibling, authorLine.element)
  assert.equal(authorLine.find('a, script').exists(), false)
  const details = render(Metadata, { props: { media: source } })
  assert.equal(details.get('[data-field="authors"] dd').element.textContent, authors.join(', '))
  assert.equal(details.get('[data-field="publisher"] dd').text(), 'Example edition')
  assert.equal(details.get('[data-field="isbn13"] dd').text(), '9780306406157')
})

test('missing authors are omitted and book-only author presentation never leaks into other media types', () => {
  for (const authors of [undefined, []]) {
    const view = render(Hero, { props: { media: mediaDetail('book', { details: { ...(authors ? { authors } : {}) } }) } })
    assert.equal(view.find('.media-detail-hero__authors').exists(), false)
    assert.doesNotMatch(view.text(), /Unknown author|By undefined/)
  }
  for (const type of ['movie', 'tv', 'game']) {
    const view = render(Hero, { props: { media: mediaDetail(type, { details: { authors: ['Not a book'] } }) } })
    assert.equal(view.find('.media-detail-hero__authors').exists(), false)
  }
})

test('book classification labels use source terms, deduplicate paths and avoid standalone General', () => {
  const source = Object.freeze([
    'Young Adult Fiction / Fantasy / Epic', 'Young Adult Fiction / Fantasy / General',
    'Young Adult Fiction / fantasy / Wizards & Witches', 'Young Adult Fiction / Classics',
    'History / General', 'Adventure', ' / / ',
  ])
  assert.deepEqual(getBookClassificationLabels(source), ['Fantasy', 'Classics', 'History', 'Adventure'])
  assert.deepEqual(getBookClassificationLabels(), [])
  assert.deepEqual(getBookClassificationLabels(['Fiction / Science Fiction / Space Opera']), ['Science Fiction'])
})

test('book hero bounds classification count while the keyboard-accessible disclosure retains every full source path', async () => {
  const classifications = Object.freeze([
    'Young Adult Fiction / Fantasy / Epic', 'Young Adult Fiction / Fantasy / General',
    'Young Adult Fiction / Classics', 'Young Adult Fiction / Fairy Tales & Folklore / General',
    'Young Adult Fiction / Performing Arts / Film', 'Extremely long classification '.repeat(8),
  ])
  const source = mediaDetail('book', { genres: classifications })
  const hero = render(Hero, { props: { media: source } })
  assert.deepEqual(hero.findAll('[aria-label="Genres"] li').map((li) => li.text()), ['Fantasy', 'Classics', 'Fairy Tales & Folklore'])
  const details = render(Metadata, { props: { media: source } })
  const disclosure = details.get('details')
  const summary = disclosure.get('summary')
  assert.equal(summary.text(), 'Full classifications (6)')
  assert.equal(disclosure.element.open, false)
  summary.element.focus()
  assert.equal(document.activeElement, summary.element)
  await summary.trigger('click')
  await nextTick()
  assert.equal(disclosure.element.open, true)
  assert.deepEqual(disclosure.findAll('li').map((li) => li.element.textContent), [...classifications])
  assert.deepEqual(source.genres, classifications)
})

test('missing book classifications create no empty UI; classifications alone still have a full source disclosure', () => {
  for (const genres of [undefined, []]) {
    const source = mediaDetail('book', { genres, details: {} })
    assert.equal(render(Hero, { props: { media: source } }).find('[aria-label="Genres"]').exists(), false)
    assert.equal(render(Metadata, { props: { media: source } }).find('section').exists(), false)
  }
  const source = mediaDetail('book', { genres: ['History / Europe'], details: {} })
  const details = render(Metadata, { props: { media: source } })
  assert.equal(details.find('dl').exists(), false)
  assert.equal(details.get('details li').text(), 'History / Europe')
})

test('long book labels remain complete in data and non-book genre names retain their original presentation', () => {
  const label = 'A very long classification '.repeat(8)
  const book = render(Hero, { props: { media: mediaDetail('book', { genres: [label] }) } })
  assert.equal(book.get('li').text(), label.trim())
  assert.equal(book.get('li').attributes('title'), label.trim())
  for (const type of ['movie', 'tv', 'game']) {
    const genres = ['Science Fiction', 'Adventure', 'Mystery', 'Drama']
    const view = render(Hero, { props: { media: mediaDetail(type, { genres }) } })
    assert.deepEqual(view.findAll('li').map((li) => li.text()), genres)
    assert.equal(view.find('.media-detail-hero__genres--book').exists(), false)
  }
})

for (const type of Object.keys(identities)) {
  test(`${type} identity and tracking/list actions precede the complete long synopsis`, async () => {
    currentUser.value = { id: 'layout-fixture', email: 'fixture@example.test' }
    const { view, source, calls } = await detailPage(type, true)
    const actions = view.get('.media-detail-hero__actions')
    const synopsis = view.get('.media-detail-hero__synopsis')
    precedes(view.get('h1').element, actions.element)
    precedes(actions.element, synopsis.element)
    assert.equal(synopsis.get('h2').text(), 'Synopsis')
    assert.equal(synopsis.get('p').element.textContent, source.description)
    assert.equal(synopsis.find('b, button').exists(), false)
    assert.equal(actions.get('select[id^="status-"]').element.disabled, false)
    assert.equal(actions.get('select[id^="rating-"]').element.value, '8.5')
    assert.equal(actions.get('.remove-button').attributes('aria-label'), `Remove Fixture ${type} from Library`)
    assert.equal(calls.some(({ path }) => path === '/api/v1/lists'), false)
    const toggle = actions.get('button[aria-controls]')
    assert.equal(toggle.attributes('aria-expanded'), 'false')
    await toggle.trigger('click')
    await flushPromises()
    assert.equal(toggle.attributes('aria-expanded'), 'true')
    const panel = actions.get('#media-list-panel')
    assert.equal(panel.get('label').attributes('for'), panel.get('select').attributes('id'))
    assert.equal(panel.get('button[type="submit"]').element.disabled, true)
    await panel.get('select').setValue('11')
    assert.equal(panel.get('button[type="submit"]').element.disabled, false)
    await panel.get('form').trigger('submit')
    await flushPromises()
    assert.equal(panel.get('[role="status"]').text(), 'Added to Favorites.')
  })
}

test('signed-out Login/Register are separate focusable actions before the synopsis and make no private requests', async () => {
  const { view, calls } = await detailPage('book')
  const auth = view.get('.media-detail-library__auth')
  const links = auth.findAll('a')
  assert.deepEqual(links.map((link) => link.attributes('href')), ['/login', '/register'])
  for (const link of links) {
    link.element.focus()
    assert.equal(document.activeElement, link.element)
    precedes(link.element, view.get('.media-detail-hero__synopsis').element)
  }
  assert.equal(view.find('.media-detail-lists').exists(), false)
  assert.deepEqual(calls.map(({ path }) => path), ['/api/v1/media/book/google-books/Book_9-x'])
})

test('signed-in unsaved media keeps Add to Library available before the synopsis without fetching lists', async () => {
  currentUser.value = { id: 'layout-fixture', email: 'fixture@example.test' }
  const { view, calls } = await detailPage('game')
  const add = view.get('.media-detail-hero__actions .library-add-button')
  assert.equal(add.text(), 'Add to Library')
  assert.equal(add.element.disabled, false)
  precedes(add.element, view.get('.media-detail-hero__synopsis').element)
  assert.equal(view.get('.media-detail-lists').find('button').exists(), false)
  assert.equal(calls.some(({ path }) => path === '/api/v1/lists'), false)
})
