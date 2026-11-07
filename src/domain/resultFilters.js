const clean = value => typeof value === 'string' && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : ''
const year = value => /^\d{4}$/.test(String(value ?? '')) ? String(value) : 'unknown'
const language = value => /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(clean(value)) ? clean(value).toLowerCase() : 'unknown'
const platforms = item => Array.isArray(item.platforms) ? [...new Set(item.platforms.map(clean).filter(Boolean))] : []
export const RESULT_FILTER_PARAMS = { year: 'resultYear', language: 'resultLanguage', platform: 'resultPlatform' }

export function normalizeResultFilters(type, query = {}) {
  if (!['movie', 'tv', 'game'].includes(type)) return { year: 'any', language: 'any', platform: 'any' }
  const selectedYear = clean(query.resultYear)
  const selectedLanguage = clean(query.resultLanguage)
  return {
    year: /^(?:\d{4}|unknown)$/.test(selectedYear) ? selectedYear : 'any',
    language: type !== 'game' && (selectedLanguage === 'unknown' || language(selectedLanguage) !== 'unknown') ? language(selectedLanguage) : 'any',
    platform: type === 'game' ? clean(query.resultPlatform) || 'any' : 'any',
  }
}

export function resultFilterOptions(type, items) {
  return {
    years: [...new Set(items.map(item => year(type === 'tv' ? item.firstAirYear : item.releaseYear)))].sort((a, b) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a)),
    languages: [...new Set(items.map(item => language(item.originalLanguage)))].sort(),
    platforms: [...new Set(items.flatMap(item => platforms(item).length ? platforms(item) : ['unknown']))].sort((a, b) => a.localeCompare(b)),
  }
}

export function filterDiscoveryResults(type, items, filters) {
  if (type === 'book') return items
  return items.filter(item => (filters.year === 'any' || filters.year === year(type === 'tv' ? item.firstAirYear : item.releaseYear))
    && (type === 'game' || filters.language === 'any' || filters.language === language(item.originalLanguage))
    && (type !== 'game' || filters.platform === 'any' || (filters.platform === 'unknown' ? platforms(item).length === 0 : platforms(item).includes(filters.platform))))
}

export function resultLanguageLabel(value) {
  return ({ en: 'English', nl: 'Dutch', tr: 'Turkish', fr: 'French', de: 'German', ja: 'Japanese', ko: 'Korean', es: 'Spanish', unknown: 'Not supplied' })[value] || value.toUpperCase()
}
