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
}

export function invalidateListMemberships() {
  // Library-verwijdering wijzigt aantallen en lidmaatschappen; oude requests mogen die cache niet herstellen.
  resetLists()
}

function guardAccount() {
  if (!currentUser.value) throw new Error('Please log in to use Custom Lists.')
  return generation
}

async function loadLists(force = false) {
  if (!currentUser.value) return []
  if (isListsLoaded.value && !force) return lists.value
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
      if (selectedList.value?.id === id) {
        selectedList.value = null
        selectedItems.value = []
        isDetailLoaded.value = false
        loadedId = null
      }
    }
  }

  async function addToList(id, userMediaId) {
    const requestGeneration = guardAccount()
    const result = await addListItem(id, userMediaId)
    if (generation === requestGeneration) await loadList(id, true)
    return result
  }

  async function removeFromList(id, userMediaId) {
    const requestGeneration = guardAccount()
    await removeListItem(id, userMediaId)
    if (generation === requestGeneration) await loadList(id, true)
  }

  return {
    lists: readonly(lists), isListsLoaded: readonly(isListsLoaded),
    isListsLoading: readonly(isListsLoading), listsError: readonly(listsError),
    selectedList: readonly(selectedList), selectedItems: readonly(selectedItems),
    isDetailLoaded: readonly(isDetailLoaded), isDetailLoading: readonly(isDetailLoading),
    detailError: readonly(detailError),
    loadLists, loadList, createCustomList, updateCustomList, deleteCustomList,
    addToList, removeFromList,
  }
}
