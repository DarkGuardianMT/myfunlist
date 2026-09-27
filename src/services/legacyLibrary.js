import {
  getDefaultStatus,
  isValidStatus,
  MEDIA_TYPES,
  PERSONAL_RATINGS,
} from '../domain/libraryMedia.js'

const STORAGE_KEY = 'myfunlist_library'
const LEGACY_STORAGE_KEY = 'trackora_library'
const SCHEMA_VERSION = 2

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function getMediaKey(media) {
  const source = typeof media?.source === 'string' ? media.source.trim() : ''
  const sourceId = typeof media?.sourceId === 'string' ? media.sourceId.trim() : ''
  const mediaType = media?.mediaType

  return source && sourceId && MEDIA_TYPES.includes(mediaType)
    ? `${source}:${mediaType}:${sourceId}`
    : null
}

function optionalText(value) {
  return typeof value === 'string' ? value : null
}

function normalizeMedia(media) {
  if (!getMediaKey(media)) return null

  const common = {
    source: media.source.trim(),
    sourceId: media.sourceId.trim(),
    mediaType: media.mediaType,
    title: typeof media.title === 'string' && media.title.trim()
      ? media.title.trim()
      : `Untitled ${media.mediaType === 'tv' ? 'TV show' : media.mediaType}`,
  }

  if (media.mediaType === 'book') {
    return {
      ...common,
      authors: Array.isArray(media.authors)
        ? media.authors.filter((author) => typeof author === 'string').map((author) => author.trim()).filter(Boolean)
        : [],
      publishedDate: optionalText(media.publishedDate),
      publishedYear: optionalText(media.publishedYear),
      coverImage: optionalText(media.coverImage),
      description: optionalText(media.description),
    }
  }

  if (media.mediaType === 'game') {
    return {
      ...common,
      releaseDate: optionalText(media.releaseDate),
      releaseYear: optionalText(media.releaseYear),
      coverImage: optionalText(media.coverImage),
      platforms: Array.isArray(media.platforms)
        ? media.platforms
            .filter((platform) => typeof platform === 'string')
            .map((platform) => platform.trim())
            .filter(Boolean)
        : [],
    }
  }

  const movie = media.mediaType === 'movie'
  return {
    ...common,
    originalTitle: optionalText(media.originalTitle),
    ...(movie
      ? { releaseDate: optionalText(media.releaseDate), releaseYear: optionalText(media.releaseYear) }
      : { firstAirDate: optionalText(media.firstAirDate), firstAirYear: optionalText(media.firstAirYear) }),
    posterImage: optionalText(media.posterImage),
    backdropImage: optionalText(media.backdropImage),
    description: optionalText(media.description),
    originalLanguage: optionalText(media.originalLanguage),
  }
}

function normalizeLibraryItem(item, version) {
  const originalMedia = item?.media
  // Versie 1 bevatte alleen boeken en kon het mediatype weglaten.
  const media = normalizeMedia(version === 1 ? { ...originalMedia, mediaType: 'book' } : originalMedia)
  const mediaKey = getMediaKey(media)
  const expectedStoredKey = version === 1
    ? `${media?.source}:${media?.sourceId}`
    : mediaKey

  if (!media || item?.userMedia?.mediaKey !== expectedStoredKey) return null

  return {
    media,
    userMedia: {
      mediaKey,
      status: isValidStatus(media.mediaType, item.userMedia.status)
        ? item.userMedia.status
        : getDefaultStatus(media.mediaType),
      rating: PERSONAL_RATINGS.includes(item.userMedia.rating) ? item.userMedia.rating : null,
      addedAt: typeof item.userMedia.addedAt === 'string'
        ? item.userMedia.addedAt
        : new Date(0).toISOString(),
    },
  }
}

function parseLibrary(rawLibrary) {
  if (!rawLibrary) return null

  try {
    const stored = JSON.parse(rawLibrary)
    if (!stored || ![1, SCHEMA_VERSION].includes(stored.version) || !Array.isArray(stored.items)) {
      return null
    }

    const seen = new Set()
    const items = []
    for (const storedItem of stored.items) {
      const item = normalizeLibraryItem(storedItem, stored.version)
      if (item && !seen.has(item.userMedia.mediaKey)) {
        seen.add(item.userMedia.mediaKey)
        items.push(item)
      }
    }
    return { items, version: stored.version }
  } catch {
    return null
  }
}

export function readLegacyLibrary() {
  const storage = getStorage()
  if (!storage) return []

  try {
    const current = parseLibrary(storage.getItem(STORAGE_KEY))
    if (current) return current.items

    const legacy = parseLibrary(storage.getItem(LEGACY_STORAGE_KEY))
    return legacy?.items ?? []
  } catch {
    return []
  }
}
