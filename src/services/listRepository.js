import { request } from './apiClient.js'

const base = '/api/v1/lists'
const listPath = (id) => `${base}/${encodeURIComponent(id)}`

const validId = (id) => typeof id === 'string' && /^[1-9][0-9]{0,19}$/.test(id)
const validPair = (pair) => pair && validId(pair.listId) && validId(pair.userMediaId)
const follows = (pair, previous) => !previous || BigInt(pair.listId) > BigInt(previous.listId)
  || (pair.listId === previous.listId && BigInt(pair.userMediaId) > BigInt(previous.userMediaId))

export async function getMembershipPage(after = null) {
  const query = after ? `?${new URLSearchParams({ afterListId: after.listId, afterEntryId: after.userMediaId })}` : ''
  const page = await request(`${base}/memberships${query}`, { timeoutMs: 11000 })
  if (!Array.isArray(page?.memberships) || page.memberships.length > 500
    || !(page.nextCursor === null || validPair(page.nextCursor))) throw new Error('Invalid membership response')
  let previous = after
  for (const pair of page.memberships) {
    if (!validPair(pair) || !follows(pair, previous)) throw new Error('Invalid membership response')
    previous = pair
  }
  if (page.nextCursor !== null && (page.memberships.length !== 500
    || page.nextCursor.listId !== previous.listId || page.nextCursor.userMediaId !== previous.userMediaId)) {
    throw new Error('Invalid membership response')
  }
  return page
}

export async function getLists() {
  const lists = await request(base)
  if (!Array.isArray(lists)) throw new Error('Invalid Lists response')
  return lists
}

export async function getList(id) {
  const detail = await request(listPath(id))
  if (!detail?.list || !Array.isArray(detail.items)) throw new Error('Invalid List response')
  return detail
}

export function createList(title, description) {
  return request(base, { method: 'POST', body: { title, description } })
}

export function updateList(id, changes) {
  return request(listPath(id), { method: 'PATCH', body: changes })
}

export function deleteList(id) {
  return request(listPath(id), { method: 'DELETE' })
}

export function addListItem(id, userMediaId, { isCurrent } = {}) {
  return request(`${listPath(id)}/items`, { method: 'POST', body: { userMediaId }, isCurrent })
}

export function removeListItem(id, userMediaId) {
  return request(`${listPath(id)}/items/${encodeURIComponent(userMediaId)}`, { method: 'DELETE' })
}
