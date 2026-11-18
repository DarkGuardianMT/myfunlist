export const openLibraryDiscoverEnabled = import.meta.env?.VITE_OPEN_LIBRARY_DISCOVER_ENABLED === 'true'

export function resolveBookProvider(value, enabled = openLibraryDiscoverEnabled) {
  if (value === 'google-books' || value === 'open-library') return value
  return enabled ? 'open-library' : 'google-books'
}
