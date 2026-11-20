import { MEDIA_CATEGORIES } from '../../src/domain/mediaPresentation.js'
import { getMediaKey, isSupportedMediaIdentity } from '../../src/domain/mediaIdentity.js'

export const UNRANKED = 'unranked'
export const MAX_TIERS = 12
export const PALETTE = ['Lime', 'Amber', 'Coral', 'Teal', 'Violet', 'Slate']
export const MEDIA_TYPES = MEDIA_CATEGORIES.map(({ id }) => id)

export function makeBoard(id, { title, description = '', allowedTypes = MEDIA_TYPES }) {
  const types = MEDIA_TYPES.filter(type => allowedTypes.includes(type))
  if (!title.trim() || !types.length) return null
  return {
    id,
    title: title.trim(),
    description: description.trim(),
    allowedTypes: types,
    tiers: ['S', 'A', 'B', 'C', 'D'].map((name, index) => ({
      id: name.toLowerCase(), name, color: PALETTE[index], items: [],
    })),
    unranked: [],
  }
}

export function lanes(board) {
  return [...board.tiers, { id: UNRANKED, name: 'Unranked', color: 'Slate', items: board.unranked }]
}

export function cloneBoard(board) {
  return {
    ...board,
    allowedTypes: [...board.allowedTypes],
    tiers: board.tiers.map(tier => ({ ...tier, items: [...tier.items] })),
    unranked: [...board.unranked],
  }
}

export function isDirty(draft, saved) {
  return JSON.stringify(draft) !== JSON.stringify(saved)
}

export function renameTier(board, id, name) {
  const tier = board.tiers.find(tier => tier.id === id)
  if (!tier) return false
  tier.name = name
  return true
}

export function addTier(board, id) {
  if (board.tiers.length >= MAX_TIERS || lanes(board).some(tier => tier.id === id)) return false
  board.tiers.push({ id, name: 'New tier', color: 'Slate', items: [] })
  return true
}

export function shiftTier(board, id, offset) {
  const index = board.tiers.findIndex(tier => tier.id === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= board.tiers.length) return false
  const [tier] = board.tiers.splice(index, 1)
  board.tiers.splice(target, 0, tier)
  return true
}

export function removeTier(board, id) {
  const index = board.tiers.findIndex(tier => tier.id === id)
  if (index < 0 || board.tiers.length <= 1) return false
  const [tier] = board.tiers.splice(index, 1)
  board.unranked.push(...tier.items)
  return true
}

export function addMedia(board, media) {
  if (!isSupportedMediaIdentity(media) || !board.allowedTypes.includes(media.mediaType)) return false
  const key = getMediaKey(media)
  if (lanes(board).some(tier => tier.items.some(item => getMediaKey(item) === key))) return false
  board.unranked.push(media)
  return true
}

function findItem(board, key) {
  return lanes(board).find(tier => tier.items.some(media => getMediaKey(media) === key))
}

export function moveMedia(board, key, destination, position) {
  const source = findItem(board, key)
  const target = lanes(board).find(tier => tier.id === destination)
  if (!source || !target || !Number.isInteger(position) || position < 0
    || position > target.items.length - Number(source.id === target.id)) return false
  const index = source.items.findIndex(media => getMediaKey(media) === key)
  const [media] = source.items.splice(index, 1)
  target.items.splice(position, 0, media)
  return true
}

export function removeMedia(board, key) {
  const source = findItem(board, key)
  if (!source) return false
  source.items.splice(source.items.findIndex(media => getMediaKey(media) === key), 1)
  return true
}

export async function simulateSave(board, { fail = false, delay = 450 } = {}) {
  const snapshot = cloneBoard(board)
  snapshot.title = snapshot.title.trim()
  snapshot.description = snapshot.description.trim()
  for (const tier of snapshot.tiers) tier.name = tier.name.trim()
  if (!snapshot.title || snapshot.tiers.some(tier => !tier.name)) {
    throw new Error('Enter a title and a name for each tier before saving.')
  }
  await new Promise(resolve => setTimeout(resolve, delay))
  if (fail) throw new Error('The simulated save failed. Your changes are still here.')
  return snapshot
}
