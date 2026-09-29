import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/services/apiClient.js'
import { getTmdbErrorMessage, searchMovies, searchTvShows } from '../src/services/mediaDiscovery.js'

const movie = { source: 'tmdb', sourceId: '42', mediaType: 'movie', title: 'The Matrix',
  releaseYear: '1999', posterImage: null, description: null }
const show = { source: 'tmdb', sourceId: '52', mediaType: 'tv', title: 'Breaking Bad',
  firstAirYear: '2008', posterImage: null, description: null }

test('movie and TV discovery use bounded same-origin MyFunList requests', async () => {
  const calls = []
  const requestImpl = async (path, options) => {
    calls.push({ path, options })
    return path.includes('/movie?') ? [movie] : [show]
  }
  assert.deepEqual(await searchMovies('  The Matrix  ', { requestImpl }), [movie])
  assert.deepEqual(await searchTvShows(' Breaking Bad ', { requestImpl }), [show])
  assert.deepEqual(calls.map(({ path }) => path), [
    '/api/v1/discover/movie?q=The%20Matrix',
    '/api/v1/discover/tv?q=Breaking%20Bad',
  ])
  assert.ok(calls.every(({ options }) => options.timeoutMs > 0 && options.handleUnauthorized === false))
})

test('movie and TV empty queries and empty API results stay empty', async () => {
  let calls = 0
  const requestImpl = async () => { calls++; return [] }
  assert.deepEqual(await searchMovies(' ', { requestImpl }), [])
  assert.deepEqual(await searchTvShows('', { requestImpl }), [])
  assert.equal(calls, 0)
  assert.deepEqual(await searchMovies('unknown', { requestImpl }), [])
  assert.equal(calls, 1)
})

test('movie and TV discovery reject malformed API data and show safe errors', async () => {
  await assert.rejects(searchMovies('matrix', { requestImpl: async () => [{ ...movie, mediaType: 'tv' }] }),
    { code: 'invalid_response' })
  await assert.rejects(searchTvShows('breaking', { requestImpl: async () => ({ results: [show] }) }),
    { code: 'invalid_response' })
  assert.match(getTmdbErrorMessage(new ApiError('secret', 503, 'provider_unavailable')), /temporarily unavailable/)
  assert.match(getTmdbErrorMessage(new ApiError('secret', 502, 'provider_error')), /unexpected response/)
  assert.doesNotMatch(getTmdbErrorMessage(new ApiError('secret', 502, 'provider_error')), /secret/)
})
