import test from 'node:test'
import assert from 'node:assert/strict'
import { useLibrary } from '../src/composables/useLibrary.js'

const game = {
  source: 'rawg',
  sourceId: '654',
  mediaType: 'game',
  title: 'Stardew Valley',
  releaseDate: '2016-02-26',
  releaseYear: '2016',
  coverImage: null,
  platforms: ['PC'],
}

test('shared Library state reacts to adding, updating, and removing a game', async () => {
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  }

  const discoverLibrary = useLibrary()
  const libraryPage = useLibrary()
  await discoverLibrary.loadLibrary()

  assert.equal(discoverLibrary.hasLibraryItem(game), false)
  assert.equal((await discoverLibrary.addLibraryItem(game)).added, true)
  assert.equal(discoverLibrary.hasLibraryItem(game), true)
  assert.equal(libraryPage.libraryItems.value.length, 1)
  assert.equal((await libraryPage.addLibraryItem(game)).added, false)
  assert.equal(libraryPage.libraryItems.value.length, 1)

  const key = discoverLibrary.getMediaKey(game)
  await libraryPage.updateLibraryRating(key, 8)
  await libraryPage.updateLibraryStatus(key, 'completed')
  assert.equal(discoverLibrary.libraryItems.value[0].userMedia.rating, 8)
  assert.equal(discoverLibrary.libraryItems.value[0].userMedia.status, 'completed')

  assert.equal(await libraryPage.removeLibraryItem(key), true)
  assert.equal(discoverLibrary.hasLibraryItem(game), false)
  assert.equal(libraryPage.libraryItems.value.length, 0)
  assert.equal(JSON.parse(values.get('myfunlist_library')).items.length, 0)
})
