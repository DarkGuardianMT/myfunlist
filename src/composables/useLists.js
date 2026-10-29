import { readonly, ref } from 'vue'
import { currentUser } from './authState.js'
import {
  addListItem, createList, deleteList, getList, getLists, removeListItem, updateList,
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
  if (summariesPromise && !force) return summariesPromise
  const pending = fetchLists().finally(() => {
    if (summariesPromise === pending) summariesPromise = null
  })
  summariesPromise = pending
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
      memberships.value.set(id, new Set(detail.items.map((item) => item.userMedia.id)))
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
      memberships.value.delete(id)
      if (selectedList.value?.id === id) {
        selectedList.value = null
        selectedItems.value = []
        isDetailLoaded.value = false
        loadedId = null
      }
    }
  }

  async function addToList(id, userMediaId, { refreshDetail = true, isCurrent = () => true } = {}) {
    const requestGeneration = guardAccount()
    if (isListMember(id, userMediaId)) return { added: false }
    try {
      const result = await addListItem(id, userMediaId, {
        isCurrent: () => generation === requestGeneration && isCurrent(),
      })
      if (generation === requestGeneration) {
        if (typeof result?.added !== 'boolean') throw new Error('Invalid membership response')
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
    addToList, removeFromList, isListMember,
  }
}
