export const openLibraryDiscoverEnabled = import.meta.env?.VITE_OPEN_LIBRARY_DISCOVER_ENABLED === 'true'

export function resolveBookProvider(value) {
  if (value === 'google-books' || value === 'open-library') return value
  return 'google-books'
}
