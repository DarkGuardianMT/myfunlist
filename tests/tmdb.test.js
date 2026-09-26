import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTmdbMovie, normalizeTmdbTvShow } from '../src/services/tmdb.js'

test('movie and TV metadata stay type-specific and exclude public ratings', () => {
  const movie = normalizeTmdbMovie({
    id: 42,
    title: 'Example Movie',
    release_date: '2024-02-03',
    poster_path: '/movie.jpg',
    overview: 'Movie description',
    vote_average: 9.2,
  })
  const show = normalizeTmdbTvShow({
    id: 42,
    name: 'Example Show',
    first_air_date: '2023-01-02',
    poster_path: '/show.jpg',
    vote_average: 8.8,
  })

  assert.equal(movie.sourceId, '42')
  assert.equal(show.sourceId, '42')
  assert.equal(movie.mediaType, 'movie')
  assert.equal(show.mediaType, 'tv')
  assert.equal(movie.releaseYear, '2024')
  assert.equal(show.firstAirYear, '2023')
  assert.ok(movie.posterImage.endsWith('/movie.jpg'))
  assert.ok(show.posterImage.endsWith('/show.jpg'))
  assert.equal(movie.description, 'Movie description')
  assert.equal('rating' in movie, false)
  assert.equal('rating' in show, false)
  assert.equal('vote_average' in movie, false)
})

test('incomplete TMDB results normalize without crashing', () => {
  const movie = normalizeTmdbMovie(null)
  const show = normalizeTmdbTvShow({ poster_path: 'bad-path' })
  assert.equal(movie.title, 'Untitled movie')
  assert.equal(movie.releaseYear, null)
  assert.equal(movie.posterImage, null)
  assert.equal(show.title, 'Untitled TV show')
  assert.equal(show.firstAirYear, null)
  assert.equal(show.posterImage, null)
})
