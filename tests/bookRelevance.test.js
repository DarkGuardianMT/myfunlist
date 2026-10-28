import test from 'node:test'
import assert from 'node:assert/strict'
import { rankBooksByTitle } from '../src/domain/bookRelevance.js'

const titles = (values) => values.map((title, index) => ({ title, sourceId: String(index) }))
const ranked = (values, query) => rankBooksByTitle(titles(values), query).map((book) => book.title)

test('exact, article-equivalent, prefix, phrase, token and other tiers are ordered stably', () => {
  assert.deepEqual(ranked(['Hobbiton', 'About the Hobbit today', 'Hobbit tales', 'The Hobbit', 'Hobbit'], 'Hobbit'),
    ['Hobbit', 'The Hobbit', 'Hobbit tales', 'About the Hobbit today', 'Hobbiton'])
  assert.deepEqual(ranked(['Hobbit', 'The Hobbit'], 'The Hobbit'), ['The Hobbit', 'Hobbit'])
  assert.deepEqual(ranked(['A journey', 'An unexpected journey', 'Journey'], 'Journey'), ['Journey', 'A journey', 'An unexpected journey'])
  assert.deepEqual(ranked(['Other', 'A blue and distant moon', 'Blue moon: a very long subtitle '.repeat(15),
    'Notes on blue moon', 'Blue moon'], 'blue moon'),
  ['Blue moon', 'Blue moon: a very long subtitle '.repeat(15), 'Notes on blue moon', 'A blue and distant moon', 'Other'])
})

test('normalization handles case, accents, decomposed Unicode, punctuation and word boundaries', () => {
  assert.deepEqual(ranked(['Other', 'Cafe\u0301—ÉTOILE!', 'Café étoile: notes'], '  CAFÉ   étoile '),
    ['Cafe\u0301—ÉTOILE!', 'Café étoile: notes', 'Other'])
  assert.deepEqual(ranked(['Dunescape', 'A Dune companion', 'Dune'], 'dune'), ['Dune', 'A Dune companion', 'Dunescape'])
  assert.deepEqual(ranked(['Other', 'İSTANBUL: Şehir', 'İstanbul şehir'], 'istanbul şehir'),
    ['İSTANBUL: Şehir', 'İstanbul şehir', 'Other'])
  assert.deepEqual(ranked(['Other', '東京 物語'], '東京 物語'), ['東京 物語', 'Other'])
})

test('ties retain provider order regardless of artwork, author or date; missing metadata is safe', () => {
  const books = [{ sourceId: 'missing' }, { title: 'Other', coverImage: 'cover', publishedYear: '2026' },
    { title: 'The Hobbit', authors: null }, { title: 'The Hobbit' }, { title: null }, null]
  assert.deepEqual(rankBooksByTitle(books, 'Hobbit'), [books[2], books[3], books[0], books[1], books[4], books[5]])
  assert.deepEqual(rankBooksByTitle(books, '!!!'), books)
})

test('ranking copies the array, retains every original object and ID, and never mutates metadata', () => {
  const books = Object.freeze(titles(['Unrelated', 'The Hobbit', 'Hobbit']).map((book) => Object.freeze({
    ...book, authors: Object.freeze(['Author']),
  })))
  const before = JSON.stringify(books)
  const result = rankBooksByTitle(books, 'Hobbit')
  assert.notEqual(result, books)
  assert.deepEqual(result.map((book) => book.sourceId), ['2', '1', '0'])
  assert.equal(result[0], books[2])
  assert.equal(JSON.stringify(books), before)
  assert.deepEqual(rankBooksByTitle(books, ''), books)
})
