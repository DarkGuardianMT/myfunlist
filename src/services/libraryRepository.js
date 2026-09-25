const STORAGE_KEY = 'myfunlist_library'
const LEGACY_STORAGE_KEY = 'trackora_library'
const SCHEMA_VERSION = 1
const DEFAULT_STATUS = 'want-to-read'

export const BOOK_STATUSES = ['want-to-read', 'reading', 'finished']
export const BOOK_RATINGS = Array.from({ length: 20 }, (_, index) => (index + 1) / 2)

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

  return source && sourceId ? `${source}:${sourceId}` : null
}

function normalizeMedia(media) {
  const mediaKey = getMediaKey(media)

  if (!mediaKey) {
    return null
  }

  return {
    source: media.source,
    sourceId: media.sourceId,
    mediaType: media.mediaType || 'book',
    title:
      typeof media.title === 'string' && media.title.trim()
        ? media.title.trim()
        : 'Untitled book',
    authors: Array.isArray(media.authors)
      ? media.authors
          .filter((author) => typeof author === 'string')
          .map((author) => author.trim())
          .filter(Boolean)
      : [],
    publishedDate: typeof media.publishedDate === 'string' ? media.publishedDate : null,
    publishedYear: typeof media.publishedYear === 'string' ? media.publishedYear : null,
    coverImage: typeof media.coverImage === 'string' ? media.coverImage : null,
    description: typeof media.description === 'string' ? media.description : null,
  }
}

function normalizeLibraryItem(item) {
  const media = normalizeMedia(item?.media)
  const mediaKey = getMediaKey(media)

  if (!media || item?.userMedia?.mediaKey !== mediaKey) {
    return null
  }

  return {
    media,
    userMedia: {
      mediaKey,
      status: BOOK_STATUSES.includes(item.userMedia.status)
        ? item.userMedia.status
        : DEFAULT_STATUS,
      rating: BOOK_RATINGS.includes(item.userMedia.rating) ? item.userMedia.rating : null,
      addedAt:
        typeof item.userMedia.addedAt === 'string'
          ? item.userMedia.addedAt
          : new Date(0).toISOString(),
    },
  }
}

function parseLibrary(rawLibrary) {
  if (!rawLibrary) {
    return null
  }

  try {
    const storedLibrary = JSON.parse(rawLibrary)

    if (
      !storedLibrary ||
      typeof storedLibrary !== 'object' ||
      storedLibrary.version !== SCHEMA_VERSION ||
      !Array.isArray(storedLibrary.items)
    ) {
      return null
    }

    const seenMediaKeys = new Set()

    return storedLibrary.items.reduce((items, storedItem) => {
      const item = normalizeLibraryItem(storedItem)

      if (!item || seenMediaKeys.has(item.userMedia.mediaKey)) {
        return items
      }

      seenMediaKeys.add(item.userMedia.mediaKey)
      items.push(item)
      return items
    }, [])
  } catch {
    return null
  }
}

function readLibrary() {
  const storage = getStorage()

  if (!storage) {
    return []
  }

  try {
    const currentLibrary = parseLibrary(storage.getItem(STORAGE_KEY))

    if (currentLibrary !== null) {
      return currentLibrary
    }

    const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY)
    const legacyLibrary = parseLibrary(legacyRaw)

    if (legacyLibrary === null) {
      return []
    }

    try {
      // Bewaar de oude data ongewijzigd en verwijder de oude sleutel pas na een geslaagde kopie.
      storage.setItem(STORAGE_KEY, legacyRaw)
      storage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // De oude data blijft beschikbaar als opslag niet kan worden bijgewerkt.
    }

    return legacyLibrary
  } catch {
    return []
  }
}

function writeLibrary(items) {
  const storage = getStorage()

  if (!storage) {
    throw new Error('Library storage is unavailable')
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: SCHEMA_VERSION,
      items,
    }),
  )
}

export async function getLibrary() {
  return readLibrary()
}

export async function hasItem(media) {
  const mediaKey = typeof media === 'string' ? media : getMediaKey(media)

  return Boolean(mediaKey && readLibrary().some((item) => item.userMedia.mediaKey === mediaKey))
}

export async function addItem(media) {
  const normalizedMedia = normalizeMedia(media)
  const mediaKey = getMediaKey(normalizedMedia)

  if (!normalizedMedia || !mediaKey) {
    throw new Error('A stable media source and source ID are required')
  }

  const items = readLibrary()
  const existingItem = items.find((item) => item.userMedia.mediaKey === mediaKey)

  if (existingItem) {
    return { added: false, item: existingItem }
  }

  const item = {
    media: normalizedMedia,
    userMedia: {
      mediaKey,
      status: DEFAULT_STATUS,
      rating: null,
      addedAt: new Date().toISOString(),
    },
  }

  writeLibrary([...items, item])
  return { added: true, item }
}

export async function updateStatus(mediaKey, status) {
  if (!BOOK_STATUSES.includes(status)) {
    throw new Error('Invalid book status')
  }

  const items = readLibrary()
  const itemIndex = items.findIndex((item) => item.userMedia.mediaKey === mediaKey)

  if (itemIndex === -1) {
    return null
  }

  const updatedItem = {
    ...items[itemIndex],
    userMedia: {
      ...items[itemIndex].userMedia,
      status,
    },
  }

  items[itemIndex] = updatedItem
  writeLibrary(items)
  return updatedItem
}

export async function updateRating(mediaKey, rating) {
  if (rating !== null && !BOOK_RATINGS.includes(rating)) {
    throw new Error('Invalid book rating')
  }

  const items = readLibrary()
  const itemIndex = items.findIndex((item) => item.userMedia.mediaKey === mediaKey)

  if (itemIndex === -1) {
    return null
  }

  const updatedItem = {
    ...items[itemIndex],
    userMedia: {
      ...items[itemIndex].userMedia,
      rating,
    },
  }

  items[itemIndex] = updatedItem
  writeLibrary(items)
  return updatedItem
}

export async function removeItem(mediaKey) {
  const items = readLibrary()
  const remainingItems = items.filter((item) => item.userMedia.mediaKey !== mediaKey)

  if (remainingItems.length === items.length) {
    return false
  }

  writeLibrary(remainingItems)
  return true
}
