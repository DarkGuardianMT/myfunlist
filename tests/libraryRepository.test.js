import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addItem,
  getLibrary,
  removeItem,
  updateRating,
  updateStatus,
} from '../src/services/libraryRepository.js'

const CURRENT_KEY = 'myfunlist_library'
const LEGACY_KEY = 'trackora_library'

function useStorage(entries = [], options = {}) {
  const values = new Map(entries)

  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (options.failWrite) {
          throw new Error('Storage is full')
        }

        values.set(key, value)
      },
      removeItem: (key) => values.delete(key),
    },
  }

  return values
}

function storedLibrary(items) {
  return JSON.stringify({ version: 1, items })
}

function bookItem(title = 'Example book') {
  return {
    media: {
      source: 'google-books',
      sourceId: 'book-1',
      mediaType: 'book',
      title,
      authors: ['Example Author'],
      publishedDate: '2020',
      publishedYear: '2020',
      coverImage: null,
      description: null,
    },
    userMedia: {
      mediaKey: 'google-books:book-1',
      status: 'reading',
      rating: 7.5,
      addedAt: '2026-01-02T03:04:05.000Z',
    },
  }
}

test('migrates legacy books with status and rating, then uses the new key', async () => {
  const raw = storedLibrary([bookItem()])
  const values = useStorage([[LEGACY_KEY, raw]])

  const [item] = await getLibrary()
  assert.equal(item.media.title, 'Example book')
  assert.equal(item.userMedia.status, 'reading')
  assert.equal(item.userMedia.rating, 7.5)
  assert.equal(item.userMedia.addedAt, '2026-01-02T03:04:05.000Z')
  assert.equal(values.get(CURRENT_KEY), raw)
  assert.equal(values.has(LEGACY_KEY), false)

  await updateStatus(item.userMedia.mediaKey, 'finished')
  await updateRating(item.userMedia.mediaKey, 8)
  const [updated] = await getLibrary()
  assert.equal(updated.userMedia.status, 'finished')
  assert.equal(updated.userMedia.rating, 8)
  assert.equal(await removeItem(item.userMedia.mediaKey), true)
  assert.deepEqual(await getLibrary(), [])
})

test('uses valid current data without overwriting it with legacy data', async () => {
  const current = storedLibrary([])
  const legacy = storedLibrary([bookItem()])
  const values = useStorage([[CURRENT_KEY, current], [LEGACY_KEY, legacy]])

  assert.deepEqual(await getLibrary(), [])
  assert.equal(values.get(CURRENT_KEY), current)
  assert.equal(values.get(LEGACY_KEY), legacy)
})

test('replaces malformed current data with valid legacy data', async () => {
  const legacy = storedLibrary([bookItem()])
  const values = useStorage([[CURRENT_KEY, '{bad json'], [LEGACY_KEY, legacy]])

  assert.equal((await getLibrary())[0].userMedia.rating, 7.5)
  assert.equal(values.get(CURRENT_KEY), legacy)
  assert.equal(values.has(LEGACY_KEY), false)
})

test('ignores malformed legacy data without crashing', async () => {
  const values = useStorage([[LEGACY_KEY, '{bad json']])

  assert.deepEqual(await getLibrary(), [])
  assert.equal(values.has(CURRENT_KEY), false)
  assert.equal(values.get(LEGACY_KEY), '{bad json')
})

test('keeps legacy data when storage cannot copy it', async () => {
  const legacy = storedLibrary([bookItem()])
  const values = useStorage([[LEGACY_KEY, legacy]], { failWrite: true })

  assert.equal((await getLibrary())[0].userMedia.status, 'reading')
  assert.equal(values.has(CURRENT_KEY), false)
  assert.equal(values.get(LEGACY_KEY), legacy)
})

test('new items are written only to the current key', async () => {
  const values = useStorage()

  assert.equal((await addItem(bookItem().media)).added, true)
  assert.equal(JSON.parse(values.get(CURRENT_KEY)).items.length, 1)
  assert.equal(values.has(LEGACY_KEY), false)
})
