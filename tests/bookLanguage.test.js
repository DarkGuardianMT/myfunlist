import test from 'node:test'
import assert from 'node:assert/strict'
import { selectBooksByLanguage } from '../src/domain/bookSearch.js'

test('selected languages retain only confirmed matches in the original order, with transparent omission counts', () => {
  const books = Object.freeze([
    { sourceId: 'italian', language: 'it' }, { sourceId: 'english1', language: 'en' },
    { sourceId: 'unknown' }, { sourceId: 'turkish', language: 'tr' },
    { sourceId: 'english2', language: ' EN ' }, { sourceId: 'invalid', language: 'unknown' },
    { sourceId: 'dutch', language: 'nl' },
  ].map(Object.freeze))
  const before = JSON.stringify(books)
  const english = selectBooksByLanguage(books, 'en')
  assert.deepEqual(english.results, [books[1], books[4]])
  assert.equal(english.otherLanguageCount, 3)
  assert.equal(english.unknownLanguageCount, 2)
  assert.equal(english.results[0], books[1])
  assert.deepEqual(selectBooksByLanguage(books, 'tr').results, [books[3]])
  assert.deepEqual(selectBooksByLanguage(books, 'nl').results, [books[6]])
  assert.equal(JSON.stringify(books), before)
})

test('Any language and invalid choices preserve all candidates, including missing or invalid language metadata', () => {
  const books = Object.freeze([{ language: 'it' }, {}, { language: null }, { language: 'en-US' }].map(Object.freeze))
  for (const language of ['any', undefined, 'invalid']) {
    assert.deepEqual(selectBooksByLanguage(books, language), { results: books, otherLanguageCount: 0, unknownLanguageCount: 0 })
  }
  assert.deepEqual(selectBooksByLanguage(books, 'en'), { results: [], otherLanguageCount: 1, unknownLanguageCount: 3 })
})
