import { getMediaDetailPath } from '../domain/mediaIdentity.js'
import { ApiError, request } from './apiClient.js'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (limit) => (value) => typeof value === 'string' && Boolean(value.trim())
  && value.length <= limit * 2 && [...value].length <= limit
const names = (value) => Array.isArray(value) && value.length > 0 && value.length <= 32
  && value.every(text(256))
const positiveInteger = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647

function date(value, partial = false) {
  if (typeof value !== 'string' || value.trim() !== value) return false
  if (!(partial ? /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) return false
  const [year, month = '01', day = '01'] = value.split('-')
  const fullDate = `${year}-${month}-${day}`
  const parsed = new Date(`${fullDate}T00:00:00Z`)
  return Number(year) > 0 && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === fullDate
}

function image(value) {
  if (!text(2048)(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const fields = {
  book: {
    authors: names, publisher: text(256), pageCount: positiveInteger,
    publishedDate: (value) => date(value, true), language: text(32),
    isbn10: (value) => typeof value === 'string' && /^[0-9]{9}[0-9X]$/.test(value) && value.length === 10,
    isbn13: (value) => typeof value === 'string' && /^[0-9]{13}$/.test(value) && value.length === 13,
  },
  movie: { releaseDate: date, runtimeMinutes: positiveInteger, originalTitle: text(2048),
    originalLanguage: text(32), directors: names },
  tv: { firstAirDate: date, lastAirDate: date, numberOfSeasons: positiveInteger,
    numberOfEpisodes: positiveInteger, seriesStatus: text(256), originalTitle: text(2048), originalLanguage: text(32) },
  game: { releaseDate: date, platforms: names, developers: names, publishers: names },
}
const sharedFields = { artworkImage: image, backdropImage: image, description: text(20000), genres: names }
const invalid = () => new ApiError('The server returned invalid media details.', 0, 'invalid_response')

function publicFields(input, validators) {
  const result = {}
  for (const [name, validate] of Object.entries(validators)) {
    if (!Object.hasOwn(input, name)) continue
    if (!validate(input[name])) throw invalid()
    result[name] = Array.isArray(input[name]) ? [...input[name]] : input[name]
  }
  return result
}

export async function fetchMediaDetail(identity, { requestImpl = request } = {}) {
  const path = getMediaDetailPath(identity)
  if (!path) throw new ApiError('Media not found.', 404, 'not_found')
  const data = await requestImpl(`/api/v1${path}`, { handleUnauthorized: false, timeoutMs: 11000 })
  if (!isObject(data) || !isObject(data.details) || !text(512)(data.title)
    || data.source !== identity.source || data.mediaType !== identity.mediaType || data.sourceId !== identity.sourceId) {
    throw invalid()
  }

  // Alleen het publieke contract mag in de detailpagina en de gedeelde cache terechtkomen.
  return {
    source: data.source, mediaType: data.mediaType, sourceId: data.sourceId, title: data.title,
    details: publicFields(data.details, fields[data.mediaType]),
    ...publicFields(data, sharedFields),
  }
}
