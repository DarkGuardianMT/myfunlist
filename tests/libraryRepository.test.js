import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addItem,
  getLibrary,
  getMediaKey,
  hasItem,
  removeItem,
  updateRating,
  updateStatus,
} from '../src/services/libraryRepository.js'
import { getDefaultStatus, getStatusOptions } from '../src/domain/libraryMedia.js'
import { getVisibleLibraryItems } from '../src/utils/libraryDisplay.js'

const CURRENT_KEY = 'myfunlist_library'
const LEGACY_KEY = 'trackora_library'

function useStorage(entries = [], options = {}) {
  const values = new Map(entries)
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (options.failWrite) throw new Error('Storage is full')
        values.set(key, value)
      },
      removeItem: (key) => values.delete(key),
    },
  }
  return values
}

function storedLibrary(items, version = 2) {
  return JSON.stringify({ version, items })
}

const book = {
  source: 'google-books',
  sourceId: 'book-1',
  mediaType: 'book',
  title: 'Example book',
  authors: ['Example Author'],
  publishedDate: '2020',
  publishedYear: '2020',
  coverImage: null,
  description: null,
}
const movie = {
  source: 'tmdb',
  sourceId: '42',
  mediaType: 'movie',
  title: 'Example movie',
  releaseDate: '2021-02-03',
  releaseYear: '2021',
  posterImage: 'https://example.com/movie.jpg',
}
const tv = {
  source: 'tmdb',
  sourceId: '42',
  mediaType: 'tv',
  title: 'Example show',
  firstAirDate: '2022-03-04',
  firstAirYear: '2022',
  posterImage: 'https://example.com/tv.jpg',
}

function oldBookItem(overrides = {}) {
  return {
    media: { ...book, ...overrides.media },
    userMedia: {
      mediaKey: 'google-books:book-1',
      status: 'reading',
      rating: 7.5,
      addedAt: '2026-01-02T03:04:05.000Z',
      ...overrides.userMedia,
    },
  }
}

test('type-aware identities distinguish books, movies, and TV with overlapping IDs', async () => {
  assert.equal(getMediaKey(book), 'google-books:book:book-1')
  assert.equal(getMediaKey(movie), 'tmdb:movie:42')
  assert.equal(getMediaKey(tv), 'tmdb:tv:42')
  assert.notEqual(getMediaKey(movie), getMediaKey(tv))
  assert.equal(getMediaKey({ ...movie, mediaType: 'game' }), null)
  assert.equal(getMediaKey({ ...movie, sourceId: '' }), null)
})

test('adds and persists all three types, with separate metadata and default user state', async () => {
  const values = useStorage()
  for (const media of [book, movie, tv]) {
    const result = await addItem(media)
    assert.equal(result.added, true)
    assert.equal(result.item.userMedia.status, getDefaultStatus(media.mediaType))
    assert.equal(result.item.userMedia.rating, null)
    assert.ok(result.item.userMedia.addedAt)
    assert.equal('status' in result.item.media, false)
    assert.equal((await addItem(media)).added, false)
    assert.equal(await hasItem(media), true)
  }
  assert.equal(JSON.parse(values.get(CURRENT_KEY)).version, 2)
  assert.deepEqual((await getLibrary()).map((item) => item.media.mediaType), ['book', 'movie', 'tv'])
  assert.equal((await getLibrary())[1].media.releaseYear, '2021')
  assert.equal((await getLibrary())[2].media.firstAirYear, '2022')
})

test('validates type-specific statuses and keeps personal ratings independent', async () => {
  useStorage()
  const validStatuses = {
    book: ['want-to-read', 'reading', 'finished'],
    movie: ['want-to-watch', 'watched'],
    tv: ['want-to-watch', 'watching', 'completed'],
  }
  for (const media of [book, movie, tv]) {
    const key = (await addItem(media)).item.userMedia.mediaKey
    assert.deepEqual(getStatusOptions(media.mediaType).map((option) => option.value), validStatuses[media.mediaType])
    for (const status of validStatuses[media.mediaType]) {
      assert.equal((await updateStatus(key, status)).userMedia.status, status)
    }
    assert.equal((await updateRating(key, 8.5)).userMedia.rating, 8.5)
    assert.equal((await getLibrary()).find((item) => item.userMedia.mediaKey === key).userMedia.status, validStatuses[media.mediaType].at(-1))
    assert.equal((await updateRating(key, null)).userMedia.rating, null)
    await assert.rejects(updateRating(key, 0))
    await assert.rejects(updateRating(key, 10.5))
    await assert.rejects(updateRating(key, 7.25))
    await assert.rejects(updateStatus(key, 'invalid'))
    await assert.rejects(updateStatus(key, media.mediaType === 'book' ? 'watched' : 'reading'))
  }
})

test('removes every type without changing the other items', async () => {
  useStorage()
  const keys = []
  for (const media of [book, movie, tv]) keys.push((await addItem(media)).item.userMedia.mediaKey)
  for (const key of keys) {
    assert.equal(await removeItem(key), true)
    assert.equal(await hasItem(key), false)
  }
  assert.deepEqual(await getLibrary(), [])
  assert.equal(await removeItem(keys[0]), false)
})

test('migrates current version 1 books with identity, status, rating, and timestamp intact', async () => {
  const values = useStorage([[CURRENT_KEY, storedLibrary([oldBookItem(), oldBookItem()], 1)]])
  const [item] = await getLibrary()
  assert.equal(item.userMedia.mediaKey, getMediaKey(book))
  assert.equal(item.userMedia.status, 'reading')
  assert.equal(item.userMedia.rating, 7.5)
  assert.equal(item.userMedia.addedAt, '2026-01-02T03:04:05.000Z')
  assert.equal(JSON.parse(values.get(CURRENT_KEY)).version, 2)
  assert.equal(JSON.parse(values.get(CURRENT_KEY)).items.length, 1)
  assert.equal((await addItem(book)).added, false)
  await updateStatus(item.userMedia.mediaKey, 'finished')
  assert.equal((await getLibrary())[0].userMedia.status, 'finished')
})

test('migrates version 1 books that omitted mediaType', async () => {
  const old = oldBookItem()
  delete old.media.mediaType
  useStorage([[CURRENT_KEY, storedLibrary([old], 1)]])
  assert.equal((await getLibrary())[0].media.mediaType, 'book')
})

test('migrates Trackora data and only removes the legacy key after a successful copy', async () => {
  const values = useStorage([[LEGACY_KEY, storedLibrary([oldBookItem()], 1)]])
  const [item] = await getLibrary()
  assert.equal(item.userMedia.mediaKey, getMediaKey(book))
  assert.equal(item.userMedia.rating, 7.5)
  assert.equal(item.userMedia.addedAt, '2026-01-02T03:04:05.000Z')
  assert.equal(JSON.parse(values.get(CURRENT_KEY)).version, 2)
  assert.equal(values.has(LEGACY_KEY), false)
})

test('keeps legacy data readable if migration cannot be written', async () => {
  const raw = storedLibrary([oldBookItem()], 1)
  const values = useStorage([[LEGACY_KEY, raw]], { failWrite: true })
  assert.equal((await getLibrary())[0].userMedia.status, 'reading')
  assert.equal(values.has(CURRENT_KEY), false)
  assert.equal(values.get(LEGACY_KEY), raw)
  await assert.rejects(addItem(movie))
})

test('keeps version 1 current data readable if migration write fails', async () => {
  const raw = storedLibrary([oldBookItem()], 1)
  const values = useStorage([[CURRENT_KEY, raw]], { failWrite: true })
  assert.equal((await getLibrary())[0].userMedia.mediaKey, getMediaKey(book))
  assert.equal(values.get(CURRENT_KEY), raw)
})

test('uses canonical version 2 data ahead of legacy data', async () => {
  const current = storedLibrary([])
  const legacy = storedLibrary([oldBookItem()], 1)
  const values = useStorage([[CURRENT_KEY, current], [LEGACY_KEY, legacy]])
  assert.deepEqual(await getLibrary(), [])
  assert.equal(values.get(CURRENT_KEY), current)
  assert.equal(values.get(LEGACY_KEY), legacy)
})

test('falls back from malformed current data to valid legacy data', async () => {
  const values = useStorage([[CURRENT_KEY, '{bad json'], [LEGACY_KEY, storedLibrary([oldBookItem()], 1)]])
  assert.equal((await getLibrary())[0].userMedia.rating, 7.5)
  assert.equal(JSON.parse(values.get(CURRENT_KEY)).version, 2)
})

test('ignores malformed storage and safely normalizes invalid persisted user fields', async () => {
  useStorage([[CURRENT_KEY, '{bad json']])
  assert.deepEqual(await getLibrary(), [])
  const invalid = {
    media: movie,
    userMedia: {
      mediaKey: getMediaKey(movie),
      status: 'reading',
      rating: 11,
      addedAt: '2026-01-02T03:04:05.000Z',
    },
  }
  useStorage([[CURRENT_KEY, storedLibrary([invalid])]])
  const [item] = await getLibrary()
  assert.equal(item.userMedia.status, 'want-to-watch')
  assert.equal(item.userMedia.rating, null)
  assert.equal(item.userMedia.addedAt, invalid.userMedia.addedAt)
})

test('rejects invalid media and preserves stored state when a write fails', async () => {
  const values = useStorage()
  await assert.rejects(addItem({ ...book, mediaType: 'game' }))
  assert.equal(values.has(CURRENT_KEY), false)
  useStorage([], { failWrite: true })
  await assert.rejects(addItem(book))
  assert.deepEqual(await getLibrary(), [])
})

test('filters and sorts a mixed Library without mutating its stored order', async () => {
  useStorage()
  const added = []
  for (const media of [book, movie, tv]) added.push((await addItem(media)).item)
  await updateRating(added[0].userMedia.mediaKey, 4)
  await updateRating(added[2].userMedia.mediaKey, 9)
  const items = await getLibrary()
  assert.deepEqual(getVisibleLibraryItems(items, 'movie', 'all', 'recent').map((item) => item.media.mediaType), ['movie'])
  assert.deepEqual(getVisibleLibraryItems(items, 'tv', 'want-to-watch', 'recent').map((item) => item.media.mediaType), ['tv'])
  assert.equal(getVisibleLibraryItems(items, 'all', 'reading', 'recent').length, 3)
  assert.deepEqual(getVisibleLibraryItems(items, 'all', 'all', 'rating-high-low').map((item) => item.media.mediaType), ['tv', 'book', 'movie'])
  assert.deepEqual(getVisibleLibraryItems(items, 'all', 'all', 'rating-low-high').map((item) => item.media.mediaType), ['book', 'tv', 'movie'])
  assert.deepEqual(getVisibleLibraryItems(items, 'all', 'all', 'title').map((item) => item.media.mediaType), ['book', 'movie', 'tv'])
  assert.deepEqual(items.map((item) => item.media.mediaType), ['book', 'movie', 'tv'])
})
