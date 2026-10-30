import { computed, readonly, ref, watch } from 'vue'
import { currentUser } from './authState.js'
import { invalidateListMemberships } from './useLists.js'
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
export const LIBRARY_UNDO_MS = 8000
const removalNotices = ref([])
const removalJobs = new Map()
let removalSequence = 0

function updateRemovalNotice(id, state) {
  removalNotices.value = removalNotices.value.map((notice) => notice.id === id ? { ...notice, state } : notice)
}

function isLibraryRemovalPending(mediaKey) {
  return removalNotices.value.some((notice) => notice.mediaKey === mediaKey && ['pending', 'deleting'].includes(notice.state))
}

const displayLibraryItems = computed(() => libraryItems.value.filter((item) => !isLibraryRemovalPending(item.userMedia.mediaKey)))

export function cancelUnsentLibraryRemovals() {
  // Pagehide verstuurt nooit mutaties; ook een op CSRF wachtende verwijdering wordt geannuleerd.
  for (const [key, job] of removalJobs) {
    if (job.sent) continue
    clearTimeout(job.timer)
    removalJobs.delete(key)
    updateRemovalNotice(job.id, 'cancelled')
  }
}

export function resetLibrary() {
  generation++
  for (const job of removalJobs.values()) clearTimeout(job.timer)
  removalJobs.clear()
  removalNotices.value = []
  clearLibraryRepository()
  libraryItems.value = []
  isLibraryLoaded.value = false
  isLibraryLoading.value = false
  libraryError.value = ''
  loadingPromise = null
}

watch(() => currentUser.value?.id, resetLibrary, { flush: 'sync' })

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
    const existing = libraryItems.value.find((item) => item.userMedia.mediaKey === getMediaKey(media))
    if (existing && isLibraryRemovalPending(existing.userMedia.mediaKey)) return { added: false, item: existing }
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
    if (isLibraryRemovalPending(mediaKey)) throw new Error('Undo the pending removal before editing this item.')
    const updatedItem = await updateStatus(mediaKey, status)
    if (requestGeneration === generation && updatedItem) {
      libraryItems.value = libraryItems.value.map((item) =>
        item.userMedia.mediaKey === mediaKey ? updatedItem : item)
    }
    return updatedItem
  }

  async function updateLibraryRating(mediaKey, rating) {
    const requestGeneration = guardAccount()
    if (isLibraryRemovalPending(mediaKey)) throw new Error('Undo the pending removal before editing this item.')
    const updatedItem = await updateRating(mediaKey, rating)
    if (requestGeneration === generation && updatedItem) {
      libraryItems.value = libraryItems.value.map((item) =>
        item.userMedia.mediaKey === mediaKey ? updatedItem : item)
    }
    return updatedItem
  }

  async function removeLibraryItem(mediaKey, { isCurrent = () => true, expectedId } = {}) {
    const requestGeneration = guardAccount()
    const accountId = currentUser.value.id
    const removed = await removeItem(mediaKey, {
      expectedId,
      isCurrent: () => requestGeneration === generation && currentUser.value?.id === accountId && isCurrent(),
    })
    if (requestGeneration === generation && removed) {
      libraryItems.value = libraryItems.value.filter((item) => item.userMedia.mediaKey !== mediaKey)
      invalidateListMemberships()
    }
    return removed
  }

  function scheduleLibraryRemoval(mediaKey, { expectedId } = {}) {
    const requestGeneration = guardAccount()
    const existingJob = removalJobs.get(mediaKey)
    if (existingJob) return !expectedId || existingJob.entryId === expectedId ? existingJob.id : null
    const item = libraryItems.value.find((entry) => entry.userMedia.mediaKey === mediaKey)
    if (!isLibraryLoaded.value || isLibraryLoading.value || libraryError.value || !item
      || (expectedId && item.userMedia.id !== expectedId)) return null
    const id = ++removalSequence
    const expiresAt = Date.now() + LIBRARY_UNDO_MS
    const job = { id, mediaKey, entryId: item.userMedia.id, accountId: currentUser.value.id,
      generation: requestGeneration, sent: false, timer: null }
    removalJobs.set(mediaKey, job)
    removalNotices.value = [...removalNotices.value, { id, mediaKey, entryId: job.entryId,
      title: item.media.title, expiresAt, state: 'pending' }]
    job.timer = setTimeout(() => commitRemoval(job), LIBRARY_UNDO_MS)
    return id
  }

  async function commitRemoval(job) {
    const isCurrent = () => removalJobs.get(job.mediaKey) === job && job.generation === generation
      && currentUser.value?.id === job.accountId
    if (!isCurrent() || removalNotices.value.find((notice) => notice.id === job.id)?.state !== 'pending') return
    clearTimeout(job.timer)
    updateRemovalNotice(job.id, 'deleting')
    try {
      const removed = await removeLibraryItem(job.mediaKey, {
        expectedId: job.entryId,
        isCurrent: () => {
          if (!isCurrent()) return false
          job.sent = true
          return true
        },
      })
      if (!isCurrent()) return
      if (!removed) throw new Error('Library entry changed before removal.')
      updateRemovalNotice(job.id, 'removed')
    } catch {
      if (isCurrent()) updateRemovalNotice(job.id, 'error')
    } finally {
      if (removalJobs.get(job.mediaKey) === job) removalJobs.delete(job.mediaKey)
    }
  }

  function undoLibraryRemoval(id) {
    const notice = removalNotices.value.find((entry) => entry.id === id)
    const job = notice && removalJobs.get(notice.mediaKey)
    if (!job || notice.state !== 'pending' || job.generation !== generation || currentUser.value?.id !== job.accountId) return false
    if (Date.now() >= notice.expiresAt) {
      commitRemoval(job)
      return false
    }
    clearTimeout(job.timer)
    removalJobs.delete(notice.mediaKey)
    updateRemovalNotice(id, 'undone')
    return true
  }

  function dismissRemovalNotice(id) {
    removalNotices.value = removalNotices.value.filter((notice) => notice.id !== id || ['pending', 'deleting'].includes(notice.state))
  }

  return {
    libraryItems: readonly(libraryItems), isLibraryLoaded: readonly(isLibraryLoaded),
    isLibraryLoading: readonly(isLibraryLoading), libraryError: readonly(libraryError),
    loadLibrary, getMediaKey, hasLibraryItem, addLibraryItem,
    updateLibraryStatus, updateLibraryRating, removeLibraryItem,
    displayLibraryItems: readonly(displayLibraryItems), removalNotices: readonly(removalNotices),
    scheduleLibraryRemoval, undoLibraryRemoval, dismissRemovalNotice, isLibraryRemovalPending,
  }
}
