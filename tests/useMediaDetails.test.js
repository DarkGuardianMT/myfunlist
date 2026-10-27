import test, { afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { useMediaDetails, clearMediaDetailCache, MEDIA_DETAIL_CACHE_TTL, MEDIA_DETAIL_CACHE_LIMIT } from '../src/composables/useMediaDetails.js'
import { identities, mediaDetail, ok, fail, settle } from './support/mediaDetails.js'

const scopes = []
const originalFetch = globalThis.fetch
function loader(identity = identities.movie) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useMediaDetails(identity))
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  clearMediaDetailCache()
  globalThis.fetch = originalFetch
  mock.restoreAll()
})

test('concurrent consumers deduplicate pending requests and share public cached results', async () => {
  let finish
  let calls = 0
  globalThis.fetch = async (path, options) => {
    calls++
    assert.equal(path, '/api/v1/media/movie/tmdb/42')
    assert.equal(options.method, 'GET')
    assert.equal(options.credentials, 'same-origin')
    return new Promise((resolve) => { finish = resolve })
  }
  const first = loader()
  const second = loader()
  assert.equal(first.status.value, 'loading')
  assert.equal(first.detail.value, null)
  assert.equal(calls, 1)
  finish(ok(mediaDetail()))
  await settle()
  assert.equal(first.status.value, 'success')
  assert.deepEqual(second.detail.value, first.detail.value)
  const cached = loader()
  await settle()
  assert.equal(cached.detail.value.title, 'Fixture movie')
  assert.equal(calls, 1)
})

test('all identity fields are watched and old success/error responses cannot replace the current page', async () => {
  const waiting = []
  globalThis.fetch = () => new Promise((resolve) => waiting.push(resolve))
  const identity = ref(identities.movie)
  const page = loader(identity)
  identity.value = identities.tv
  assert.equal(page.detail.value, null)
  assert.equal(page.status.value, 'loading')
  waiting[0](ok(mediaDetail()))
  await settle()
  assert.equal(page.status.value, 'loading')
  waiting[1](ok(mediaDetail('tv')))
  await settle()
  assert.equal(page.detail.value.mediaType, 'tv')
  identity.value = identities.book
  assert.equal(page.detail.value, null)
  identity.value = { ...identities.book, sourceId: 'Other-book' }
  waiting[2](fail(503, 'provider_unavailable'))
  await settle()
  assert.equal(page.status.value, 'loading')
  waiting[3](ok(mediaDetail('book', { sourceId: 'Other-book' })))
  await settle()
  assert.equal(page.detail.value.sourceId, 'Other-book')
  assert.equal(page.error.value, null)
})

test('failures are not cached, have distinct states, and retry only on request', async () => {
  for (const [status, code, state] of [[404, 'media_not_found', 'not-found'],
    [503, 'provider_unavailable', 'provider-unavailable'], [429, 'rate_limited', 'rate-limited'],
    [502, 'provider_error', 'error'], [503, 'service_unavailable', 'error']]) {
    clearMediaDetailCache()
    let calls = 0
    globalThis.fetch = async () => { calls++; return fail(status, code) }
    const page = loader()
    await settle()
    assert.equal(page.status.value, state)
    assert.equal(page.detail.value, null)
    assert.equal(page.error.value.code, code)
    await settle()
    assert.equal(calls, 1)
    const another = loader()
    await settle()
    assert.equal(another.status.value, state)
    assert.equal(calls, 2)
    globalThis.fetch = async () => { calls++; return ok(mediaDetail()) }
    await page.retry()
    assert.equal(page.status.value, 'success')
    assert.equal(page.error.value, null)
    assert.equal(calls, 3)
  }
})

test('cache TTL expires after five minutes and movie/TV identities remain separate', async () => {
  let now = 1000
  mock.method(Date, 'now', () => now)
  let calls = 0
  globalThis.fetch = async (path) => { calls++; return ok(mediaDetail(path.includes('/tv/') ? 'tv' : 'movie')) }
  loader()
  await settle()
  now += MEDIA_DETAIL_CACHE_TTL - 1
  loader()
  await settle()
  assert.equal(calls, 1)
  loader(identities.tv)
  await settle()
  assert.equal(calls, 2)
  now++
  loader()
  await settle()
  assert.equal(calls, 3)
})

test('cache bounds evict the least recently used entry', async () => {
  let calls = 0
  globalThis.fetch = async (path) => { calls++; return ok(mediaDetail('movie', { sourceId: path.split('/').at(-1) })) }
  for (let id = 1; id <= MEDIA_DETAIL_CACHE_LIMIT; id++) {
    loader({ ...identities.movie, sourceId: String(id) })
    await settle()
  }
  loader({ ...identities.movie, sourceId: '1' })
  await settle()
  assert.equal(calls, MEDIA_DETAIL_CACHE_LIMIT)
  loader({ ...identities.movie, sourceId: String(MEDIA_DETAIL_CACHE_LIMIT + 1) })
  await settle()
  loader({ ...identities.movie, sourceId: '1' })
  await settle()
  assert.equal(calls, MEDIA_DETAIL_CACHE_LIMIT + 1)
  loader({ ...identities.movie, sourceId: '2' })
  await settle()
  assert.equal(calls, MEDIA_DETAIL_CACHE_LIMIT + 2)
})

test('invalid identities make no request and disposed loaders ignore late results', async () => {
  let calls = 0
  let finish
  globalThis.fetch = () => { calls++; return new Promise((resolve) => { finish = resolve }) }
  const invalid = loader({ ...identities.movie, sourceId: '0' })
  assert.equal(invalid.status.value, 'not-found')
  assert.equal(calls, 0)
  const page = loader()
  scopes.at(-1).stop()
  finish(ok(mediaDetail()))
  await settle()
  assert.equal(page.detail.value, null)
  assert.equal(page.status.value, 'loading')
})

test('cache clearing prevents old pending responses from overwriting a newer cache entry', async () => {
  const waiting = []
  globalThis.fetch = () => new Promise((resolve) => waiting.push(resolve))
  loader()
  clearMediaDetailCache()
  const current = loader()
  waiting[1](ok(mediaDetail('movie', { title: 'New response', userMedia: { rating: 9 }, details: { userRating: 9 } })))
  await settle()
  waiting[0](ok(mediaDetail('movie', { title: 'Old response' })))
  await settle()
  const cached = loader()
  await settle()
  assert.equal(current.detail.value.title, 'New response')
  assert.equal(cached.detail.value.title, 'New response')
  assert.equal('userMedia' in cached.detail.value, false)
  assert.deepEqual(cached.detail.value.details, {})
  assert.equal(waiting.length, 2)
})
