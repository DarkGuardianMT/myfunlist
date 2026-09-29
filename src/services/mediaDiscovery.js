import { ApiError, request } from './apiClient.js'

const SEARCH_TIMEOUT_MS = 11000

async function searchMedia(mediaType, query, requestImpl = request) {
  const normalizedQuery = typeof query === 'string' ? query.trim() : ''
  if (!normalizedQuery) return []

  const results = await requestImpl(`/api/v1/discover/${mediaType}?q=${encodeURIComponent(normalizedQuery)}`, {
    handleUnauthorized: false,
    timeoutMs: SEARCH_TIMEOUT_MS,
  })
  const source = mediaType === 'game' ? 'rawg' : 'tmdb'
  if (!Array.isArray(results) || results.some((item) =>
    !item || item.source !== source || item.mediaType !== mediaType ||
    typeof item.sourceId !== 'string' || !item.sourceId ||
    typeof item.title !== 'string' || !item.title ||
    (mediaType === 'game' && !Array.isArray(item.platforms)))) {
    throw new ApiError('The server returned an invalid response.', 0, 'invalid_response')
  }
  return results
}

export function searchMovies(query, options = {}) {
  return searchMedia('movie', query, options.requestImpl)
}

export function searchTvShows(query, options = {}) {
  return searchMedia('tv', query, options.requestImpl)
}

export function searchGames(query, options = {}) {
  return searchMedia('game', query, options.requestImpl)
}

function errorMessage(error, provider, noun) {
  if (error instanceof ApiError) {
    if (error.code === 'provider_unavailable') {
      return `${provider} is temporarily unavailable. Please try again in a moment.`
    }
    if (error.code === 'provider_error' || error.code === 'invalid_response') {
      return `${provider} returned an unexpected response. Please try again later.`
    }
    if (error.code === 'request_timeout') {
      return 'The search timed out. Please try again.'
    }
    if (error.code === 'network_error') {
      return 'We could not reach MyFunList. Check your connection and try again.'
    }
  }
  return `We could not load ${noun} right now. Please try again in a moment.`
}

export function getTmdbErrorMessage(error) {
  return errorMessage(error, 'TMDB', 'results from TMDB')
}

export function getRawgErrorMessage(error) {
  return errorMessage(error, 'RAWG', 'games from RAWG')
}
