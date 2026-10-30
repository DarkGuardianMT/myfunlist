import { readonly, ref } from 'vue'
import { currentUser } from './authState.js'
import {
  addListItem, createList, deleteList, getList, getLists, getMembershipPage, removeListItem, updateList,
} from '../services/listRepository.js'

const lists = ref([])
const isListsLoaded = ref(false)
const isListsLoading = ref(false)
const listsError = ref('')
const selectedList = ref(null)
const selectedItems = ref([])
const isDetailLoaded = ref(false)
const isDetailLoading = ref(false)
const detailError = ref('')
const memberships = ref(new Map())
const isMembershipsLoaded = ref(false)
let membershipsPromise = null
let membershipRevision = 0
let pendingAdds = new Map()
let summariesPromise = null
let generation = 0
let listsRequest = 0
let detailRequest = 0
let loadedId = null

export function resetLists() {
  generation++
  listsRequest++
  detailRequest++
  lists.value = []
  isListsLoaded.value = false
  isListsLoading.value = false
  listsError.value = ''
  selectedList.value = null
  selectedItems.value = []
  isDetailLoaded.value = false
  isDetailLoading.value = false
  detailError.value = ''
  loadedId = null
  memberships.value = new Map()
  isMembershipsLoaded.value = false
  membershipsPromise = null
  membershipRevision++
  pendingAdds = new Map()
  summariesPromise = null
}

export function invalidateListMemberships() {
  // Library-verwijdering wijzigt aantallen en lidmaatschappen; oude requests mogen die cache niet herstellen.
  resetLists()
}

function invalidateListCache(id) {
  // Titels blijven bruikbaar in een open selector; aantallen en tijdstempels worden bij de volgende laadactie vernieuwd.
  listsRequest++
  isListsLoaded.value = false
  isListsLoading.value = false
  listsError.value = ''
  summariesPromise = null
  if (loadedId === id) {
    detailRequest++
    loadedId = null
    selectedList.value = null
    selectedItems.value = []
    isDetailLoaded.value = false
    isDetailLoading.value = false
    detailError.value = ''
  }
}

function guardAccount() {
  if (!currentUser.value) throw new Error('Please log in to use Custom Lists.')
  return generation
}

function loadLists(force = false) {
  if (!currentUser.value) return Promise.resolve([])
  if (isListsLoaded.value && !force) return Promise.resolve(lists.value)
  if (summariesPromise) return summariesPromise
  const pending = fetchLists().finally(() => {
    if (summariesPromise === pending) summariesPromise = null
  })
  summariesPromise = pending
  return pending
}

function loadMemberships() {
  if (!currentUser.value) return Promise.resolve()
  if (isMembershipsLoaded.value) return Promise.resolve()
  if (membershipsPromise) return membershipsPromise
  const requestGeneration = generation
  const accountId = currentUser.value.id
  const isCurrent = () => generation === requestGeneration && currentUser.value?.id === accountId
  const pending = (async () => {
    // Een gelijktijdige lokale wijziging maakt een gedeeltelijke momentopname ongeldig.
    for (let attempt = 0; attempt < 3; attempt++) {
      const revision = membershipRevision
      const result = new Map()
      let after = null
      do {
        const page = await getMembershipPage(after)
        if (!isCurrent()) return
        if (revision !== membershipRevision) break
        for (const { listId, userMediaId } of page.memberships) {
          if (!result.has(listId)) result.set(listId, new Set())
          result.get(listId).add(userMediaId)
        }
        after = page.nextCursor
      } while (after)
      if (revision !== membershipRevision) continue
      memberships.value = result
      isMembershipsLoaded.value = true
      return
    }
    throw new Error('List memberships changed while loading. Please try again.')
  })().finally(() => {
    if (membershipsPromise === pending) membershipsPromise = null
  })
  membershipsPromise = pending
  return pending
}

async function fetchLists() {
  const requestGeneration = generation
  const requestId = ++listsRequest
  isListsLoading.value = true
  listsError.value = ''
  try {
    const result = await getLists()
    if (generation === requestGeneration && listsRequest === requestId) {
      lists.value = result
      isListsLoaded.value = true
    }
    return result
  } catch (error) {
    if (generation === requestGeneration && listsRequest === requestId) listsError.value = error.message
    throw error
  } finally {
    if (generation === requestGeneration && listsRequest === requestId) isListsLoading.value = false
  }
}

async function loadList(id, force = false) {
  if (!currentUser.value) return null
  if (isDetailLoaded.value && loadedId === id && !force) {
    return { list: selectedList.value, items: selectedItems.value }
  }
  const requestGeneration = generation
  const revision = membershipRevision
  const requestId = ++detailRequest
  loadedId = id
  selectedList.value = null
  selectedItems.value = []
  isDetailLoaded.value = false
  isDetailLoading.value = true
  detailError.value = ''
  try {
    const detail = await getList(id)
    if (generation === requestGeneration && detailRequest === requestId) {
      selectedList.value = detail.list
      selectedItems.value = detail.items
      if (revision === membershipRevision) memberships.value.set(id, new Set(detail.items.map((item) => item.userMedia.id)))
      isDetailLoaded.value = true
      lists.value = lists.value.map((list) => list.id === id ? detail.list : list)
    }
    return detail
  } catch (error) {
    if (generation === requestGeneration && detailRequest === requestId) detailError.value = error.message
    throw error
  } finally {
    if (generation === requestGeneration && detailRequest === requestId) isDetailLoading.value = false
  }
}

export function useLists() {
  function isListMember(id, userMediaId) {
    return memberships.value.get(id)?.has(userMediaId) ?? false
  }

  async function createCustomList(title, description) {
    const requestGeneration = guardAccount()
    const created = await createList(title, description)
    if (generation === requestGeneration) {
      lists.value = [created, ...lists.value]
      membershipRevision++
      isListsLoaded.value = true
      listsError.value = ''
    }
    return created
  }

  async function updateCustomList(id, changes) {
    const requestGeneration = guardAccount()
    const updated = await updateList(id, changes)
    if (generation === requestGeneration) {
      lists.value = lists.value.map((list) => list.id === id ? updated : list)
      if (selectedList.value?.id === id) selectedList.value = updated
    }
    return updated
  }

  async function deleteCustomList(id) {
    const requestGeneration = guardAccount()
    await deleteList(id)
    if (generation === requestGeneration) {
      lists.value = lists.value.filter((list) => list.id !== id)
      membershipRevision++
      memberships.value.delete(id)
      if (selectedList.value?.id === id) {
        selectedList.value = null
        selectedItems.value = []
        isDetailLoaded.value = false
        loadedId = null
      }
    }
  }

  function addToList(id, userMediaId, options = {}) {
    const key = JSON.stringify([id, userMediaId])
    if (pendingAdds.has(key)) return pendingAdds.get(key)
    const pending = performAdd(id, userMediaId, options).finally(() => {
      if (pendingAdds.get(key) === pending) pendingAdds.delete(key)
    })
    pendingAdds.set(key, pending)
    return pending
  }

  async function performAdd(id, userMediaId, { refreshDetail = true, isCurrent = () => true, requireMemberships = false } = {}) {
    const requestGeneration = guardAccount()
    if (requireMemberships && !isMembershipsLoaded.value) throw new Error('Load list memberships before adding.')
    if (isListMember(id, userMediaId)) return { added: false }
    try {
      const result = await addListItem(id, userMediaId, {
        isCurrent: () => generation === requestGeneration && isCurrent()
          && (!requireMemberships || isMembershipsLoaded.value) && !isListMember(id, userMediaId),
      })
      if (generation === requestGeneration) {
        if (typeof result?.added !== 'boolean') throw new Error('Invalid membership response')
        membershipRevision++
        if (!memberships.value.has(id)) memberships.value.set(id, new Set())
        memberships.value.get(id).add(userMediaId)
        if (refreshDetail) await loadList(id, true)
        else invalidateListCache(id)
      }
      return result
    } catch (error) {
      if (!refreshDetail && generation === requestGeneration && error.code === 'list_not_found') invalidateListCache(id)
      throw error
    }
  }

  async function removeFromList(id, userMediaId) {
    const requestGeneration = guardAccount()
    await removeListItem(id, userMediaId)
    if (generation === requestGeneration) {
      membershipRevision++
      memberships.value.get(id)?.delete(userMediaId)
      await loadList(id, true)
    }
  }

  return {
    lists: readonly(lists), isListsLoaded: readonly(isListsLoaded),
    isListsLoading: readonly(isListsLoading), listsError: readonly(listsError),
    selectedList: readonly(selectedList), selectedItems: readonly(selectedItems),
    isDetailLoaded: readonly(isDetailLoaded), isDetailLoading: readonly(isDetailLoading),
    detailError: readonly(detailError),
    loadLists, loadList, createCustomList, updateCustomList, deleteCustomList,
    addToList, removeFromList, isListMember, loadMemberships, isMembershipsLoaded: readonly(isMembershipsLoaded),
  }
}
