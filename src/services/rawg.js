const RAWG_GAMES_URL = 'https://api.rawg.io/api/games'

const ERROR_MESSAGES = {
  'missing-credential': 'Game search is not configured yet. Add a RAWG API key and try again.',
  unauthorized: 'RAWG could not authorize this search. Check the configured API key.',
  'rate-limited': 'RAWG is receiving too many requests right now. Please try again shortly.',
  unavailable: 'RAWG is temporarily unavailable. Please try again in a moment.',
  network: 'We could not reach RAWG. Check your connection and try again.',
  'invalid-response': 'RAWG returned an unexpected response. Please try again later.',
  default: 'We could not load games from RAWG right now. Please try again in a moment.',
}

class RawgError extends Error {
  constructor(code) {
    super(`RAWG request failed: ${code}`)
    this.name = 'RawgError'
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

function normalizeImage(value) {
  const image = normalizeText(value)

  if (!image) return null

  try {
    const url = new URL(image)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function normalizeRawgGame(item = {}) {
  const game = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const releaseDate = normalizeText(game.released)
  const platforms = Array.isArray(game.platforms)
    ? game.platforms
        .map((entry) => normalizeText(entry?.platform?.name))
        .filter(Boolean)
    : []

  return {
    source: 'rawg',
    sourceId: normalizeSourceId(game.id),
    mediaType: 'game',
    title: normalizeText(game.name) || 'Untitled game',
    releaseDate,
    releaseYear: releaseDate?.match(/^\d{4}/)?.[0] || null,
    coverImage: normalizeImage(game.background_image),
    platforms,
  }
}

function getErrorCode(status) {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'unavailable'
  return 'request-failed'
}

export async function searchGames(query, {
  apiKey = import.meta.env?.VITE_RAWG_API_KEY,
  fetchImpl = fetch,
} = {}) {
  const normalizedQuery = typeof query === 'string' ? query.trim().slice(0, 200) : ''

  if (!normalizedQuery) return []

  const normalizedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!normalizedKey) throw new RawgError('missing-credential')

  const params = new URLSearchParams({
    key: normalizedKey,
    search: normalizedQuery,
    page_size: '20',
    page: '1',
  })

  let response
  try {
    response = await fetchImpl(`${RAWG_GAMES_URL}?${params}`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new RawgError('network')
  }

  if (!response.ok) throw new RawgError(getErrorCode(response.status))

  let data
  try {
    data = await response.json()
  } catch {
    throw new RawgError('invalid-response')
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
    throw new RawgError('invalid-response')
  }

  return data.results.map(normalizeRawgGame).filter((game) => game.sourceId)
}

export function getRawgErrorMessage(error) {
  return ERROR_MESSAGES[error instanceof RawgError ? error.code : 'default'] || ERROR_MESSAGES.default
}
