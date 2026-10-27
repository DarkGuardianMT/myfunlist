import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MEDIA_TYPES } from '../domain/libraryMedia.js'
import { discoverReturnLocation, useBrowsingReady } from '../router/browsingContext.js'
import { getGoogleBooksErrorMessage, searchBooks } from '../services/googleBooks.js'
import {
  getRawgErrorMessage, getTmdbErrorMessage, searchGames, searchMovies, searchTvShows,
} from '../services/mediaDiscovery.js'

export const DISCOVER_CACHE_TTL = 5 * 60 * 1000
export const DISCOVER_CACHE_LIMIT = 20
const cache = new Map()
const pending = new Map()
const queriesByType = new Map()
let cacheVersion = 0
const searches = { book: searchBooks, movie: searchMovies, tv: searchTvShows, game: searchGames }
const messages = { book: getGoogleBooksErrorMessage, movie: getTmdbErrorMessage, tv: getTmdbErrorMessage, game: getRawgErrorMessage }

export function clearDiscoverCache() {
  cacheVersion++
  cache.clear()
  pending.clear()
  queriesByType.clear()
}

function routeQuery(value) {
  return typeof value === 'string' && value.length <= 200 ? value.trim() : ''
}

function location(type, query) {
  return { path: '/discover', query: { ...(type !== 'book' ? { type } : {}), ...(query ? { q: query } : {}) } }
}

function search(type, query) {
  const key = JSON.stringify([type, query])
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key)
    cache.set(key, cached)
    return Promise.resolve(cached.results)
  }
  cache.delete(key)
  if (pending.has(key)) return pending.get(key)
  const version = cacheVersion
  const request = searches[type](query).then((results) => {
    if (version !== cacheVersion) return results
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key)
    }
    cache.set(key, { results, expiresAt: now + DISCOVER_CACHE_TTL })
    while (cache.size > DISCOVER_CACHE_LIMIT) cache.delete(cache.keys().next().value)
    return results
  }).finally(() => { if (pending.get(key) === request) pending.delete(key) })
  pending.set(key, request)
  return request
}

export function useDiscoverSearch() {
  const route = useRoute()
  const router = useRouter()
  const activeMediaType = computed(() => MEDIA_TYPES.includes(route.query.type) ? route.query.type : 'book')
  const activeSearch = ref({ query: '', searchedQuery: '', results: [], status: 'idle', errorMessage: '' })
  const drafts = new Map()
  const activeQuery = computed({
    get: () => activeSearch.value.query,
    set: (value) => {
      activeSearch.value.query = value
      drafts.set(activeMediaType.value, { submittedQuery: activeSearch.value.searchedQuery, query: value })
    },
  })
  let generation = 0

  async function load() {
    const version = ++generation
    if (route.path !== '/discover') return
    const type = activeMediaType.value
    const query = routeQuery(route.query.q)
    queriesByType.set(type, query)
    discoverReturnLocation.value = location(type, query)
    const draft = drafts.get(type)
    const input = draft?.submittedQuery === query ? draft.query : query
    activeSearch.value = { query: input, searchedQuery: query, results: [], status: query ? 'loading' : 'idle', errorMessage: '' }
    if (!query) return
    try {
      const results = await search(type, query)
      if (version !== generation) return
      activeSearch.value.results = results
      activeSearch.value.status = results.length ? 'success' : 'empty'
    } catch (error) {
      if (version !== generation) return
      activeSearch.value.status = 'error'
      activeSearch.value.errorMessage = messages[type](error)
    }
  }

  watch(() => [route.path, route.query.type, route.query.q], load, { immediate: true })
  onScopeDispose(() => { generation++ })
  useBrowsingReady('/discover', computed(() => activeSearch.value.status !== 'loading'))

  function selectMediaType(type) {
    if (type === activeMediaType.value || !MEDIA_TYPES.includes(type)) return
    return router.push(location(type, queriesByType.get(type) || ''))
  }

  function handleSearch() {
    const query = routeQuery(activeSearch.value.query)
    if (!query || activeSearch.value.status === 'loading') return
    drafts.delete(activeMediaType.value)
    if (route.path === '/discover' && query === routeQuery(route.query.q)) return load()
    return router.push(location(activeMediaType.value, query))
  }

  return { activeMediaType, activeSearch, activeQuery, selectMediaType, handleSearch }
}
