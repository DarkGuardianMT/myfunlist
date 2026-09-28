import { fetchProvider } from './providerFetch.js'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p'

const ERROR_MESSAGES = {
  'missing-credential':
    'Movie and TV search is not configured yet. Add a TMDB API token and try again.',
  unauthorized: 'TMDB could not authorize this search. Check the configured API token.',
  'rate-limited': 'TMDB is receiving too many requests right now. Please try again shortly.',
  unavailable: 'TMDB is temporarily unavailable. Please try again in a moment.',
  network: 'We could not reach TMDB. Check your connection and try again.',
  'invalid-response': 'TMDB returned an unexpected response. Please try again later.',
  default: 'We could not load results from TMDB right now. Please try again in a moment.',
}

class TmdbError extends Error {
  constructor(code) {
    super(`TMDB request failed: ${code}`)
    this.name = 'TmdbError'
    this.code = code
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() || null : null
}

function normalizeSourceId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return normalizeText(value)
}

function getYear(date) {
  return date?.match(/^\d{4}/)?.[0] || null
}

export function getTmdbImageUrl(path, size = 'w342') {
  const normalizedPath = normalizeText(path)

  if (!normalizedPath || !normalizedPath.startsWith('/')) {
    return null
  }

  return `${TMDB_IMAGE_URL}/${size}${normalizedPath}`
}

export function normalizeTmdbMovie(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {}
  const releaseDate = normalizeText(safeItem.release_date)

  return {
    source: 'tmdb',
    sourceId: normalizeSourceId(safeItem.id),
    mediaType: 'movie',
    title: normalizeText(safeItem.title) || 'Untitled movie',
    originalTitle: normalizeText(safeItem.original_title),
    releaseDate,
    releaseYear: getYear(releaseDate),
    posterImage: getTmdbImageUrl(safeItem.poster_path),
    backdropImage: getTmdbImageUrl(safeItem.backdrop_path, 'w780'),
    description: normalizeText(safeItem.overview),
    originalLanguage: normalizeText(safeItem.original_language),
  }
}

export function normalizeTmdbTvShow(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {}
  const firstAirDate = normalizeText(safeItem.first_air_date)

  return {
    source: 'tmdb',
    sourceId: normalizeSourceId(safeItem.id),
    mediaType: 'tv',
    title: normalizeText(safeItem.name) || 'Untitled TV show',
    originalTitle: normalizeText(safeItem.original_name),
    firstAirDate,
    firstAirYear: getYear(firstAirDate),
    posterImage: getTmdbImageUrl(safeItem.poster_path),
    backdropImage: getTmdbImageUrl(safeItem.backdrop_path, 'w780'),
    description: normalizeText(safeItem.overview),
    originalLanguage: normalizeText(safeItem.original_language),
  }
}

function getErrorCode(response) {
  if (response.status === 401 || response.status === 403) {
    return 'unauthorized'
  }

  if (response.status === 429) {
    return 'rate-limited'
  }

  if (response.status >= 500) {
    return 'unavailable'
  }

  return 'request-failed'
}

async function requestTmdb(path, query) {
  const apiToken = import.meta.env?.VITE_TMDB_API_TOKEN?.trim()

  if (!apiToken) {
    throw new TmdbError('missing-credential')
  }

  const params = new URLSearchParams({
    query,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  })
  let response

  try {
    response = await fetchProvider(`${TMDB_API_URL}${path}?${params}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
    })
  } catch {
    throw new TmdbError('network')
  }

  if (!response.ok) {
    throw new TmdbError(getErrorCode(response))
  }

  let data

  try {
    data = await response.json()
  } catch {
    throw new TmdbError('invalid-response')
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
    throw new TmdbError('invalid-response')
  }

  return data.results
}

function normalizeQuery(query) {
  return typeof query === 'string' ? query.trim() : ''
}

export async function searchMovies(query) {
  const normalizedQuery = normalizeQuery(query)

  if (!normalizedQuery) {
    return []
  }

  const results = await requestTmdb('/search/movie', normalizedQuery)

  return results.map(normalizeTmdbMovie)
}

export async function searchTvShows(query) {
  const normalizedQuery = normalizeQuery(query)

  if (!normalizedQuery) {
    return []
  }

  const results = await requestTmdb('/search/tv', normalizedQuery)

  return results.map(normalizeTmdbTvShow)
}

export function getTmdbErrorMessage(error) {
  return ERROR_MESSAGES[error instanceof TmdbError ? error.code : 'default'] || ERROR_MESSAGES.default
}
