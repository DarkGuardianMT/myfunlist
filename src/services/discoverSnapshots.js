export const DISCOVER_SNAPSHOT_LIMIT = 20
const snapshots = new Map()
const identity = (source, key) => JSON.stringify([source, key])

export function getDiscoverSnapshot(source, key) {
  const id = identity(source, key)
  const state = snapshots.get(id)
  if (state) { snapshots.delete(id); snapshots.set(id, state) }
  return state
}

export function rememberDiscoverSnapshot(source, key, state) {
  const id = identity(source, key)
  snapshots.delete(id)
  snapshots.set(id, state)
  while (snapshots.size > DISCOVER_SNAPSHOT_LIMIT) snapshots.delete(snapshots.keys().next().value)
}

export function forgetDiscoverSnapshot(source, key) {
  snapshots.delete(identity(source, key))
}

export function clearDiscoverSnapshots(source) {
  if (source === undefined) return snapshots.clear()
  for (const key of snapshots.keys()) if (JSON.parse(key)[0] === source) snapshots.delete(key)
}
