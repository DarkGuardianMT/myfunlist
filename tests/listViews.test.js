import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parse, compileScript } from '@vue/compiler-sfc'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement',
  'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const { mount, flushPromises } = await import('@vue/test-utils')
const { nextTick } = await import('vue')
const { createRouter, createMemoryHistory } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { resetLists } = await import('../src/composables/useLists.js')
const { resetLibrary } = await import('../src/composables/useLibrary.js')
const { clearCsrfToken } = await import('../src/services/apiClient.js')

async function component(path) {
  const url = new URL(path, import.meta.url)
  const { descriptor } = parse(readFileSync(url, 'utf8'))
  let code = compileScript(descriptor, { id: path, inlineTemplate: true }).content
  code = code.replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  code = code.replace(/from ['"]vue-router['"]/g, `from '${import.meta.resolve('vue-router')}'`)
  code = code.replace(/from ['"](\.\.[^'"]+\.js)['"]/g,
    (_, relative) => `from '${new URL(relative, url).href}'`)
  code = code.replace(/^import (\w+) from ['"][^'"]+\.vue['"]$/gm, (_, name) => {
    if (name === 'ListMediaCard') {
      return `const ListMediaCard = { props: ['item', 'busy'], emits: ['remove'],
        setup(props, { emit }) { return () => h('article', { class: 'test-media' }, [
          h('span', props.item.media.title),
          h('button', { disabled: props.busy, onClick: () => emit('remove', props.item) }, 'Remove from list'),
        ]) } }`
    }
    return `const ${name} = { render() { return h('p', '${name}') } }`
  })
  code = `import { h } from '${import.meta.resolve('vue')}'\n${code}`
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default
}

const ListsView = await component('../src/views/ListsView.vue')
const ListDetailView = await component('../src/views/ListDetailView.vue')
const account = { id: '1', email: 'one@example.test' }
const date = '2026-09-29T00:00:00Z'
const list = (id, title, itemCount = 0) => ({ id, title, description: null, itemCount,
  createdAt: date, updatedAt: date })
const item = (id, mediaType) => ({
  media: { source: mediaType === 'book' ? 'google-books' : mediaType === 'game' ? 'rawg' : 'tmdb',
    mediaType, sourceId: id, title: `${mediaType} ${id}` },
  userMedia: { id, mediaKey: `${mediaType}:${id}`, status: 'completed', rating: null, addedAt: date },
  listItem: { addedAt: date },
})
const ok = (data, status = 200) => ({ ok: true, status, json: async () => ({ data }) })
const bad = (fields) => ({ ok: false, status: 422, json: async () => ({
  error: { code: 'validation_error', message: 'Check fields.', fields },
}) })

async function router(path) {
  const instance = createRouter({ history: createMemoryHistory(), routes: [
    ...['/', '/login', '/register', '/discover', '/library', '/profile', '/lists'].map((route) => ({
      path: route, component: { render: () => null },
    })),
    { path: '/lists/:id', component: { render: () => null } },
  ] })
  await instance.push(path)
  await instance.isReady()
  return instance
}

test('Lists overview renders anonymous, loading, empty, create, and validation', async () => {
  currentUser.value = null
  isAuthLoading.value = false
  resetLists()
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected request') }
  const navigation = await router('/lists')
  const view = mount(ListsView, { global: { plugins: [navigation] } })
  try {
    assert.match(view.text(), /Log in or register/)
    assert.equal(calls, 0)

    let finishLoad
    globalThis.fetch = async (path, options) => {
      if (path.endsWith('/csrf')) return ok({ csrfToken: 'csrf' })
      if (path === '/api/v1/lists' && options.method === 'GET') {
        return new Promise((resolve) => { finishLoad = resolve })
      }
      throw new Error(path)
    }
    currentUser.value = { ...account }
    await nextTick()
    await view.get('.list-disclosure summary').trigger('click')
    assert.match(view.text(), /Loading your lists/)
    assert.equal(view.get('button[type="submit"]').attributes('disabled') !== undefined, true)
    finishLoad(ok([]))
    await flushPromises()
    assert.match(view.text(), /You have no Custom Lists yet/)

    globalThis.fetch = async (path, options) => {
      if (path.endsWith('/csrf')) return ok({ csrfToken: 'csrf' })
      if (options.method === 'POST') return bad({ title: 'Title required.' })
      throw new Error(path)
    }
    await view.get('#list-title').setValue('Bad')
    await view.get('form').trigger('submit')
    await flushPromises()
    assert.match(view.get('[role="alert"]').text(), /Title required/)

    globalThis.fetch = async (path, options) => {
      if (path.endsWith('/csrf')) return ok({ csrfToken: 'csrf' })
      if (options.method === 'POST') return ok(list('1', 'Favorites'), 201)
      throw new Error(path)
    }
    await view.get('#list-title').setValue('Favorites')
    await view.get('form').trigger('submit')
    await flushPromises()
    assert.match(view.text(), /Created “Favorites”/)
    assert.match(view.html(), /href="\/lists\/1"/)
  } finally {
    view.unmount()
  }
})

test('Lists views show request errors instead of empty states and allow retry', async () => {
  currentUser.value = { ...account }
  isAuthLoading.value = false
  resetLists()
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({
    error: { code: 'service_unavailable', message: 'Service unavailable.' },
  }) })
  const overview = mount(ListsView, { global: { plugins: [await router('/lists')] } })
  try {
    await flushPromises()
    assert.match(overview.text(), /Your lists could not be loaded/)
    assert.doesNotMatch(overview.text(), /You have no Custom Lists yet/)
    globalThis.fetch = async () => ok([])
    await overview.get('.library-empty button').trigger('click')
    await flushPromises()
    assert.match(overview.text(), /You have no Custom Lists yet/)
  } finally {
    overview.unmount()
  }

  resetLists()
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({
    error: { code: 'service_unavailable', message: 'Service unavailable.' },
  }) })
  const detail = mount(ListDetailView, { global: { plugins: [await router('/lists/1')] } })
  try {
    await flushPromises()
    assert.match(detail.text(), /Service unavailable/)
    assert.doesNotMatch(detail.text(), /This list is empty/)
  } finally {
    detail.unmount()
  }
})

test('Create form ignores a second submit while its request is pending', async () => {
  clearCsrfToken()
  currentUser.value = { ...account }
  isAuthLoading.value = false
  resetLists()
  let finishCreate
  let creates = 0
  globalThis.fetch = async (path, options) => {
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'csrf' })
    if (path === '/api/v1/lists' && options.method === 'GET') return ok([])
    if (path === '/api/v1/lists' && options.method === 'POST') {
      creates++
      return new Promise((resolve) => { finishCreate = resolve })
    }
    throw new Error(path)
  }
  const view = mount(ListsView, { global: { plugins: [await router('/lists')] } })
  try {
    await flushPromises()
    await view.get('.list-disclosure summary').trigger('click')
    await view.get('#list-title').setValue('Favorites')
    await view.get('form').trigger('submit')
    await flushPromises()
    await view.get('form').trigger('submit')
    assert.equal(creates, 1)
    assert.equal(view.get('button[type="submit"]').attributes('disabled') !== undefined, true)
    finishCreate(ok(list('1', 'Favorites'), 201))
    await flushPromises()
    assert.equal(view.get('#list-title').element.value, '')
    assert.match(view.html(), /href="\/lists\/1"/)
  } finally {
    view.unmount()
  }
})

test('List detail renders mixed items, adds from Library, edits, removes, and confirms deletion', async () => {
  clearCsrfToken()
  currentUser.value = { ...account }
  isAuthLoading.value = false
  resetLists()
  resetLibrary()
  let storedList = list('1', 'Favorites', 2)
  let storedItems = [item('1', 'book'), item('2', 'movie')]
  const libraryItems = [item('1', 'book'), item('2', 'movie'), item('3', 'tv'), item('4', 'game')]
  let deleteCalls = 0
  globalThis.fetch = async (path, options) => {
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'csrf' })
    if (path === '/api/v1/library') return ok(libraryItems)
    if (path === '/api/v1/lists/1' && options.method === 'GET') {
      return ok({ list: { ...storedList, itemCount: storedItems.length }, items: storedItems })
    }
    if (path === '/api/v1/lists/1/items' && options.method === 'POST') {
      const id = JSON.parse(options.body).userMediaId
      storedItems = [...storedItems, libraryItems.find((entry) => entry.userMedia.id === id)]
      return ok({ added: true }, 201)
    }
    if (path.startsWith('/api/v1/lists/1/items/') && options.method === 'DELETE') {
      storedItems = storedItems.filter((entry) => entry.userMedia.id !== path.split('/').at(-1))
      return { ok: true, status: 204 }
    }
    if (path === '/api/v1/lists/1' && options.method === 'PATCH') {
      storedList = { ...storedList, ...JSON.parse(options.body) }
      return ok(storedList)
    }
    if (path === '/api/v1/lists/1' && options.method === 'DELETE') {
      deleteCalls++
      return { ok: true, status: 204 }
    }
    throw new Error(path)
  }
  const navigation = await router('/lists/1')
  const view = mount(ListDetailView, { global: { plugins: [navigation] } })
  const originalConfirm = window.confirm
  try {
    await flushPromises()
    assert.match(view.text(), /book 1/)
    await view.get('.list-add-panel summary').trigger('click')
    assert.match(view.text(), /movie 2/)
    assert.doesNotMatch(view.findAll('.test-media').map((card) => card.text()).join(' '), /game 4/)
    const options = view.findAll('#list-library-item option').map((option) => option.text())
    assert.ok(options.some((option) => option.includes('tv 3')))
    assert.ok(!options.some((option) => option.includes('book 1')))

    await view.get('#list-library-filter').setValue('game')
    assert.deepEqual(view.findAll('#list-library-item option').map((option) => option.text()),
      ['Choose an item', 'game 4 (game)'])
    await view.get('#list-library-filter').setValue('missing')
    assert.match(view.text(), /No Library items match this filter/)
    await view.get('#list-library-filter').setValue('')

    await view.get('#list-library-item').setValue('3')
    await view.get('.list-add-form').trigger('submit')
    await flushPromises()
    assert.match(view.text(), /tv 3/)
    assert.match(view.text(), /Added to this list/)
    assert.match(view.text(), /TmdbAttribution/)

    await view.findAll('.test-media button')[0].trigger('click')
    await flushPromises()
    assert.doesNotMatch(view.findAll('.test-media').map((card) => card.text()).join(' '), /book 1/)
    assert.match(view.text(), /It remains in your Library/)
    assert.equal(libraryItems.length, 4)

    await view.findAll('.list-actions button')[0].trigger('click')
    await view.get('#edit-list-title').setValue('Updated favorites')
    await view.get('#edit-list-description').setValue('A description')
    await view.get('.list-form').trigger('submit')
    await flushPromises()
    assert.match(view.get('h1').text(), /Updated favorites/)
    assert.match(view.text(), /List details saved/)

    window.confirm = () => false
    await view.findAll('.list-actions button')[1].trigger('click')
    assert.equal(deleteCalls, 0)
    window.confirm = () => true
    await view.findAll('.list-actions button')[1].trigger('click')
    await flushPromises()
    assert.equal(deleteCalls, 1)
    assert.equal(navigation.currentRoute.value.path, '/lists')
  } finally {
    window.confirm = originalConfirm
    view.unmount()
  }
})
