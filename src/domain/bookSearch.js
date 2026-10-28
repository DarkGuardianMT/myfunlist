export function normalizeBookSearchOptions(options = {}) {
  return {
    field: ['title', 'author'].includes(options.field) ? options.field : 'all',
    sort: options.sort === 'newest' ? 'newest' : 'relevance',
    language: ['en', 'nl', 'tr'].includes(options.language) ? options.language : 'any',
  }
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
