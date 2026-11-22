import { isSupportedMediaIdentity, getMediaKey } from './mediaIdentity.js'
import { PALETTE, MAX_TIERS, lanes } from '../../prototypes/tier-lists/board.js'

export const MAX_BOARD_ITEMS = 100
export const TIER_LIST_TYPES = ['movie', 'tv', 'book', 'game']
const MAX_ID = '18446744073709551615'
const rankedKey = /^[a-z][a-z0-9_-]{0,39}$(?![\s\S])/

export const isBoardId = id => typeof id === 'string' && /^[1-9][0-9]{0,19}$(?![\s\S])/.test(id)
  && (id.length < 20 || id <= MAX_ID)
export const isRevision = revision => Number.isInteger(revision) && revision >= 1 && revision <= 4294967295
export const isIdempotencyKey = key => typeof key === 'string' && /^[A-Za-z0-9_-]{1,128}$(?![\s\S])/.test(key)
export const compareIds = (a, b) => a.length - b.length || (a > b ? 1 : a < b ? -1 : 0)
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const utc = value => typeof value === 'string' && value.endsWith('Z')
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value))

function text(value, max, multiline = false) {
  if (typeof value !== 'string') return null
  const invalid = multiline ? /[^\P{C}\r\n\t]/u : /\p{C}/u
  if (invalid.test(value)) return null
  const normalized = value.trim()
  return [...normalized].length <= max ? normalized : null
}

function types(input) {
  if (!Array.isArray(input) || !input.length || new Set(input).size !== input.length
    || input.some(type => !TIER_LIST_TYPES.includes(type))) return null
  return TIER_LIST_TYPES.filter(type => input.includes(type))
}

export function mediaIdentity(media) {
  if (!isSupportedMediaIdentity(media)) throw new Error('Choose a supported, exact media identity.')
  return { source: media.source, mediaType: media.mediaType, sourceId: media.sourceId }
}

function image(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? value : null
  } catch { return null }
}

export function catalogueCard(value) {
  if (!isSupportedMediaIdentity(value) || typeof value.title !== 'string' || !value.title.trim()
    || [...value.title].length > 512 || /\p{Cc}/u.test(value.title)
    || (value.artworkImage !== null && !image(value.artworkImage))) return null
  return { ...mediaIdentity(value), title: value.title, artworkImage: value.artworkImage }
}

export function libraryCard(media) {
  return catalogueCard({ ...media, artworkImage: image(media?.artworkImage || media?.posterImage || media?.coverImage) })
}

export function boardSettings(input) {
  const title = text(input.title, 120)
  const description = text(input.description ?? '', 1000, true)
  const allowedTypes = types(input.allowedTypes)
  if (!title || description === null || !allowedTypes) {
    throw new Error('Enter a valid title, optional description and at least one media type.')
  }
  return { title, description: description || null, allowedTypes }
}

export function boardSummary(value) {
  if (!isObject(value) || !isBoardId(value.id) || !isRevision(value.revision)
    || !utc(value.createdAt) || !utc(value.updatedAt) || !Array.isArray(value.allowedTypes)
    || (value.description !== null && typeof value.description !== 'string')) return null
  try {
    return { id: value.id, revision: value.revision, ...boardSettings(value), createdAt: value.createdAt, updatedAt: value.updatedAt }
  } catch { return null }
}

export function decodeBoard(value) {
  const summary = boardSummary(value)
  if (!summary || !Array.isArray(value.tiers) || value.tiers.length < 1 || value.tiers.length > MAX_TIERS) return null
  const keys = new Set()
  const media = new Set()
  function decodeItems(items) {
    if (!Array.isArray(items) || items.length + media.size > MAX_BOARD_ITEMS) return null
    const result = []
    for (const item of items) {
      const card = catalogueCard(item)
      const key = getMediaKey(card)
      if (!card || !summary.allowedTypes.includes(card.mediaType) || media.has(key)) return null
      media.add(key)
      result.push(card)
    }
    return result
  }
  const tiers = []
  for (const tier of value.tiers) {
    if (!isObject(tier) || typeof tier.key !== 'string' || !rankedKey.test(tier.key) || tier.key === 'unranked'
      || keys.has(tier.key) || !text(tier.name, 40) || !PALETTE.includes(tier.color)) return null
    const items = decodeItems(tier.items)
    if (!items) return null
    keys.add(tier.key)
    tiers.push({ id: tier.key, name: tier.name, color: tier.color, items })
  }
  const unranked = decodeItems(value.unranked)
  return unranked && { ...summary, tiers, unranked }
}

export function boardContent(board) {
  const settings = boardSettings(board)
  const keys = new Set()
  const identities = new Set()
  function serialize(items) {
    return items.map(media => {
      const identity = mediaIdentity(media)
      const key = getMediaKey(identity)
      if (!settings.allowedTypes.includes(identity.mediaType)) {
        throw new Error('Remove items outside the allowed media types or allow those types again.')
      }
      if (identities.has(key) || identities.size >= MAX_BOARD_ITEMS) throw new Error('Use up to 100 distinct items.')
      identities.add(key)
      return identity
    })
  }
  if (!board.tiers.length || board.tiers.length > MAX_TIERS) throw new Error('Use between 1 and 12 ranked tiers.')
  const tiers = board.tiers.map(({ id, name, color, items }) => {
    const label = text(name, 40)
    if (typeof id !== 'string' || !rankedKey.test(id) || id === 'unranked' || !label || !PALETTE.includes(color) || keys.has(id)) {
      throw new Error('Give each tier a valid name and color.')
    }
    keys.add(id)
    return { key: id, name: label, color, items: serialize(items) }
  })
  return { ...settings, tiers, unranked: serialize(board.unranked) }
}

export function boardSave(draft, saved) {
  const content = boardContent(draft)
  const placed = new Set(lanes(draft).flatMap(tier => tier.items.map(getMediaKey)))
  const kept = new Set(content.tiers.map(tier => tier.key))
  const removedItems = saved.tiers.filter(tier => !kept.has(tier.id)).flatMap(tier => tier.items)
    .filter(media => !placed.has(getMediaKey(media))).map(mediaIdentity)
  return { ...content, revision: saved.revision, ...(removedItems.length && { removedItems }) }
}

export function saveOutcome(latest, saved, submitted) {
  const { revision, removedItems, ...expected } = submitted
  const actual = JSON.stringify(boardContent(latest))
  if (latest.revision === revision + 1 && actual === JSON.stringify(expected)) return 'saved'
  if (latest.revision === revision && actual === JSON.stringify(boardContent(saved))) return 'unchanged'
  return 'conflict'
}
