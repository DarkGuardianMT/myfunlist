<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useLibrary } from '../composables/useLibrary.js'
import { useLists } from '../composables/useLists.js'
import { getMediaKey } from '../domain/mediaIdentity.js'

const props = defineProps({ media: { type: Object, required: true } })
const { currentUser, isAuthLoading } = useAuth()
const { libraryItems, isLibraryLoaded, isLibraryLoading, libraryError, loadLibrary } = useLibrary()
const { lists, isListsLoaded, loadLists, addToList } = useLists()
const mediaKey = computed(() => getMediaKey(props.media))
const libraryItem = computed(() => libraryItems.value.find((item) => item.userMedia.mediaKey === mediaKey.value))
const available = computed(() => Boolean(currentUser.value && !isAuthLoading.value && isLibraryLoaded.value && !isLibraryLoading.value && !libraryError.value))
const opened = ref(false)
const loadStatus = ref('idle')
const selectedId = ref('')
const busy = ref(false)
const feedback = ref('')
const feedbackType = ref('status')
const missingEntry = ref(false)
let contextVersion = 0

function reset() {
  contextVersion++
  opened.value = false
  loadStatus.value = 'idle'
  selectedId.value = ''
  busy.value = false
  feedback.value = ''
  missingEntry.value = false
}
watch([currentUser, isAuthLoading, mediaKey, () => libraryItem.value?.userMedia.id, available], reset, { flush: 'sync' })
onScopeDispose(() => { contextVersion++ })

async function loadSummaries(force = false) {
  if (!available.value || !libraryItem.value || !opened.value || loadStatus.value === 'loading') return
  const version = contextVersion
  loadStatus.value = 'loading'
  feedback.value = ''
  try {
    await loadLists(force)
    if (version !== contextVersion) return
    if (!isListsLoaded.value) throw new Error('List cache invalidated')
    loadStatus.value = 'loaded'
    if (!lists.value.some((list) => list.id === selectedId.value)) selectedId.value = ''
  } catch {
    if (version !== contextVersion) return
    loadStatus.value = 'error'
    feedbackType.value = 'alert'
    feedback.value = 'Your Custom Lists could not be loaded. Please try again.'
  }
}

function toggle() {
  if (busy.value || missingEntry.value || !available.value || !libraryItem.value) return
  if (opened.value) reset()
  else {
    opened.value = true
    loadSummaries()
  }
}

async function add() {
  const list = lists.value.find((list) => list.id === selectedId.value)
  const item = libraryItem.value
  if (busy.value || !available.value || !item || !list || !opened.value || loadStatus.value !== 'loaded' || missingEntry.value) return
  const version = contextVersion
  const isCurrent = () => version === contextVersion && available.value && libraryItem.value?.userMedia.id === item.userMedia.id
  busy.value = true
  feedback.value = ''
  try {
    const result = await addToList(list.id, item.userMedia.id, { refreshDetail: false, isCurrent })
    if (!isCurrent()) return
    if (typeof result?.added !== 'boolean') throw new Error('Invalid membership response')
    feedbackType.value = 'status'
    feedback.value = result.added ? `Added to ${list.title}.` : 'This item is already in this list.'
  } catch (error) {
    if (!isCurrent()) return
    feedbackType.value = 'alert'
    if (error.code === 'list_not_found') {
      selectedId.value = ''
      loadStatus.value = 'error'
      feedback.value = 'This list is no longer available. Reload your lists and choose another.'
    } else if (error.code === 'entry_not_found') {
      missingEntry.value = true
      feedback.value = 'This Library entry is no longer available. Refresh your Library to continue.'
    } else feedback.value = 'This item could not be added to the list. Please try again.'
  } finally {
    if (version === contextVersion) busy.value = false
  }
}

async function refreshLibrary() {
  if (busy.value || !available.value || !missingEntry.value) return
  try { await loadLibrary(true) } catch { /* De bestaande Library-bediening toont de laadfout. */ }
}
</script>

<template>
  <section v-if="available" class="media-detail-lists" aria-label="Custom Lists">
    <p v-if="!libraryItem">Add this item to your Library before adding it to a Custom List.</p>
    <template v-else>
      <button class="text-button" type="button" :aria-expanded="opened" aria-controls="media-list-panel" :disabled="busy || missingEntry" @click="toggle">
        Add to Custom List
      </button>
      <div v-if="opened" id="media-list-panel" class="media-detail-lists__panel" :aria-busy="busy || loadStatus === 'loading'">
        <p v-if="loadStatus === 'loading'" role="status">Loading your Custom Lists…</p>
        <button v-else-if="loadStatus === 'error'" class="text-button" type="button" @click="loadSummaries(true)">Retry lists</button>
        <p v-else-if="loadStatus === 'loaded' && !lists.length">
          You do not have any Custom Lists yet. <RouterLink class="inline-link" to="/lists">Create a list</RouterLink>
        </p>
        <form v-else-if="loadStatus === 'loaded'" @submit.prevent="add">
          <label for="media-custom-list">Custom List</label>
          <select id="media-custom-list" v-model="selectedId" :disabled="busy || missingEntry">
            <option value="">Choose a list</option>
            <option v-for="list in lists" :key="list.id" :value="list.id">{{ list.title }}</option>
          </select>
          <button class="text-button" type="submit" :disabled="busy || !selectedId || missingEntry">{{ busy ? 'Adding…' : 'Add to list' }}</button>
        </form>
        <p v-if="feedback" :role="feedbackType">{{ feedback }}</p>
        <button v-if="missingEntry" class="text-button" type="button" @click="refreshLibrary">Refresh Library</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.media-detail-lists { margin-top: 1rem; }
.media-detail-lists p { line-height: 1.5; }
.media-detail-lists__panel { margin-top: 0.75rem; }
.media-detail-lists form { display: grid; gap: 0.5rem; }
.media-detail-lists select { min-width: 0; width: 100%; padding: 0.55rem; border: 1px solid var(--color-control-border); border-radius: 0.45rem; font: inherit; }
</style>
