<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import LibraryAddButton from './LibraryAddButton.vue'
import LibraryItemControls from './LibraryItemControls.vue'
import { useAuth } from '../composables/useAuth.js'
import { useLibrary } from '../composables/useLibrary.js'
import { getMediaKey, isSupportedMediaIdentity } from '../domain/mediaIdentity.js'

const props = defineProps({ media: { type: Object, required: true } })
const { currentUser, isAuthLoading } = useAuth()
const {
  libraryItems, isLibraryLoaded, isLibraryLoading, libraryError, loadLibrary,
  addLibraryItem, updateLibraryStatus, updateLibraryRating, removeLibraryItem,
} = useLibrary()
const mediaKey = computed(() => getMediaKey(props.media))
const libraryItem = computed(() => libraryItems.value.find((item) => item.userMedia.mediaKey === mediaKey.value))
const busy = ref(false)
const feedback = ref('')
const feedbackType = ref('status')
let contextVersion = 0

// Ook bij snel uitloggen en opnieuw inloggen met hetzelfde account vervalt oude lokale feedback.
watch([currentUser, isAuthLoading, mediaKey], () => {
  contextVersion++
  busy.value = false
  feedback.value = ''
}, { flush: 'sync' })
onScopeDispose(() => { contextVersion++ })

watch([currentUser, isAuthLoading], () => {
  if (currentUser.value && !isAuthLoading.value) retryLibrary()
}, { immediate: true })

async function retryLibrary() {
  if (!currentUser.value || isAuthLoading.value || isLibraryLoading.value) return
  try { await loadLibrary() } catch { /* De fout blijft beperkt tot de Library-bediening. */ }
}

async function mutate(action, failureMessage, restoreControl = () => {}) {
  if (busy.value || !currentUser.value || isAuthLoading.value || !isLibraryLoaded.value || libraryError.value) return
  const version = contextVersion
  busy.value = true
  feedback.value = ''
  try {
    const message = await action()
    if (version !== contextVersion) return
    feedbackType.value = 'status'
    feedback.value = message || ''
  } catch {
    if (version !== contextVersion) return
    restoreControl()
    feedbackType.value = 'alert'
    feedback.value = failureMessage
  } finally {
    if (version === contextVersion) busy.value = false
  }
}

function add() {
  if (libraryItem.value || !isSupportedMediaIdentity(props.media)) return
  const { source, mediaType, sourceId } = props.media
  return mutate(async () => {
    const result = await addLibraryItem({ source, mediaType, sourceId })
    return result.added ? 'Added to Library.' : 'Already in your Library.'
  }, 'This item could not be added to your Library. Please try again.')
}

function changeStatus(item, event) {
  const control = event.target
  const value = control.value
  return mutate(async () => {
    if (!await updateLibraryStatus(item.userMedia.mediaKey, value)) throw new Error('Missing Library item')
  }, 'The Library status could not be updated. Please try again.', () => {
    control.value = libraryItem.value?.userMedia.status ?? item.userMedia.status
  })
}

function changeRating(item, event) {
  const control = event.target
  const value = control.value === '' ? null : Number(control.value)
  return mutate(async () => {
    if (!await updateLibraryRating(item.userMedia.mediaKey, value)) throw new Error('Missing Library item')
  }, 'The personal rating could not be updated. Please try again.', () => {
    control.value = libraryItem.value?.userMedia.rating ?? ''
  })
}

function remove(item) {
  return mutate(async () => {
    if (!await removeLibraryItem(item.userMedia.mediaKey)) throw new Error('Missing Library item')
    return 'Removed from Library.'
  }, 'This item could not be removed from your Library. Please try again.')
}
</script>

<template>
  <section class="media-detail-library" aria-labelledby="media-library-title" :aria-busy="busy || isAuthLoading || isLibraryLoading">
    <h2 id="media-library-title">Library</h2>
    <p v-if="isAuthLoading" role="status">Checking your session…</p>
    <div v-else-if="!currentUser">
      <RouterLink class="inline-link" to="/login">Log in to add to Library</RouterLink>
      <RouterLink class="inline-link" to="/register">Register</RouterLink>
    </div>
    <p v-else-if="isLibraryLoading || (!isLibraryLoaded && !libraryError)" role="status">Loading your Library…</p>
    <div v-else-if="libraryError" role="alert">
      <p>Your Library is unavailable. Please try again.</p>
      <button class="text-button" type="button" @click="retryLibrary">Retry Library</button>
    </div>
    <LibraryItemControls
      v-else-if="libraryItem"
      :item="libraryItem"
      :busy="busy"
      @status-change="changeStatus"
      @rating-change="changeRating"
      @remove="remove"
    />
    <LibraryAddButton
      v-else
      :media="media"
      :is-library-loaded="isLibraryLoaded"
      :is-added="false"
      :is-adding="busy"
      :has-identity="isSupportedMediaIdentity(media)"
      @add="add"
    />
    <p v-if="feedback" class="library-feedback" :class="{ 'library-feedback--error': feedbackType === 'alert' }" :role="feedbackType">
      {{ feedback }}
    </p>
  </section>
</template>

<style scoped>
.media-detail-library { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--color-border); }
.media-detail-library h2 { margin: 0 0 0.75rem; font-size: 1.1rem; }
</style>
