import { MEDIA_TYPES } from './libraryMedia.js'

export function resolveDiscoverType(query = {}) {
  if (MEDIA_TYPES.includes(query.type)) return query.type
  // Oude boek-URL's hadden geen type; behoud hun zoek- en cataloguscontext.
  if (query.type === undefined && ['q', 'provider', 'field', 'lang', 'sort', 'mode'].some(key => query[key] !== undefined)) return 'book'
  return 'movie'
}
