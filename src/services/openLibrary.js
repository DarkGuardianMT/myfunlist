import { ApiError, request } from './apiClient.js'

const cache = new Map()
const pending = new Map()
let generation = 0
export function clearOpenLibraryCache() {
  generation++
  cache.clear()
  pending.clear()
}

export function normalizeOpenLibraryOptions(options = {}) {
  const language = ['en', 'nl', 'tr'].includes(options.language) ? options.language : 'any'
  return {
    field: ['title', 'author', 'isbn'].includes(options.field) ? options.field : 'general',
    language,
    languageMode: language !== 'any' && options.languageMode === 'strict' ? 'strict' : 'preferred',
  }
}

export function validIsbn(value) {
  if (/^[0-9]{9}[0-9X]$/.test(value)) {
    return [...value].reduce((sum, digit, i) => sum + (10 - i) * (digit === 'X' ? 10 : Number(digit)), 0) % 11 === 0
  }
  return /^97[89][0-9]{10}$/.test(value) &&
    [...value].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10 === 0
}

const id = (value, suffix) => typeof value === 'string' && value.length <= 32 && new RegExp(`^OL[1-9][0-9]*${suffix}$`).test(value)
const texts = (value) => Array.isArray(value) && value.every((text) => typeof text === 'string')

export function validateOpenLibraryResponse(data) {
  if (data?.provider !== 'open-library' || !Array.isArray(data.items) || data.items.length > 10 ||
    !Number.isInteger(data.providerTotal) || data.providerTotal < 0 ||
    !data.omitted || !['invalid', 'duplicateWork', 'language', 'isbn'].every((key) => Number.isInteger(data.omitted[key]) && data.omitted[key] >= 0)) {
    throw new ApiError('Invalid book response.', 502, 'invalid_response')
  }
  const seen = new Set()
  for (const item of data.items) {
    const edition = item?.selectedEdition
    if (item?.provider !== 'open-library' || !id(item.workId, 'W') || seen.has(item.workId) ||
      typeof item.workTitle !== 'string' || !item.workTitle.trim() || !texts(item.authors) ||
      !(item.firstPublicationYear === null || Number.isInteger(item.firstPublicationYear) && item.firstPublicationYear > 0 && item.firstPublicationYear <= 9999) ||
      !(item.editionCount === null || Number.isInteger(item.editionCount) && item.editionCount >= 0) ||
      !(edition === null || edition && id(edition.editionId, 'M') && (edition.title === null || typeof edition.title === 'string') &&
        texts(edition.languages) && edition.languages.every((code) => /^[a-z]{3}$/.test(code)) &&
        texts(edition.publicationDates) && texts(edition.isbns) && edition.isbns.every(validIsbn) &&
        ['match', 'unknown', 'unverified', 'ambiguous', 'mismatch', 'inconsistent'].includes(edition.languageStatus)) ||
      !(item.cover === null || Number.isInteger(item.cover?.id) && item.cover.id > 0 &&
        item.cover.url === `https://covers.openlibrary.org/b/id/${item.cover.id}-M.jpg?default=false`)) {
      throw new ApiError('Invalid book response.', 502, 'invalid_response')
    }
    seen.add(item.workId)
  }
  return data
}

export async function searchOpenLibrary(query, options = {}) {
  const normalized = normalizeOpenLibraryOptions(options)
  let q = typeof query === 'string' ? query.trim() : ''
  if (normalized.field === 'isbn') q = q.replace(/[ -]/g, '').toUpperCase()
  if (!q || [...q].length > 200 || /[\x00-\x1f\x7f]/.test(q) || normalized.field === 'isbn' && !validIsbn(q)) {
    throw new ApiError('Enter a valid search or ISBN checksum.', 422, 'validation_error')
  }
  const params = new URLSearchParams({ q, field: normalized.field, languageMode: normalized.languageMode, limit: '10' })
  if (normalized.language !== 'any') params.set('language', normalized.language)
  const key = params.toString()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key)
    cache.set(key, cached)
    return cached.data
  }
  cache.delete(key)
  if (pending.has(key)) return pending.get(key)
  const version = generation
  const promise = request(`/api/v1/pilot/open-library/search?${params}`, { timeoutMs: 11000, handleUnauthorized: false })
    .then(validateOpenLibraryResponse).then((data) => {
      const code = { en: 'eng', nl: 'dut', tr: 'tur' }[normalized.language]
      if (data.items.some(item => normalized.languageMode === 'strict' &&
        (item.selectedEdition?.languageStatus !== 'match' || item.selectedEdition.languages.length !== 1 || item.selectedEdition.languages[0] !== code) ||
        normalized.field === 'isbn' && !item.selectedEdition?.isbns.includes(q))) {
        throw new ApiError('Invalid edition selection.', 502, 'invalid_response')
      }
      if (version === generation) {
        for (const [key, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(key)
        cache.set(key, { data, expiresAt: Date.now() + 300000 })
        while (cache.size > 20) cache.delete(cache.keys().next().value)
      }
      return data
    }).finally(() => { if (pending.get(key) === promise) pending.delete(key) })
  pending.set(key, promise)
  return promise
}

export function openLibraryError(error) {
  if (error.status === 404) return { state: 'unavailable', message: 'Open Library discovery has not been activated. You can choose Google Books separately.' }
  if (error.status === 429) return { state: 'rate-limited', message: 'Too many searches. Wait before trying again.' }
  if (error.code === 'provider_busy') return { state: 'busy', message: 'Book search is busy protecting the shared provider budget. Wait before trying again.' }
  if (error.status === 422) return { state: 'invalid', message: 'Check your search. ISBN searches need a valid ISBN-10 or ISBN-13 checksum.' }
  if (error.status === 503) return { state: 'unavailable', message: 'Open Library discovery is temporarily unavailable. Please wait before trying again.' }
  if (error.status === 502 || error.code === 'invalid_response') return { state: 'error', message: 'Open Library returned unsupported data. Please try again later.' }
  return { state: 'error', message: 'Could not reach book search. Check your connection and try again.' }
}
