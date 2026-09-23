const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes'

function getCoverImage(imageLinks = {}) {
  const safeImageLinks = imageLinks && typeof imageLinks === 'object' ? imageLinks : {}
  const coverImage = safeImageLinks.thumbnail || safeImageLinks.smallThumbnail

  return typeof coverImage === 'string' ? coverImage.replace(/^http:/, 'https:') : null
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
    publishedDate,
    publishedYear: publishedDate?.match(/^\d{4}/)?.[0] || null,
    coverImage: getCoverImage(volumeInfo.imageLinks),
    description: typeof volumeInfo.description === 'string' ? volumeInfo.description : null,
    mediaType: 'book',
  }
}

export async function searchBooks(query) {
  const normalizedQuery = typeof query === 'string' ? query.trim() : ''

  if (!normalizedQuery) {
    return []
  }

  const params = new URLSearchParams({
    q: normalizedQuery,
    printType: 'books',
    maxResults: '24',
  })
  const apiKey = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY?.trim()

  if (apiKey) {
    params.set('key', apiKey)
  }

  const response = await fetch(`${GOOGLE_BOOKS_API_URL}?${params}`)

  if (!response.ok) {
    throw new Error('Google Books request failed')
  }

  const data = await response.json()

  return Array.isArray(data?.items) ? data.items.map(normalizeGoogleBook) : []
}
