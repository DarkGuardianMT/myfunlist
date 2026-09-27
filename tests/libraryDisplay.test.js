import test from 'node:test'
import assert from 'node:assert/strict'
import { getVisibleLibraryItems } from '../src/utils/libraryDisplay.js'

const rows = [
  ['book', 'Book', 'reading', null, '2026-01-01T00:00:00Z'],
  ['movie', 'Movie', 'watched', 7.5, '2026-01-04T00:00:00Z'],
  ['tv', 'TV Show', 'watching', 10, '2026-01-03T00:00:00Z'],
  ['game', 'Game', 'playing', 0.5, '2026-01-02T00:00:00Z'],
]
const items = rows.map(([mediaType, title, status, rating, addedAt]) => ({
  media: { mediaType, title }, userMedia: { status, rating, addedAt },
}))
const titles = (filtered) => filtered.map((item) => item.media.title)

test('mixed Library filters and sorts without changing source order', () => {
  assert.deepEqual(titles(getVisibleLibraryItems(items, 'all', 'all', 'recent')),
    ['Movie', 'TV Show', 'Game', 'Book'])
  assert.deepEqual(titles(getVisibleLibraryItems(items, 'all', 'all', 'title')),
    ['Book', 'Game', 'Movie', 'TV Show'])
  assert.deepEqual(titles(getVisibleLibraryItems(items, 'all', 'all', 'rating-high-low')),
    ['TV Show', 'Movie', 'Game', 'Book'])
  assert.deepEqual(titles(getVisibleLibraryItems(items, 'all', 'all', 'rating-low-high')),
    ['Game', 'Movie', 'TV Show', 'Book'])
  for (const type of ['book', 'movie', 'tv', 'game']) {
    assert.equal(getVisibleLibraryItems(items, type, 'all', 'recent')[0].media.mediaType, type)
  }
  assert.deepEqual(titles(getVisibleLibraryItems(items, 'game', 'playing', 'recent')), ['Game'])
  assert.deepEqual(getVisibleLibraryItems(items, 'game', 'completed', 'recent'), [])
  assert.deepEqual(titles(items), ['Book', 'Movie', 'TV Show', 'Game'])
})
