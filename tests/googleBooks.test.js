import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getGoogleBooksErrorMessage,
  normalizeGoogleBook,
  searchBooks,
} from '../src/services/googleBooks.js'

test('normalizes Google Books metadata without user state', () => {
  assert.deepEqual(normalizeGoogleBook({
    id: 'volume-1',
    volumeInfo: {
      title: '  Example Book  ',
      authors: [' Author ', null],
      publishedDate: '2020-04-01',
      imageLinks: { thumbnail: 'http://example.com/cover.jpg' },
      description: 'Description',
    },
  }), {
    source: 'google-books',
    sourceId: 'volume-1',
    title: 'Example Book',
    authors: ['Author'],
    publishedDate: '2020-04-01',
    publishedYear: '2020',
    coverImage: 'https://example.com/cover.jpg',
    description: 'Description',
    mediaType: 'book',
  })
  assert.equal(normalizeGoogleBook(null).title, 'Untitled book')
})

test('book search suppresses empty queries and supports an optional API key', async () => {
  let calls = 0
  assert.deepEqual(await searchBooks('  ', { fetchImpl: () => { calls += 1 } }), [])
  assert.equal(calls, 0)

  const results = await searchBooks('  The Hobbit  ', {
    apiKey: '  example-key  ',
    fetchImpl: async (request) => {
      const url = new URL(request)
      assert.equal(url.searchParams.get('q'), 'The Hobbit')
      assert.equal(url.searchParams.get('key'), 'example-key')
      assert.equal(url.searchParams.get('maxResults'), '24')
      return { ok: true, json: async () => ({ items: [{ id: 'book-1' }] }) }
    },
  })
  assert.equal(results[0].sourceId, 'book-1')

  assert.deepEqual(await searchBooks('missing book', {
    apiKey: '',
    fetchImpl: async (request) => {
      assert.equal(new URL(request).searchParams.has('key'), false)
      return { ok: true, json: async () => ({ totalItems: 0 }) }
    },
  }), [])
})

test('book search maps failed requests and malformed responses to friendly errors', async () => {
  for (const [status, message] of [
    [403, 'authorize'],
    [429, 'too many requests'],
    [503, 'temporarily unavailable'],
    [400, 'could not load'],
  ]) {
    await assert.rejects(
      searchBooks('book', { fetchImpl: async () => ({ ok: false, status }) }),
      (error) => getGoogleBooksErrorMessage(error).includes(message),
    )
  }

  await assert.rejects(
    searchBooks('book', { fetchImpl: async () => { throw new Error('offline') } }),
    (error) => getGoogleBooksErrorMessage(error).includes('Check your connection'),
  )

  for (const data of [{}, { items: null }, { items: 'bad', totalItems: 0 }]) {
    await assert.rejects(
      searchBooks('book', { fetchImpl: async () => ({ ok: true, json: async () => data }) }),
      (error) => getGoogleBooksErrorMessage(error).includes('unexpected response'),
    )
  }
})
