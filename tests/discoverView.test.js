import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parse, compileScript } from '@vue/compiler-sfc'

test('Discover keeps search, switching, loading, stale-result, and error behavior', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement',
    'SVGElement', 'Element', 'Node', 'Event']) {
    globalThis[name] = name === 'window' ? dom.window : dom.window[name]
  }
  const { mount, flushPromises } = await import('@vue/test-utils')
  const { createRouter, createMemoryHistory } = await import('vue-router')
  let view

  try {
    const componentUrl = new URL('../src/views/DiscoverView.vue', import.meta.url)
    const { descriptor } = parse(readFileSync(componentUrl, 'utf8'))
    let code = compileScript(descriptor, { id: 'discover-test', inlineTemplate: true }).content
    code = code.replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
    code = code.replace(/import (\w+) from ['"]\.\.\/components\/[^'"]+\.vue['"]/g,
      "const $1 = { props: ['book', 'movie', 'show', 'game'], render() { return this.book?.title || this.movie?.title || this.show?.title || this.game?.title || null } }")
    code = code.replace(/from ['"](\.\.\/(?:composables|services)\/[^'"]+\.js)['"]/g,
      (_match, path) => `from '${new URL(path, componentUrl).href}'`)
    const { default: DiscoverView } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    const state = await import('../src/composables/authState.js')
    state.currentUser.value = null
    state.isAuthLoading.value = false

    const calls = []
    let resolveMovie
    globalThis.fetch = (path) => {
      calls.push(path)
      if (path.startsWith('https://www.googleapis.com/books/')) {
        return Promise.resolve({ ok: true, json: async () => ({ items: [{
          id: 'book-1', volumeInfo: { title: 'The Hobbit' },
        }] }) })
      }
      if (path.startsWith('/api/v1/discover/movie?')) {
        return new Promise((resolve) => { resolveMovie = resolve })
      }
      if (path.startsWith('/api/v1/discover/tv?')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
      }
      if (path.includes('/api/v1/discover/game?q=fail')) {
        return Promise.resolve({ ok: false, status: 503,
          json: async () => ({ error: { code: 'provider_unavailable', message: 'Media provider is unavailable.' } }) })
      }
      if (path.startsWith('/api/v1/discover/game?')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [{
          source: 'rawg', sourceId: '62', mediaType: 'game', title: 'Portal',
          coverImage: null, releaseYear: '2007', platforms: [],
        }] }) })
      }
      throw new Error(`Unexpected request: ${path}`)
    }

    const router = createRouter({ history: createMemoryHistory(), routes:
      ['/', '/discover', '/library', '/login', '/register'].map((path) => ({
        path, component: { render: () => null },
      })),
    })
    view = mount(DiscoverView, { global: { plugins: [router] } })

    await view.get('#book-query').setValue('The Hobbit')
    await view.get('form').trigger('submit')
    await flushPromises()
    assert.match(view.text(), /The Hobbit/)
    assert.ok(calls.some((path) => path.startsWith('https://www.googleapis.com/books/')))

    await view.findAll('.discover-type-switcher__button')[1].trigger('click')
    await view.get('#movie-query').setValue('The Matrix')
    await view.get('form').trigger('submit')
    assert.match(view.text(), /Searching TMDB/)
    assert.notEqual(view.get('button[type="submit"]').attributes('disabled'), undefined)
    await view.get('form').trigger('submit')
    assert.equal(calls.filter((path) => path.startsWith('/api/v1/discover/movie?')).length, 1)

    await view.findAll('.discover-type-switcher__button')[3].trigger('click')
    await view.get('#game-query').setValue('Portal')
    await view.get('form').trigger('submit')
    await flushPromises()
    assert.match(view.text(), /Portal/)

    resolveMovie({ ok: true, status: 200, json: async () => ({ data: [{
      source: 'tmdb', sourceId: '42', mediaType: 'movie', title: 'The Matrix',
      posterImage: null, releaseYear: '1999', description: null,
    }] }) })
    await flushPromises()
    assert.match(view.text(), /Portal/)
    assert.doesNotMatch(view.text(), /The Matrix/)
    await view.findAll('.discover-type-switcher__button')[1].trigger('click')
    assert.match(view.text(), /The Matrix/)

    await view.findAll('.discover-type-switcher__button')[2].trigger('click')
    await view.get('#tv-query').setValue('unknown')
    await view.get('form').trigger('submit')
    await flushPromises()
    assert.match(view.text(), /No TV shows found/)

    await view.findAll('.discover-type-switcher__button')[3].trigger('click')
    await view.get('#game-query').setValue('fail')
    await view.get('form').trigger('submit')
    await flushPromises()
    assert.match(view.get('[role="alert"]').text(), /temporarily unavailable/)
    assert.ok(calls.filter((path) => path.startsWith('/api/v1/discover/'))
      .every((path) => !path.includes('rawg.io') && !path.includes('themoviedb.org')))
  } finally {
    view?.unmount()
    delete globalThis.fetch
    dom.window.close()
    for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement',
      'SVGElement', 'Element', 'Node', 'Event']) delete globalThis[name]
  }
})
