import test from 'node:test'
import assert from 'node:assert/strict'
import { getMediaKey, isSupportedMediaIdentity, getMediaDetailRoute, getMediaDetailPath } from '../src/domain/mediaIdentity.js'
import { getMediaKey as legacyKey } from '../src/services/legacyLibrary.js'
import { identities } from './support/mediaDetails.js'

test('detail identities preserve source/type/ID and build canonical named routes and URLs', () => {
  for (const identity of Object.values(identities)) {
    assert.equal(isSupportedMediaIdentity(identity), true)
    assert.deepEqual(getMediaDetailRoute(identity), { name: 'media-detail', params: identity })
    assert.equal(getMediaDetailPath(identity), `/media/${identity.mediaType}/${identity.source}/${identity.sourceId}`)
    assert.equal(getMediaKey(identity), `${identity.source}:${identity.mediaType}:${identity.sourceId}`)
  }
  assert.notEqual(getMediaKey(identities.movie), getMediaKey(identities.tv))
})

test('strict detail identities reject invalid combinations, traversal, encoding tricks, and oversized IDs', () => {
  const invalid = [null, {}, { ...identities.movie, source: 'rawg' }, { ...identities.book, mediaType: 'anime' },
    { ...identities.movie, mediaType: ['movie'] }, { ...identities.movie, sourceId: 42 }]
  for (const id of ['', '.', '..', 'a/b', 'a\\b', '%2F', '%252f', 'a b', 'a+b', 'a\n', '\ta', 'é', 'a?b', 'a#b', 'x'.repeat(192)]) {
    invalid.push({ ...identities.book, sourceId: id })
  }
  for (const id of ['0', '-1', '01', '1.5', '+1', '42\n', '1'.repeat(21)]) {
    invalid.push({ ...identities.movie, sourceId: id })
  }
  for (const value of invalid) {
    assert.equal(isSupportedMediaIdentity(value), false)
    assert.equal(getMediaDetailRoute(value), null)
    assert.equal(getMediaDetailPath(value), null)
  }
  assert.equal(isSupportedMediaIdentity({ ...identities.book, sourceId: 'a'.repeat(191) }), true)
  assert.equal(isSupportedMediaIdentity({ ...identities.movie, sourceId: '1'.repeat(20) }), true)
})

test('moving media keys preserves the legacy import contract without allowing legacy IDs into detail routes', () => {
  assert.equal(legacyKey, getMediaKey)
  const legacy = { source: ' tmdb ', mediaType: 'movie', sourceId: ' old-id ' }
  assert.equal(getMediaKey(legacy), 'tmdb:movie:old-id')
  assert.equal(isSupportedMediaIdentity(legacy), false)
  assert.equal(getMediaKey({ source: 'future', mediaType: 'book', sourceId: 'id' }), 'future:book:id')
  assert.equal(getMediaKey({ ...identities.book, mediaType: 'anime' }), null)
})
