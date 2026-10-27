import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createServer } from 'vite'
import { createMemoryHistory, createRouter } from 'vue-router'

test('Custom List cards reuse Book, Movie, TV, and Game presentation without Library deletion controls', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: ListMediaCard } = await server.ssrLoadModule('/src/components/ListMediaCard.vue')
    const examples = [
      { mediaType: 'book', source: 'google-books', title: 'Example Book', authors: ['Writer'] },
      { mediaType: 'movie', source: 'tmdb', title: 'Example Movie', releaseYear: '2025' },
      { mediaType: 'tv', source: 'tmdb', title: 'Example Show', firstAirYear: '2024' },
      { mediaType: 'game', source: 'rawg', title: 'Example Game', platforms: ['PC'] },
    ]
    for (const media of examples) {
      const item = { media: { sourceId: '1', ...media }, userMedia: {
        id: '1', status: 'completed', rating: 8, addedAt: '2026-09-29T00:00:00Z',
      } }
      const app = createSSRApp({ render: () => h(ListMediaCard, { item, busy: false }) })
      app.use(createRouter({ history: createMemoryHistory(), routes: [
        { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: {} },
      ] }))
      const html = await renderToString(app)
      assert.ok(html.includes(media.title), `${media.mediaType} title missing`)
      assert.ok(html.includes('Remove from list'), `${media.mediaType} list removal missing`)
      assert.ok(!html.includes('Remove from Library'), `${media.mediaType} exposed Library removal`)
      assert.ok(html.includes('8 / 10'), `${media.mediaType} personal rating missing`)
    }
  } finally {
    await server.close()
  }
})
