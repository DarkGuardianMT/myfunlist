function normalizeText(value) {
  return typeof value === 'string'
    ? value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ')
    : ''
}

function withoutArticle(value) {
  return value.replace(/^(?:the|an|a) /u, '')
}

function relevanceTier(title, query, tokens) {
  if (!title) return 5
  if (title === query) return 0
  if (withoutArticle(title) === withoutArticle(query)) return 1
  if (title.startsWith(`${query} `)) return 2
  if (` ${title} `.includes(` ${query} `)) return 3
  const titleTokens = new Set(title.split(' '))
  const overlap = tokens.filter((token) => titleTokens.has(token)).length
  // Minstens twee gedeelde woorden en 75% van de unieke zoekwoorden vormen sterke overlap.
  return overlap >= 2 && overlap / tokens.length >= 0.75 ? 4 : 5
}

export function rankBooksByTitle(books, query) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return [...books]
  const tokens = [...new Set(normalizedQuery.split(' '))]
  return books.map((book, index) => ({ book, index,
    tier: relevanceTier(normalizeText(book?.title), normalizedQuery, tokens),
  })).sort((a, b) => a.tier - b.tier || a.index - b.index).map(({ book }) => book)
}
