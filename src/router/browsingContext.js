import { computed, nextTick, onScopeDispose, shallowRef, watch } from 'vue'
import { currentUser } from '../composables/authState.js'

const positions = new Map()
const readiness = new Map()
const POSITION_LIMIT = 20
let scrollVersion = 0

export const discoverReturnLocation = shallowRef({ path: '/discover' })
const detailOrigin = shallowRef(null)
const isList = path => /^\/lists\/[1-9][0-9]{0,19}$/.test(path || '')
const isBrowsing = path => ['/discover', '/library'].includes(path) || isList(path)
const readinessKey = path => isList(path) ? '/lists' : path

export function rememberDetailOrigin(to, from) {
  if (to.name !== 'media-detail') return
  if (from.name === 'media-detail' && detailOrigin.value?.detailPath === from.fullPath) {
    detailOrigin.value = { ...detailOrigin.value, detailPath: to.fullPath }
    return
  }
  const privateOrigin = from.path === '/library' || isList(from.path)
  detailOrigin.value = isBrowsing(from.path) && (!privateOrigin || currentUser.value) ? {
    detailPath: to.fullPath,
    location: { path: from.path, query: { ...from.query }, hash: from.hash },
    label: from.path === '/discover' ? 'Back to Discover' : from.path === '/library' ? 'Back to Library' : 'Back to List',
    accountId: privateOrigin ? currentUser.value.id : null,
  } : null
}

export function useDetailBack(route) {
  return computed(() => {
    const origin = detailOrigin.value
    if (origin?.detailPath === route.fullPath && (!origin.accountId || origin.accountId === currentUser.value?.id)) return origin
    // Directe URL's en herladen pagina's gebruiken nooit willekeurige browsergeschiedenis.
    return { location: { path: '/discover' }, label: 'Back to Discover' }
  })
}

watch(() => currentUser.value?.id, () => {
  if (detailOrigin.value?.accountId) detailOrigin.value = null
  clearBrowsingPositions('/lists')
}, { flush: 'sync' })

export function rememberBrowsingPosition(route, position) {
  scrollVersion++
  if (!isBrowsing(route.path)) return
  positions.delete(route.fullPath)
  positions.set(route.fullPath, position)
  while (positions.size > POSITION_LIMIT) positions.delete(positions.keys().next().value)
}

export function clearBrowsingPositions(path) {
  scrollVersion++
  for (const key of positions.keys()) {
    if (key.split(/[?#]/)[0] === path || path === '/lists' && isList(key.split(/[?#]/)[0])) positions.delete(key)
  }
}

export function useBrowsingReady(path, ready) {
  const entry = { promise: Promise.resolve() }
  let finish = null
  // Discover en de afzonderlijke catalogus houden elk hun eigen gereedheidsstatus.
  const entries = readiness.get(path) || new Set()
  entries.add(entry)
  readiness.set(path, entries)
  watch(ready, (value) => {
    if (!value && !finish) entry.promise = new Promise((resolve) => { finish = resolve })
    if (value && finish) {
      finish()
      finish = null
    }
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    finish?.()
    entries.delete(entry)
    if (entries.size === 0 && readiness.get(path) === entries) readiness.delete(path)
  })
}

export function browsingScrollBehavior(to, from, savedPosition) {
  const version = ++scrollVersion
  const isBrowsingPage = isBrowsing(to.path)
  const position = savedPosition || (from.name === 'media-detail' && positions.get(to.fullPath))
  if (!position) return { left: 0, top: 0 }
  if (!isBrowsingPage) return position

  // Wacht tot het raster bestaat, anders begrenst de browser de oude scrollpositie te vroeg.
  return (async () => {
    await nextTick()
    await Promise.all([...readiness.get(readinessKey(to.path)) || []].map(entry => entry.promise))
    await nextTick()
    return version === scrollVersion ? position : false
  })()
}
