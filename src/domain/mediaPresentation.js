export const MEDIA_CATEGORIES = [
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'game', label: 'Games' },
  { id: 'book', label: 'Books' },
]

export function orderMediaCategories(categories) {
  return [...categories].sort((first, second) =>
    MEDIA_CATEGORIES.findIndex(type => type.id === first.id) - MEDIA_CATEGORIES.findIndex(type => type.id === second.id))
}
