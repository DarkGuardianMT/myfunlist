import { getMediaKey } from '../domain/mediaIdentity.js'
import { boardSummary, catalogueCard, compareIds, decodeBoard, isBoardId, isIdempotencyKey, isRevision, mediaIdentity } from '../domain/tierLists.js'
import { ApiError, request } from './apiClient.js'

const root = '/api/v1/tier-lists'
const invalid = () => new ApiError('Tier Lists returned an invalid response.', 0, 'invalid_response')
const path = id => {
  if (!isBoardId(id)) throw new Error('Invalid tier list ID.')
  return `${root}/${id}`
}

export function tierListRepository(requestImpl = request) {
  const send = (url, options) => requestImpl(url, { timeoutMs: 12000, ...options })
  const board = async (url, options, id) => {
    const value = decodeBoard(await send(url, options))
    if (!value || (id !== undefined && value.id !== id)) throw invalid()
    return value
  }
  return {
    async list(cursor, isCurrent) {
      if (cursor != null && !isBoardId(cursor)) throw new Error('Invalid tier list cursor.')
      const page = await send(cursor == null ? root : `${root}?beforeId=${cursor}`, { isCurrent })
      if (!Array.isArray(page?.boards) || page.boards.length > 50
        || (page.nextCursor !== null && !isBoardId(page.nextCursor))) throw invalid()
      let previous = cursor
      const boards = page.boards.map(row => {
        const summary = boardSummary(row)
        if (!summary || (previous != null && compareIds(previous, summary.id) <= 0)
          || !Number.isInteger(row.itemCount) || row.itemCount < 0 || row.itemCount > 100) throw invalid()
        previous = summary.id
        return { ...summary, itemCount: row.itemCount }
      })
      if (page.nextCursor !== null && page.nextCursor !== boards.at(-1)?.id) throw invalid()
      return { boards, nextCursor: page.nextCursor }
    },
    create(body, idempotencyKey, isCurrent) {
      if (!isIdempotencyKey(idempotencyKey)) throw new Error('Invalid creation key.')
      return board(root, { method: 'POST', body, idempotencyKey, isCurrent })
    },
    get(id, isCurrent) {
      return board(path(id), { isCurrent }, id)
    },
    save(id, body, isCurrent) {
      if (!isRevision(body.revision)) throw new Error('Invalid board revision.')
      return board(path(id), { method: 'PUT', body, isCurrent }, id)
    },
    async remove(id, revision, isCurrent) {
      if (!isRevision(revision)) throw new Error('Invalid board revision.')
      if (await send(path(id), { method: 'DELETE', body: { revision }, isCurrent }) !== null) throw invalid()
    },
    async prepare(id, item, isCurrent) {
      const identity = mediaIdentity(item)
      const card = catalogueCard(await send(`${path(id)}/media/prepare`, { method: 'POST', body: identity, isCurrent }))
      if (!card || getMediaKey(card) !== getMediaKey(identity)) throw invalid()
      return card
    },
  }
}

export const tierListApi = tierListRepository()
