import test from 'node:test'
import assert from 'node:assert/strict'
import { filterDiscoveryResults, normalizeResultFilters, resultFilterOptions } from '../src/domain/resultFilters.js'

test('returned-result filters combine existing metadata, retain provider order and never mutate cached results', () => {
  const movies = [
    { title: 'First', releaseYear: '2024', originalLanguage: 'en' },
    { title: 'Second', releaseYear: '2024', originalLanguage: 'nl' },
    { title: 'Third', releaseYear: '2024', originalLanguage: 'en' },
    { title: 'Missing', releaseYear: null },
  ]
  const snapshot = structuredClone(movies)
  const filter = normalizeResultFilters('movie', { resultYear: '2024', resultLanguage: 'en', resultPlatform: 'PC' })
  assert.deepEqual(filterDiscoveryResults('movie', movies, filter).map(item => item.title), ['First', 'Third'])
  assert.deepEqual(movies, snapshot)
  assert.deepEqual(resultFilterOptions('movie', movies).years, ['2024', 'unknown'])
  assert.equal(filterDiscoveryResults('movie', movies, normalizeResultFilters('movie', { resultYear: 'unknown' }))[0].title, 'Missing')
  assert.deepEqual(normalizeResultFilters('book', { resultYear: '2024' }), { year: 'any', language: 'any', platform: 'any' })
  assert.deepEqual(normalizeResultFilters('tv', { resultYear: ['2024'], resultLanguage: '<invalid>' }), { year: 'any', language: 'any', platform: 'any' })
})

test('TV filters first-air year and games filter full supplied platform names including missing metadata', () => {
  const shows = [{ firstAirYear: '2023', releaseYear: '2024' }, { firstAirYear: '2024' }]
  assert.equal(filterDiscoveryResults('tv', shows, normalizeResultFilters('tv', { resultYear: '2024' }))[0], shows[1])
  const games = [
    { title: 'PC only', releaseYear: '2020', platforms: ['PC'] },
    { title: 'Console', releaseYear: '2020', platforms: ['PlayStation 5', 'PC', 'PC'] },
    { title: 'Unknown', platforms: [] },
  ]
  assert.deepEqual(resultFilterOptions('game', games).platforms, ['PC', 'PlayStation 5', 'unknown'])
  assert.deepEqual(filterDiscoveryResults('game', games, normalizeResultFilters('game', { resultPlatform: 'PlayStation 5', resultYear: '2020' })).map(item => item.title), ['Console'])
  assert.equal(filterDiscoveryResults('game', games, normalizeResultFilters('game', { resultPlatform: 'unknown' }))[0], games[2])
  assert.equal(filterDiscoveryResults('game', games, normalizeResultFilters('game', { resultYear: '1990' })).length, 0)
})
