import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/services/apiClient.js'
import { getRawgErrorMessage, searchGames } from '../src/services/mediaDiscovery.js'

const game = { source: 'rawg', sourceId: '62', mediaType: 'game', title: 'Portal',
  releaseYear: '2007', coverImage: null, platforms: [] }

test('game discovery uses the same-origin API without a browser provider key', async () => {
  let call
  const results = await searchGames('  Portal & 2  ', {
    requestImpl: async (path, options) => { call = { path, options }; return [game] },
  })
  assert.deepEqual(results, [game])
  assert.equal(call.path, '/api/v1/discover/game?q=Portal%20%26%202')
  assert.ok(call.options.timeoutMs > 0)
  assert.equal(call.options.handleUnauthorized, false)
})

test('game discovery preserves empty searches and validates normalized results', async () => {
  let calls = 0
  const requestImpl = async () => { calls++; return [] }
  assert.deepEqual(await searchGames('  ', { requestImpl }), [])
  assert.equal(calls, 0)
  assert.deepEqual(await searchGames('unknown', { requestImpl }), [])
  await assert.rejects(searchGames('portal', { requestImpl: async () => [{ ...game, platforms: null }] }),
    { code: 'invalid_response' })
})

test('game search maps safe backend and timeout errors to user feedback', () => {
  assert.equal(getRawgErrorMessage(new ApiError('Too many requests. Please try again later.', 429,
    'rate_limited')), 'Too many requests. Please try again later.')
  assert.match(getRawgErrorMessage(new ApiError('secret', 503, 'provider_unavailable')), /temporarily unavailable/)
  assert.match(getRawgErrorMessage(new ApiError('secret', 0, 'request_timeout')), /timed out/)
  assert.match(getRawgErrorMessage(new ApiError('secret', 0, 'network_error')), /could not reach MyFunList/)
  assert.doesNotMatch(getRawgErrorMessage(new ApiError('secret', 502, 'provider_error')), /secret/)
})
