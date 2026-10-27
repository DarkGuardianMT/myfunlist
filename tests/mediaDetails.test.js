import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/services/apiClient.js'
import { fetchMediaDetail } from '../src/services/mediaDetails.js'
import { identities, mediaDetail } from './support/mediaDetails.js'

test('detail service requests only same-origin public metadata and validates all four contracts', async () => {
  for (const [type, identity] of Object.entries(identities)) {
    const fixture = mediaDetail(type)
    const result = await fetchMediaDetail(identity, { requestImpl: async (path, options) => {
      assert.equal(path, `/api/v1/media/${type}/${identity.source}/${identity.sourceId}`)
      assert.deepEqual(options, { handleUnauthorized: false, timeoutMs: 11000 })
      return fixture
    } })
    assert.deepEqual(result, fixture)
    assert.notEqual(result.details, fixture.details)
    const sparse = { ...identity, title: 'Sparse', details: {} }
    assert.deepEqual(await fetchMediaDetail(identity, { requestImpl: async () => sparse }), sparse)
  }
})

test('detail service strips unknown and personal fields before data can enter the shared cache', async () => {
  const fixture = mediaDetail('book')
  const result = await fetchMediaDetail(identities.book, { requestImpl: async () => ({ ...fixture,
    userMedia: { status: 'reading', rating: 9 }, lists: ['Private'], currentUser: { id: '1' },
    details: { ...fixture.details, categories: ['Duplicate'], userRating: 9 },
  }) })
  assert.deepEqual(result, fixture)
})

test('detail response validation rejects mismatched identities, malformed fields, and unsafe artwork', async () => {
  const fixture = mediaDetail('movie')
  const malformed = [null, [], {}, { ...fixture, details: [] }, { ...fixture, details: null },
    { ...fixture, title: ' ' }, { ...fixture, sourceId: '43' }, { ...fixture, mediaType: 'tv' },
    { ...fixture, source: 'rawg' }, { ...fixture, sourceId: 42 },
    { ...fixture, genres: [] }, { ...fixture, genres: [''] }, { ...fixture, description: null },
    { ...fixture, description: 'x'.repeat(20001) }, { ...fixture, genres: Array(33).fill('Genre') }]
  for (const artworkImage of ['http://example.test/image', 'javascript:alert(1)', 'data:image/png,bad',
    'https://user:password@example.test/image', '/relative.jpg', []]) malformed.push({ ...fixture, artworkImage })
  for (const runtimeMinutes of [0, -1, '120', 1.5, Infinity, 2147483648]) {
    malformed.push({ ...fixture, details: { runtimeMinutes } })
  }
  for (const releaseDate of ['2023-02-29', '2024-13-01', '2024', '2024-02', '2024-02-29\n']) {
    malformed.push({ ...fixture, details: { releaseDate } })
  }
  for (const value of malformed) {
    await assert.rejects(fetchMediaDetail(identities.movie, { requestImpl: async () => value }), { code: 'invalid_response' })
  }
  await assert.rejects(fetchMediaDetail(identities.tv, { requestImpl: async () => mediaDetail('tv', { details: { numberOfSeasons: 0 } }) }), { code: 'invalid_response' })
})

test('book dates retain partial precision and ISBNs remain strings', async () => {
  for (const publishedDate of ['1997', '1997-06', '1997-06-26', '2024-02-29']) {
    const result = await fetchMediaDetail(identities.book, { requestImpl: async () => mediaDetail('book', {
      details: { publishedDate, isbn10: '0306406152', isbn13: '9780306406157' },
    }) })
    assert.equal(result.details.publishedDate, publishedDate)
    assert.equal(result.details.isbn10, '0306406152')
    assert.equal(result.details.isbn13, '9780306406157')
  }
  for (const details of [{ isbn10: 306406152 }, { isbn13: '9780306406157-extra' },
    { publishedDate: '0000' }, { publishedDate: '1997-06-31' }]) {
    await assert.rejects(fetchMediaDetail(identities.book, { requestImpl: async () => mediaDetail('book', { details }) }), { code: 'invalid_response' })
  }
})

test('detail service preserves structured errors and never contacts the backend for invalid identities', async () => {
  for (const [status, code] of [[404, 'media_not_found'], [503, 'provider_unavailable'], [429, 'rate_limited'],
    [502, 'provider_error'], [0, 'request_timeout'], [0, 'network_error']]) {
    const error = new ApiError('Safe error', status, code)
    await assert.rejects(fetchMediaDetail(identities.movie, { requestImpl: async () => { throw error } }), (cause) => cause === error)
  }
  let calls = 0
  await assert.rejects(fetchMediaDetail({ ...identities.movie, sourceId: '../bad' }, {
    requestImpl: async () => { calls++ },
  }), { status: 404, code: 'not_found' })
  assert.equal(calls, 0)
})
