export const MEDIA_TYPES = ['book', 'movie', 'tv', 'game']

const STATUS_OPTIONS = {
  book: [
    { value: 'want-to-read', label: 'Want to read' },
    { value: 'reading', label: 'Reading' },
    { value: 'finished', label: 'Finished' },
  ],
  movie: [
    { value: 'want-to-watch', label: 'Want to watch' },
    { value: 'watched', label: 'Watched' },
  ],
  tv: [
    { value: 'want-to-watch', label: 'Want to watch' },
    { value: 'watching', label: 'Watching' },
    { value: 'completed', label: 'Completed' },
  ],
  game: [
    { value: 'want-to-play', label: 'Want to Play' },
    { value: 'playing', label: 'Playing' },
    { value: 'completed', label: 'Completed' },
    { value: 'dropped', label: 'Dropped' },
  ],
}

export const PERSONAL_RATINGS = Array.from({ length: 20 }, (_, index) => (index + 1) / 2)

export function getStatusOptions(mediaType) {
  return STATUS_OPTIONS[mediaType] || []
}

export function getDefaultStatus(mediaType) {
  return getStatusOptions(mediaType)[0]?.value || null
}

export function isValidStatus(mediaType, status) {
  return getStatusOptions(mediaType).some((option) => option.value === status)
}
