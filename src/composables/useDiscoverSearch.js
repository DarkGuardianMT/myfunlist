import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resolveBookProvider } from '../domain/bookProviders.js'
import { MEDIA_TYPES } from '../domain/libraryMedia.js'
import { resolveDiscoverType } from '../domain/discoverRoute.js'
import { normalizeBookSearchOptions } from '../domain/bookSearch.js'
import { filterDiscoveryResults, normalizeResultFilters, resultFilterOptions, RESULT_FILTER_PARAMS } from '../domain/resultFilters.js'
import { discoverReturnLocation, useBrowsingReady } from '../router/browsingContext.js'
import { getGoogleBooksErrorMessage, searchBooks } from '../services/googleBooks.js'
import {
  getRawgErrorMessage, getTmdbErrorMessage, searchGames, searchMovies, searchTvShows,
} from '../services/mediaDiscovery.js'

export const DISCOVER_CACHE_TTL = 5 * 60 * 1000
export const DISCOVER_CACHE_LIMIT = 20
const cache = new Map()
const pending = new Map()
const snapshots = new Map()
const queriesByType = new Map()
let cacheVersion = 0
const searches = { book: searchBooks, movie: searchMovies, tv: searchTvShows, game: searchGames }
const messages = { book: getGoogleBooksErrorMessage, movie: getTmdbErrorMessage, tv: getTmdbErrorMessage, game: getRawgErrorMessage }

export function clearDiscoverCache() {
  cacheVersion++
  cache.clear()
  pending.clear()
  snapshots.clear()
  queriesByType.clear()
}

function routeQuery(value) {
  return typeof value === 'string' && value.length <= 200 ? value.trim() : ''
}

function location(type, query, options = {}) {
  const { field, sort, language } = normalizeBookSearchOptions(options)
  return { path: '/discover', query: { type, ...(query ? { q: query } : {}),
    ...(type === 'book' ? {
      ...(field !== 'all' ? { field } : {}),
      ...(sort !== 'relevance' ? { sort } : {}),
      ...(language !== 'any' ? { lang: language } : {}),
    } : {}),
  } }
}

function search(type, query, options, refresh = false) {
  const key = JSON.stringify([type, query, ...(type === 'book' ? [options.field, options.sort, options.language] : [])])
  if (pending.has(key)) return pending.get(key)
  // Een terugkeer herstelt ook verlopen, lege en mislukte zoekacties zonder providerverkeer.
  const previous = snapshots.get(key)
  if (!refresh && previous) {
    snapshots.delete(key)
    snapshots.set(key, previous)
    return Promise.resolve(previous)
  }
  const cached = cache.get(key)
  if (!refresh && cached && cached.expiresAt > Date.now()) {
    cache.delete(key)
    cache.set(key, cached)
    return Promise.resolve({ results: cached.results, status: cached.results.length ? 'success' : 'empty', errorMessage: '' })
  }
  cache.delete(key)
  const version = cacheVersion
  function remember(state) {
    if (version === cacheVersion) {
      snapshots.delete(key)
      snapshots.set(key, state)
      while (snapshots.size > DISCOVER_CACHE_LIMIT) snapshots.delete(snapshots.keys().next().value)
    }
    return state
  }
  const request = searches[type](query, type === 'book' ? options : undefined).then((results) => {
    if (version !== cacheVersion) return { results, status: results.length ? 'success' : 'empty', errorMessage: '' }
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key)
    }
    cache.set(key, { results, expiresAt: now + DISCOVER_CACHE_TTL })
    while (cache.size > DISCOVER_CACHE_LIMIT) cache.delete(cache.keys().next().value)
    return remember({ results, status: results.length ? 'success' : 'empty', errorMessage: '' })
  }).catch(error => remember({ results: [], status: 'error', errorMessage: messages[type](error) }))
    .finally(() => { if (pending.get(key) === request) pending.delete(key) })
  pending.set(key, request)
  return request
}

export function useDiscoverSearch() {
  const route = useRoute()
  const router = useRouter()
  const activeMediaType = computed(() => resolveDiscoverType(route.query))
  const bookProvider = computed(() => resolveBookProvider(route.query.provider))
  const bookFilters = computed(() => normalizeBookSearchOptions({
    field: route.query.field, sort: route.query.sort, language: route.query.lang,
  }))
  const bookFilterAdvice = computed(() => {
    if (activeMediaType.value !== 'book') return ''
    const suggestions = []
    if (bookFilters.value.field !== 'all') suggestions.push('All fields')
    if (bookFilters.value.language !== 'any') suggestions.push('Any language')
    return suggestions.length ? `Try ${suggestions.join(' or ')} to broaden your search.` : ''
  })
  const activeSearch = ref({ query: '', searchedQuery: '', results: [], status: 'idle', errorMessage: '', languageSummary: null })
  const resultFilters = computed(() => normalizeResultFilters(activeMediaType.value, route.query))
  const visibleResults = computed(() => filterDiscoveryResults(activeMediaType.value, activeSearch.value.results, resultFilters.value))
  const resultOptions = computed(() => resultFilterOptions(activeMediaType.value, activeSearch.value.results))
  const hasResultFilters = computed(() => Object.values(resultFilters.value).some(value => value !== 'any'))
  const drafts = new Map()
  const activeQuery = computed({
    get: () => activeSearch.value.query,
    set: (value) => {
      activeSearch.value.query = value
      drafts.set(activeMediaType.value, { submittedQuery: activeSearch.value.searchedQuery, query: value })
    },
  })
  let generation = 0
  let refreshLocation = null

  function rememberContext() {
    const type = activeMediaType.value
    const query = routeQuery(route.query.q)
    const options = bookFilters.value
    const context = location(type, query, options)
    if (type === 'book' && (bookProvider.value === 'open-library' || route.query.provider)) {
      context.query.provider = bookProvider.value
      if (bookProvider.value === 'open-library') {
        delete context.query.sort
        if (route.query.field === 'isbn') context.query.field = 'isbn'
        if (route.query.mode === 'strict') context.query.mode = 'strict'
      }
    }
    if (type !== 'book') {
      for (const [name, param] of Object.entries(RESULT_FILTER_PARAMS)) {
        if (resultFilters.value[name] !== 'any') context.query[param] = resultFilters.value[name]
      }
    }
    queriesByType.set(type, context)
    discoverReturnLocation.value = context
  }

  async function load(refresh = false) {
    const version = ++generation
    if (route.path !== '/discover') return
    const type = activeMediaType.value
    const query = routeQuery(route.query.q)
    const options = bookFilters.value
    if (type === 'book' && route.query.type !== 'book') {
      return router.replace({ path: '/discover', query: { ...route.query, type: 'book' }, hash: route.hash })
    }
    rememberContext()
    const draft = drafts.get(type)
    const input = draft?.submittedQuery === query ? draft.query : query
    activeSearch.value = { query: input, searchedQuery: query, results: [], status: query ? 'loading' : 'idle', errorMessage: '', languageSummary: null }
    if (type === 'book' && bookProvider.value === 'open-library') { activeSearch.value.status = 'idle'; return }
    if (!query) return
    try {
      const state = await search(type, query, options, refresh)
      if (version !== generation) return
      Object.assign(activeSearch.value, state)
    } catch (error) {
      if (version !== generation) return
      activeSearch.value.status = 'error'
      activeSearch.value.errorMessage = messages[type](error)
    }
  }

  // Lokale resultaatfilters mogen ook na het verlopen van de cache geen zoekactie starten.
  watch([() => route.path, () => route.query.type, () => route.query.q,
    ...['provider', 'field', 'sort', 'lang', 'mode'].map(name => () => activeMediaType.value === 'book' ? route.query[name] : undefined),
  ], () => {
    const refresh = refreshLocation === route.fullPath
    refreshLocation = null
    load(refresh)
  }, { immediate: true })
  watch(() => [route.query.resultYear, route.query.resultLanguage, route.query.resultPlatform], () => {
    if (route.path === '/discover') rememberContext()
  })
  onScopeDispose(() => { generation++ })
  useBrowsingReady('/discover', computed(() => activeSearch.value.status !== 'loading'))

  function selectMediaType(type) {
    if (type === activeMediaType.value || !MEDIA_TYPES.includes(type)) return
    return router.push(queriesByType.get(type) || location(type, ''))
  }

  function setBookFilter(name, value) {
    if (activeMediaType.value !== 'book' || !['field', 'sort', 'language'].includes(name)) return
    const target = location('book', routeQuery(route.query.q), { ...bookFilters.value, [name]: value })
    if (route.query.provider) target.query.provider = 'google-books'
    return router.push(target)
  }

  function handleSearch() {
    const query = routeQuery(activeSearch.value.query)
    if (!query || activeSearch.value.status === 'loading') return
    drafts.delete(activeMediaType.value)
    if (route.path === '/discover' && query === routeQuery(route.query.q)) return load(true)
    const target = location(activeMediaType.value, query, bookFilters.value)
    if (activeMediaType.value === 'book' && route.query.provider) target.query.provider = bookProvider.value
    refreshLocation = router.resolve(target).fullPath
    return router.push(target)
  }

  function setBookProvider(provider) {
    if (!['open-library', 'google-books'].includes(provider)) return
    return router.push({ path: '/discover', query: { type: 'book', provider, ...(routeQuery(route.query.q) ? { q: routeQuery(route.query.q) } : {}) } })
  }

  function setResultFilter(name, value) {
    const type = activeMediaType.value
    if (type === 'book' || !Object.hasOwn(RESULT_FILTER_PARAMS, name)) return
    const query = { ...route.query, [RESULT_FILTER_PARAMS[name]]: value }
    const normalized = normalizeResultFilters(type, query)
    for (const [key, param] of Object.entries(RESULT_FILTER_PARAMS)) {
      delete query[param]
      if (normalized[key] !== 'any') query[param] = normalized[key]
    }
    return router.push({ path: '/discover', query })
  }

  function clearResultFilters() {
    const query = { ...route.query }
    for (const param of Object.values(RESULT_FILTER_PARAMS)) delete query[param]
    return router.push({ path: '/discover', query })
  }

  return { bookProvider, setBookProvider, activeMediaType, activeSearch, activeQuery, bookFilters, bookFilterAdvice, setBookFilter, selectMediaType, handleSearch,
    resultFilters, resultOptions, visibleResults, hasResultFilters, setResultFilter, clearResultFilters }
}
