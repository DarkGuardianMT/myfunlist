export function normalizeBookSearchOptions(options = {}) {
  return {
    field: ['title', 'author'].includes(options.field) ? options.field : 'all',
    sort: options.sort === 'newest' ? 'newest' : 'relevance',
    language: ['en', 'nl', 'tr'].includes(options.language) ? options.language : 'any',
  }
}

export function normalizeBookLanguage(value) {
  const language = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[a-z]{2}$/.test(language) ? language : null
}

export function selectBooksByLanguage(books, language) {
  const selected = normalizeBookSearchOptions({ language }).language
  let otherLanguageCount = 0
  let unknownLanguageCount = 0
  if (selected === 'any') return { results: books, otherLanguageCount, unknownLanguageCount }

  // Google kan langRestrict negeren; toon bij een taalkeuze alleen bevestigde ISO-639-1-matches.
  const results = books.filter((book) => {
    const actual = normalizeBookLanguage(book?.language)
    if (actual === selected) return true
    if (actual) otherLanguageCount++
    else unknownLanguageCount++
    return false
  })
  return { results, otherLanguageCount, unknownLanguageCount }
}

export function buildBookSearchExpression(query, field) {
  if (field !== 'title' && field !== 'author') return query
  const operator = field === 'title' ? 'intitle' : 'inauthor'
  // Elk woord krijgt de beperking; expliciet geciteerde woordgroepen blijven bij elkaar.
  return [...query.matchAll(/"([^"]*)"|([^"\s]+)/gu)]
    .map((match) => (match[1] ?? match[2]).trim())
    .filter(Boolean)
    .map((term) => `${operator}:"${term}"`)
    .join(' ')
}
