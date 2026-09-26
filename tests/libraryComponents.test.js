import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createServer } from 'vite'

test('game Library card and discovery controls render with shared components', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: LibraryItemCard } = await server.ssrLoadModule('/src/components/LibraryItemCard.vue')
    const { default: GameCard } = await server.ssrLoadModule('/src/components/GameCard.vue')
    const { default: LibraryAddButton } = await server.ssrLoadModule('/src/components/LibraryAddButton.vue')
    const { default: RawgAttribution } = await server.ssrLoadModule('/src/components/RawgAttribution.vue')
    const { default: DiscoverView } = await server.ssrLoadModule('/src/views/DiscoverView.vue')
    const { default: LibraryView } = await server.ssrLoadModule('/src/views/LibraryView.vue')
    const { default: HomeView } = await server.ssrLoadModule('/src/views/HomeView.vue')
    const { default: ProfileView } = await server.ssrLoadModule('/src/views/ProfileView.vue')
    const { useLibrary } = await server.ssrLoadModule('/src/composables/useLibrary.js')
    const game = {
      source: 'rawg', sourceId: '654', mediaType: 'game', title: 'Stardew Valley',
      releaseYear: '2016', coverImage: null, platforms: ['PC', 'Switch'],
    }
    const item = {
      media: game,
      userMedia: { mediaKey: 'rawg:game:654', status: 'playing', rating: 8, addedAt: '2026-01-01' },
    }
    const libraryHtml = await renderToString(createSSRApp({ render: () => h(LibraryItemCard, { item, busy: false }) }))
    for (const expected of ['Stardew Valley', '2016', 'PC, Switch', 'Play status', 'Want to Play', 'Playing', 'Completed', 'Dropped', '8 / 10', 'Remove from Library']) {
      assert.ok(libraryHtml.includes(expected), `Missing Library content: ${expected}`)
    }

    const discoverCardHtml = await renderToString(createSSRApp({ render: () => h(GameCard, { game }, {
      default: () => h(LibraryAddButton, {
        media: game, isLibraryLoaded: true, isAdded: true, isAdding: false, hasIdentity: true,
      }),
    }) }))
    assert.ok(discoverCardHtml.includes('No artwork'))
    assert.ok(discoverCardHtml.includes('In Library'))

    const addButtonHtml = await renderToString(createSSRApp({ render: () => h(LibraryAddButton, {
      media: game, isLibraryLoaded: true, isAdded: false, isAdding: false, hasIdentity: true,
    }) }))
    assert.ok(addButtonHtml.includes('Add to Library'))

    const missingMetadataHtml = await renderToString(createSSRApp({ render: () => h(GameCard, {
      game: { ...game, releaseYear: null, platforms: [] },
    }) }))
    assert.ok(missingMetadataHtml.includes('Release year unknown'))
    assert.ok(missingMetadataHtml.includes('Platforms unknown'))

    const attributionHtml = await renderToString(createSSRApp(RawgAttribution))
    assert.ok(attributionHtml.includes('href="https://rawg.io/"'))

    const discoverApp = createSSRApp({ render: () => h(DiscoverView) })
    discoverApp.component('RouterLink', { render: () => null })
    const discoverHtml = await renderToString(discoverApp)
    for (const expected of ['Books', 'Movies', 'TV Shows', 'Games']) {
      assert.ok(discoverHtml.includes(expected), `Missing discovery selector: ${expected}`)
    }

    for (const view of [HomeView, ProfileView]) {
      const app = createSSRApp({ render: () => h(view) })
      app.component('RouterLink', { render: () => null })
      assert.ok((await renderToString(app)).length > 0)
    }

    const stored = JSON.stringify({ version: 2, items: [
      {
        media: { source: 'google-books', sourceId: 'b1', mediaType: 'book', title: 'Example Book', authors: ['Author'] },
        userMedia: { mediaKey: 'google-books:book:b1', status: 'reading', rating: null, addedAt: '2026-01-01' },
      },
      {
        media: { source: 'tmdb', sourceId: 'm1', mediaType: 'movie', title: 'Example Movie' },
        userMedia: { mediaKey: 'tmdb:movie:m1', status: 'watched', rating: null, addedAt: '2026-01-01' },
      },
      {
        media: { source: 'tmdb', sourceId: 't1', mediaType: 'tv', title: 'Example Show' },
        userMedia: { mediaKey: 'tmdb:tv:t1', status: 'watching', rating: null, addedAt: '2026-01-01' },
      },
      item,
    ] })
    globalThis.window = { localStorage: { getItem: () => stored } }
    await useLibrary().loadLibrary()
    const libraryApp = createSSRApp({ render: () => h(LibraryView) })
    libraryApp.component('RouterLink', { render: () => null })
    const libraryViewHtml = await renderToString(libraryApp)
    assert.ok(libraryViewHtml.includes('value="game"'))
    for (const title of ['Example Book', 'Example Movie', 'Example Show', 'Stardew Valley']) {
      assert.ok(libraryViewHtml.includes(title), `Missing Library item: ${title}`)
    }
    assert.ok(libraryViewHtml.includes('href="https://rawg.io/"'))
    assert.ok(libraryViewHtml.includes('TMDB API but is not endorsed'))

  } finally {
    delete globalThis.window
    await server.close()
  }
})
