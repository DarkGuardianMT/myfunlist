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
  assert.equal(normalizeGoogleBook({ volumeInfo: {
    imageLinks: { thumbnail: 'javascript:alert(1)' },
  } }).coverImage, null)
  assert.equal(normalizeGoogleBook({ volumeInfo: {
    imageLinks: { thumbnail: 'data:image/svg+xml,<svg />' },
  } }).coverImage, null)
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
      assert.equal(url.searchParams.get('maxResults'), '40')
      assert.equal(url.searchParams.get('orderBy'), 'relevance')
      assert.equal(url.searchParams.get('printType'), 'books')
      assert.equal(url.searchParams.has('langRestrict'), false)
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

test('field operators constrain every word and preserve quoted phrases without nesting operators', async () => {
  for (const [field, query, expected] of [
    ['title', 'Harry Potter', 'intitle:"Harry" intitle:"Potter"'],
    ['author', 'Ursula Le Guin', 'inauthor:"Ursula" inauthor:"Le" inauthor:"Guin"'],
    ['title', '"Harry Potter" magic', 'intitle:"Harry Potter" intitle:"magic"'],
    ['author', '"Le Guin"', 'inauthor:"Le Guin"'],
    ['title', '"unfinished phrase', 'intitle:"unfinished" intitle:"phrase"'],
    ['title', 'inauthor:Tolkien', 'intitle:"inauthor:Tolkien"'],
    ['all', '9780261103344', '9780261103344'],
    ['all', '"The Hobbit"', '"The Hobbit"'],
  ]) {
    await searchBooks(query, { field, fetchImpl: async (request) => {
      assert.equal(new URL(request).searchParams.get('q'), expected)
      return { ok: true, json: async () => ({ totalItems: 0 }) }
    } })
  }
  assert.deepEqual(await searchBooks('""', { field: 'title', fetchImpl: () => assert.fail('empty expression') }), [])
})

test('language and ordering are real provider constraints; only title-intent best matches are reranked', async () => {
  const items = [{ id: 'other', volumeInfo: { title: 'Other book' } },
    { id: 'equivalent', volumeInfo: { title: 'The Hobbit' } },
    { id: 'exact', volumeInfo: { title: 'Hobbit' } }]
  for (const language of ['any', 'en', 'nl', 'tr']) {
    for (const sort of ['relevance', 'newest']) {
      for (const field of ['all', 'title', 'author']) {
        let calls = 0
        const results = await searchBooks('Hobbit', { language, sort, field, fetchImpl: async (request) => {
          calls++
          const params = new URL(request).searchParams
          assert.equal(params.get('langRestrict'), language === 'any' ? null : language)
          assert.equal(params.get('orderBy'), sort)
          assert.equal(params.get('maxResults'), '40')
          assert.equal(params.get('printType'), 'books')
          return { ok: true, json: async () => ({ items }) }
        } })
        assert.equal(calls, 1)
        assert.deepEqual(results.map((book) => book.sourceId),
          sort === 'relevance' && field !== 'author' ? ['exact', 'equivalent', 'other'] : ['other', 'equivalent', 'exact'])
      }
    }
  }
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
