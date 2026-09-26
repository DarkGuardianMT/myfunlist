import test from 'node:test'
import assert from 'node:assert/strict'
import { getRawgErrorMessage, normalizeRawgGame, searchGames } from '../src/services/rawg.js'

const game = {
  id: 3498,
  name: 'Grand Theft Auto V',
  released: '2013-09-17',
  background_image: 'https://example.com/game.jpg',
  platforms: [
    { platform: { name: 'PC' } },
    { platform: { name: 'PlayStation 5' } },
  ],
  rating: 4.5,
  metacritic: 92,
}

test('normalizes a RAWG search result without external ratings', () => {
  assert.deepEqual(normalizeRawgGame(game), {
    source: 'rawg',
    sourceId: '3498',
    mediaType: 'game',
    title: 'Grand Theft Auto V',
    releaseDate: '2013-09-17',
    releaseYear: '2013',
    coverImage: 'https://example.com/game.jpg',
    platforms: ['PC', 'PlayStation 5'],
  })
})

test('missing and malformed fields produce a safe game model', () => {
  assert.deepEqual(normalizeRawgGame({ id: ' 7 ', name: '  Game ', platforms: [null, {}, { platform: { name: ' ' } }] }), {
    source: 'rawg',
    sourceId: '7',
    mediaType: 'game',
    title: 'Game',
    releaseDate: null,
    releaseYear: null,
    coverImage: null,
    platforms: [],
  })
  assert.equal(normalizeRawgGame(null).sourceId, null)
  assert.equal(normalizeRawgGame({ background_image: 'bad-url' }).coverImage, null)
})

test('empty queries send no request, even without an API key', async () => {
  let calls = 0
  const results = await searchGames('  ', { fetchImpl: () => { calls += 1 } })
  assert.deepEqual(results, [])
  assert.equal(calls, 0)
})

test('search sends the key and trimmed query, then normalizes valid results', async () => {
  let calls = 0
  const results = await searchGames('  Grand Theft Auto  ', {
    apiKey: '  example-key  ',
    fetchImpl: async (request) => {
      calls += 1
      const url = new URL(request)
      assert.equal(url.origin + url.pathname, 'https://api.rawg.io/api/games')
      assert.equal(url.searchParams.get('key'), 'example-key')
      assert.equal(url.searchParams.get('search'), 'Grand Theft Auto')
      assert.equal(url.searchParams.get('page_size'), '20')
      return { ok: true, json: async () => ({ results: [game, null, { name: 'No ID' }] }) }
    },
  })

  assert.equal(calls, 1)
  assert.deepEqual(results, [normalizeRawgGame(game)])
})

test('an empty RAWG result list stays empty', async () => {
  const results = await searchGames('unknown game', {
    apiKey: 'test',
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }),
  })
  assert.deepEqual(results, [])
})

test('missing key and API failures map to friendly messages', async () => {
  await assert.rejects(
    searchGames('game', { apiKey: '', fetchImpl: () => { throw new Error('should not fetch') } }),
    (error) => getRawgErrorMessage(error).includes('not configured'),
  )

  for (const [status, message] of [
    [401, 'authorize'],
    [429, 'too many requests'],
    [503, 'temporarily unavailable'],
    [400, 'could not load'],
  ]) {
    await assert.rejects(
      searchGames('game', { apiKey: 'test', fetchImpl: async () => ({ ok: false, status }) }),
      (error) => getRawgErrorMessage(error).includes(message),
    )
  }

  await assert.rejects(
    searchGames('game', { apiKey: 'test', fetchImpl: async () => { throw new Error('offline') } }),
    (error) => getRawgErrorMessage(error).includes('Check your connection'),
  )

  await assert.rejects(
    searchGames('game', { apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ results: null }) }) }),
    (error) => getRawgErrorMessage(error).includes('unexpected response'),
  )

  await assert.rejects(
    searchGames('game', { apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad JSON') } }) }),
    (error) => getRawgErrorMessage(error).includes('unexpected response'),
  )
})
