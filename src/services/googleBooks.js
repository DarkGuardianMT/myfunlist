import { fetchProvider } from './providerFetch.js'
import { buildBookSearchExpression, normalizeBookLanguage, normalizeBookSearchOptions } from '../domain/bookSearch.js'
import { rankBooksByTitle } from '../domain/bookRelevance.js'

const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes'

const ERROR_MESSAGES = {
  unauthorized: 'Google Books could not authorize this search. Check the configured API key.',
  'rate-limited': 'Google Books is receiving too many requests right now. Please try again shortly.',
  unavailable: 'Google Books is temporarily unavailable. Please try again in a moment.',
  network: 'We could not reach Google Books. Check your connection and try again.',
  'invalid-response': 'Google Books returned an unexpected response. Please try again later.',
  default: 'We could not load books right now. Please try again in a moment.',
}

class GoogleBooksError extends Error {
  constructor(code) {
    super(`Google Books request failed: ${code}`)
    this.name = 'GoogleBooksError'
    this.code = code
  }
}

function getErrorCode(status) {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'unavailable'
  return 'request-failed'
}

function getCoverImage(imageLinks = {}) {
  const safeImageLinks = imageLinks && typeof imageLinks === 'object' ? imageLinks : {}
  const coverImage = safeImageLinks.thumbnail || safeImageLinks.smallThumbnail
  if (typeof coverImage !== 'string') return null
  try {
    const url = new URL(coverImage.replace(/^http:/i, 'https:'))
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function normalizeGoogleBook(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {}
  const volumeInfo =
    safeItem.volumeInfo && typeof safeItem.volumeInfo === 'object' ? safeItem.volumeInfo : {}
  const publishedDate =
    typeof volumeInfo.publishedDate === 'string' ? volumeInfo.publishedDate : null
  const authors = Array.isArray(volumeInfo.authors)
    ? volumeInfo.authors
        .filter((author) => typeof author === 'string')
        .map((author) => author.trim())
        .filter(Boolean)
    : []

  return {
    source: 'google-books',
    sourceId: safeItem.id || null,
    title:
      typeof volumeInfo.title === 'string'
        ? volumeInfo.title.trim() || 'Untitled book'
        : 'Untitled book',
    authors,
    language: normalizeBookLanguage(volumeInfo.language),
    publishedDate,
    publishedYear: publishedDate?.match(/^\d{4}/)?.[0] || null,
    coverImage: getCoverImage(volumeInfo.imageLinks),
    description: typeof volumeInfo.description === 'string' ? volumeInfo.description : null,
    mediaType: 'book',
  }
}

export async function searchBooks(query, {
  apiKey = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY,
  fetchImpl = fetch,
  field,
  sort,
  language,
} = {}) {
  const normalizedQuery = typeof query === 'string' ? query.trim() : ''

  if (!normalizedQuery) {
    return []
  }

  const options = normalizeBookSearchOptions({ field, sort, language })
  const expression = buildBookSearchExpression(normalizedQuery, options.field)
  if (!expression) return []
  const params = new URLSearchParams({
    q: expression,
    printType: 'books',
    maxResults: '40',
    orderBy: options.sort,
  })
  if (options.language !== 'any') params.set('langRestrict', options.language)
  const normalizedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (normalizedKey) {
    params.set('key', normalizedKey)
  }

  let response
  try {
    response = await fetchProvider(`${GOOGLE_BOOKS_API_URL}?${params}`, {}, fetchImpl)
  } catch {
    throw new GoogleBooksError('network')
  }

  if (!response.ok) {
    throw new GoogleBooksError(getErrorCode(response.status))
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw new GoogleBooksError('invalid-response')
  }

  if (!data || typeof data !== 'object' ||
    (data.items !== undefined && !Array.isArray(data.items)) ||
    (data.items === undefined && data.totalItems !== 0)) {
    throw new GoogleBooksError('invalid-response')
  }

  const books = Array.isArray(data.items) ? data.items.map(normalizeGoogleBook) : []
  // Auteurzoekopdrachten hebben geen titelintentie; behoud daarvoor de providerrelevantie.
  return options.sort === 'relevance' && options.field !== 'author'
    ? rankBooksByTitle(books, normalizedQuery) : books
}

export function getGoogleBooksErrorMessage(error) {
  return ERROR_MESSAGES[error instanceof GoogleBooksError ? error.code : 'default'] || ERROR_MESSAGES.default
}
