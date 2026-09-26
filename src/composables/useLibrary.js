import { readonly, ref } from 'vue'
import {
  addItem,
  getLibrary,
  getMediaKey,
  removeItem,
  updateRating,
  updateStatus,
} from '../services/libraryRepository.js'

const libraryItems = ref([])
const isLibraryLoaded = ref(false)
let loadingPromise = null

async function loadLibrary() {
  if (!loadingPromise) {
    loadingPromise = getLibrary()
      .then((items) => {
        libraryItems.value = items
        isLibraryLoaded.value = true
        return items
      })
      .finally(() => {
        loadingPromise = null
      })
  }

  return loadingPromise
}

export function useLibrary() {
  function hasLibraryItem(media) {
    const mediaKey = getMediaKey(media)

    return Boolean(
      mediaKey && libraryItems.value.some((item) => item.userMedia.mediaKey === mediaKey),
    )
  }

  async function addLibraryItem(media) {
    const result = await addItem(media)

    if (result.item && !libraryItems.value.some(
      (item) => item.userMedia.mediaKey === result.item.userMedia.mediaKey,
    )) {
      libraryItems.value = [...libraryItems.value, result.item]
    }

    return result
  }

  async function updateLibraryStatus(mediaKey, status) {
    const updatedItem = await updateStatus(mediaKey, status)

    if (updatedItem) {
      libraryItems.value = libraryItems.value.map((item) =>
        item.userMedia.mediaKey === mediaKey ? updatedItem : item,
      )
    }

    return updatedItem
  }

  async function updateLibraryRating(mediaKey, rating) {
    const updatedItem = await updateRating(mediaKey, rating)

    if (updatedItem) {
      libraryItems.value = libraryItems.value.map((item) =>
        item.userMedia.mediaKey === mediaKey ? updatedItem : item,
      )
    }

    return updatedItem
  }

  async function removeLibraryItem(mediaKey) {
    const removed = await removeItem(mediaKey)

    if (removed) {
      libraryItems.value = libraryItems.value.filter(
        (item) => item.userMedia.mediaKey !== mediaKey,
      )
    }

    return removed
  }

  return {
    libraryItems: readonly(libraryItems),
    isLibraryLoaded: readonly(isLibraryLoaded),
    loadLibrary,
    getMediaKey,
    hasLibraryItem,
    addLibraryItem,
    updateLibraryStatus,
    updateLibraryRating,
    removeLibraryItem,
  }
}
