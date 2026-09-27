import test from 'node:test'
import assert from 'node:assert/strict'
import { currentUser } from '../src/composables/authState.js'
import { resetLibrary, useLibrary } from '../src/composables/useLibrary.js'

const game = { source: 'rawg', sourceId: '654', mediaType: 'game', title: 'Stardew Valley' }
const makeItem = (title, id) => ({
  media: { ...game, title },
  userMedia: { id, mediaKey: 'rawg:game:654', status: 'want-to-play', rating: null, addedAt: '2026-01-01T00:00:00Z' },
})
const json = (data) => ({ ok: true, status: 200, json: async () => ({ data }) })

test('shared Library state handles mutations and account reset', async () => {
  currentUser.value = { id: 'A', email: 'a@example.com' }
  resetLibrary()
  let saved = []
  globalThis.fetch = async (path, options) => {
    if (path.endsWith('/csrf')) return json({ csrfToken: 'csrf' })
    if (options.method === 'GET') return json(saved)
    if (options.method === 'POST') {
      saved = [makeItem('Stardew Valley', '77')]
      return json({ added: true, item: saved[0] })
    }
    if (options.method === 'PATCH') {
      saved = [{ ...saved[0], userMedia: { ...saved[0].userMedia, ...JSON.parse(options.body) } }]
      return json(saved[0])
    }
    saved = []
    return { ok: true, status: 204 }
  }
  const first = useLibrary()
  const second = useLibrary()
  await first.loadLibrary()
  assert.equal(first.isLibraryLoaded.value, true)
  assert.equal((await first.addLibraryItem(game)).added, true)
  assert.equal(second.libraryItems.value.length, 1)
  await second.updateLibraryRating('rawg:game:654', 8)
  await second.updateLibraryStatus('rawg:game:654', 'playing')
  assert.equal(first.libraryItems.value[0].userMedia.rating, 8)
  assert.equal(first.libraryItems.value[0].userMedia.status, 'playing')
  assert.equal(await second.removeLibraryItem('rawg:game:654'), true)
  assert.equal(first.hasLibraryItem(game), false)
  currentUser.value = null
  resetLibrary()
  assert.deepEqual(first.libraryItems.value, [])
  assert.equal(first.isLibraryLoaded.value, false)
})

test('a late User A response cannot overwrite User B', async () => {
  let finishA
  currentUser.value = { id: 'A' }
  resetLibrary()
  globalThis.fetch = async () => new Promise((resolve) => { finishA = resolve })
  const library = useLibrary()
  const pendingA = library.loadLibrary()
  currentUser.value = null
  resetLibrary()
  currentUser.value = { id: 'B' }
  globalThis.fetch = async () => json([makeItem('User B game', '2')])
  await library.loadLibrary()
  finishA(json([makeItem('User A game', '1')]))
  await pendingA
  assert.equal(library.libraryItems.value[0].media.title, 'User B game')
  currentUser.value = null
  resetLibrary()
})

test('a failed load is not an empty Library and can be retried', async () => {
  currentUser.value = { id: 'failed-load' }
  resetLibrary()
  const library = useLibrary()
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({
    error: { code: 'service_unavailable', message: 'Service unavailable.' },
  }) })
  await assert.rejects(library.loadLibrary())
  assert.equal(library.isLibraryLoaded.value, false)
  assert.equal(library.libraryError.value, 'Service unavailable.')
  globalThis.fetch = async () => json([])
  assert.deepEqual(await library.loadLibrary(), [])
  assert.equal(library.isLibraryLoaded.value, true)
  assert.equal(library.libraryError.value, '')
  currentUser.value = null
  resetLibrary()
})
