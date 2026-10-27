import { request } from './apiClient.js'

const base = '/api/v1/lists'
const listPath = (id) => `${base}/${encodeURIComponent(id)}`

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
