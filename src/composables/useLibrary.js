import { readonly, ref } from 'vue'
import { currentUser } from './authState.js'
import {
  addItem, clearLibraryRepository, getLibrary, getMediaKey, removeItem,
  updateRating, updateStatus,
} from '../services/libraryRepository.js'

const libraryItems = ref([])
const isLibraryLoaded = ref(false)
const isLibraryLoading = ref(false)
const libraryError = ref('')
let loadingPromise = null
let generation = 0

export function resetLibrary() {
  generation++
  clearLibraryRepository()
  libraryItems.value = []
  isLibraryLoaded.value = false
  isLibraryLoading.value = false
  libraryError.value = ''
  loadingPromise = null
}

async function loadLibrary(force = false) {
  if (!currentUser.value) return []
  if (force) resetLibrary()
  if (isLibraryLoaded.value) return libraryItems.value
  if (!loadingPromise) {
    const requestGeneration = generation
    isLibraryLoading.value = true
    libraryError.value = ''
    const pending = getLibrary()
      .then((items) => {
        if (requestGeneration === generation) {
          libraryItems.value = items
          isLibraryLoaded.value = true
        }
        return items
      })
      .catch((error) => {
        if (requestGeneration === generation) libraryError.value = error.message
        throw error
      })
      .finally(() => {
        if (requestGeneration === generation) {
          isLibraryLoading.value = false
          loadingPromise = null
        }
      })
    loadingPromise = pending
  }
  return loadingPromise
}

function guardAccount() {
  if (!currentUser.value) throw new Error('Please log in to use your Library.')
  return generation
}

export function useLibrary() {
  function hasLibraryItem(media) {
    const mediaKey = getMediaKey(media)
    return Boolean(mediaKey && libraryItems.value.some((item) => item.userMedia.mediaKey === mediaKey))
  }

  async function addLibraryItem(media) {
    const requestGeneration = guardAccount()
    const result = await addItem(media)
    if (requestGeneration === generation && result.item) {
      libraryItems.value = [
        ...libraryItems.value.filter((item) => item.userMedia.mediaKey !== result.item.userMedia.mediaKey),
        result.item,
      ]
    }
    return result
  }

  async function updateLibraryStatus(mediaKey, status) {
    const requestGeneration = guardAccount()
    const updatedItem = await updateStatus(mediaKey, status)
    if (requestGeneration === generation && updatedItem) {
      libraryItems.value = libraryItems.value.map((item) =>
        item.userMedia.mediaKey === mediaKey ? updatedItem : item)
    }
    return updatedItem
  }

  async function updateLibraryRating(mediaKey, rating) {
    const requestGeneration = guardAccount()
    const updatedItem = await updateRating(mediaKey, rating)
    if (requestGeneration === generation && updatedItem) {
      libraryItems.value = libraryItems.value.map((item) =>
        item.userMedia.mediaKey === mediaKey ? updatedItem : item)
    }
    return updatedItem
  }

  async function removeLibraryItem(mediaKey) {
    const requestGeneration = guardAccount()
    const removed = await removeItem(mediaKey)
    if (requestGeneration === generation && removed) {
      libraryItems.value = libraryItems.value.filter((item) => item.userMedia.mediaKey !== mediaKey)
    }
    return removed
  }

  return {
    libraryItems: readonly(libraryItems), isLibraryLoaded: readonly(isLibraryLoaded),
    isLibraryLoading: readonly(isLibraryLoading), libraryError: readonly(libraryError),
    loadLibrary, getMediaKey, hasLibraryItem, addLibraryItem,
    updateLibraryStatus, updateLibraryRating, removeLibraryItem,
  }
}
