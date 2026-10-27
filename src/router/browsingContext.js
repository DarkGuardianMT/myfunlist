import { nextTick, onScopeDispose, shallowRef, watch } from 'vue'

const positions = new Map()
const readiness = new Map()
const POSITION_LIMIT = 20
let scrollVersion = 0

export const discoverReturnLocation = shallowRef({ path: '/discover' })

export function rememberBrowsingPosition(route, position) {
  scrollVersion++
  if (!['/discover', '/library'].includes(route.path)) return
  positions.delete(route.fullPath)
  positions.set(route.fullPath, position)
  while (positions.size > POSITION_LIMIT) positions.delete(positions.keys().next().value)
}

export function clearBrowsingPositions(path) {
  scrollVersion++
  for (const key of positions.keys()) {
    if (key.split('?')[0] === path) positions.delete(key)
  }
}

export function useBrowsingReady(path, ready) {
  const entry = { promise: Promise.resolve() }
  let finish = null
  readiness.set(path, entry)
  watch(ready, (value) => {
    if (!value && !finish) entry.promise = new Promise((resolve) => { finish = resolve })
    if (value && finish) {
      finish()
      finish = null
    }
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    finish?.()
    if (readiness.get(path) === entry) readiness.delete(path)
  })
}

export function browsingScrollBehavior(to, from, savedPosition) {
  const version = ++scrollVersion
  const isBrowsingPage = ['/discover', '/library'].includes(to.path)
  const position = savedPosition || (from.name === 'media-detail' && positions.get(to.fullPath))
  if (!position) return { left: 0, top: 0 }
  if (!isBrowsingPage) return position

  // Wacht tot het raster bestaat, anders begrenst de browser de oude scrollpositie te vroeg.
  return (async () => {
    await nextTick()
    await readiness.get(to.path)?.promise
    await nextTick()
    return version === scrollVersion ? position : false
  })()
}
