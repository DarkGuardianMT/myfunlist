import { MEDIA_TYPES } from './libraryMedia.js'

const sources = { book: 'google-books', movie: 'tmdb', tv: 'tmdb', game: 'rawg' }

export function getMediaKey(media) {
  const source = typeof media?.source === 'string' ? media.source.trim() : ''
  const sourceId = typeof media?.sourceId === 'string' ? media.sourceId.trim() : ''
  const mediaType = media?.mediaType

  return source && sourceId && MEDIA_TYPES.includes(mediaType)
    ? `${source}:${mediaType}:${sourceId}`
    : null
}

export function isSupportedMediaIdentity(media) {
  if (!media || typeof media.mediaType !== 'string' || typeof media.source !== 'string' || sources[media.mediaType] !== media.source
    || typeof media.sourceId !== 'string' || media.sourceId.trim() !== media.sourceId) return false

  return (media.source === 'google-books' ? /^[A-Za-z0-9_-]{1,191}$/ : /^[1-9][0-9]{0,19}$/).test(media.sourceId)
}

export function getMediaDetailRoute(media) {
  if (!isSupportedMediaIdentity(media)) return null
  return {
    name: 'media-detail',
    params: { mediaType: media.mediaType, source: media.source, sourceId: media.sourceId },
  }
}

export function getMediaDetailPath(media) {
  const route = getMediaDetailRoute(media)
  return route ? `/media/${route.params.mediaType}/${route.params.source}/${route.params.sourceId}` : null
}
