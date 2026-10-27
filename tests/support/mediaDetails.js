export const identities = {
  book: { mediaType: 'book', source: 'google-books', sourceId: 'Book_9-x' },
  movie: { mediaType: 'movie', source: 'tmdb', sourceId: '42' },
  tv: { mediaType: 'tv', source: 'tmdb', sourceId: '42' },
  game: { mediaType: 'game', source: 'rawg', sourceId: '62' },
}

export const metadata = {
  book: { authors: ['A. Author', 'B. Writer'], publisher: 'Example Press', pageCount: 320,
    publishedDate: '1997-06', language: 'en', isbn10: '0306406152', isbn13: '9780306406157' },
  movie: { releaseDate: '2024-02-29', runtimeMinutes: 139, originalTitle: 'Original Movie',
    originalLanguage: 'en', directors: ['A. Director'] },
  tv: { firstAirDate: '2020-01-02', lastAirDate: '2024-06-07', numberOfSeasons: 5,
    numberOfEpisodes: 62, seriesStatus: 'Ended', originalTitle: 'Original Show', originalLanguage: 'en' },
  game: { releaseDate: '2021-06-07', platforms: ['PC', 'Switch'], developers: ['Example Studio'], publishers: ['Example Publisher'] },
}

export function mediaDetail(type = 'movie', overrides = {}) {
  return { ...identities[type], title: `Fixture ${type}`, details: { ...metadata[type] },
    artworkImage: 'https://example.test/artwork.jpg', description: 'A public description.', genres: ['Adventure'], ...overrides }
}

export const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }) })
export const fail = (status, code) => ({ ok: false, status, json: async () => ({
  error: { code, message: 'Unsafe fixture-secret https://provider.test/internal' },
}) })
export const settle = () => new Promise((resolve) => setImmediate(resolve))
