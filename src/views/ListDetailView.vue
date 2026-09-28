<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ListMediaCard from '../components/ListMediaCard.vue'
import RawgAttribution from '../components/RawgAttribution.vue'
import TmdbAttribution from '../components/TmdbAttribution.vue'
import { useAuth } from '../composables/useAuth.js'
import { useLibrary } from '../composables/useLibrary.js'
import { useLists } from '../composables/useLists.js'
import { formatListDate } from '../utils/listDisplay.js'

const route = useRoute()
const router = useRouter()
const { currentUser, isAuthLoading, authError } = useAuth()
const { libraryItems, isLibraryLoaded, isLibraryLoading, libraryError, loadLibrary } = useLibrary()
const {
  selectedList, selectedItems, isDetailLoaded, isDetailLoading, detailError,
  loadList, updateCustomList, deleteCustomList, addToList, removeFromList,
} = useLists()
const listId = computed(() => String(route.params.id))
const editing = ref(false)
const editTitle = ref('')
const editDescription = ref('')
const isSaving = ref(false)
const isDeleting = ref(false)
const isAdding = ref(false)
const busyItemId = ref(null)
const selectedLibraryId = ref('')
const feedback = ref('')
const feedbackType = ref('status')
const editError = ref('')

const availableItems = computed(() => {
  const included = new Set(selectedItems.value.map((item) => item.userMedia.id))
  return libraryItems.value.filter((item) => !included.has(item.userMedia.id))
})
const hasTmdbMedia = computed(() => selectedItems.value.some((item) => item.media.source === 'tmdb'))
const hasGames = computed(() => selectedItems.value.some((item) => item.media.mediaType === 'game'))

watch([() => currentUser.value?.id, isAuthLoading, listId], async () => {
  feedback.value = ''
  selectedLibraryId.value = ''
  editing.value = false
  if (currentUser.value && !isAuthLoading.value) {
    const accountId = currentUser.value.id
    try { await loadList(listId.value, true) } catch { /* De detailfout toont de oorzaak. */ return }
    if (currentUser.value?.id !== accountId) return
    try { await loadLibrary() } catch { /* De bibliotheekfout toont de oorzaak. */ }
  }
}, { immediate: true })

watch(() => selectedList.value?.id, () => {
  editTitle.value = selectedList.value?.title ?? ''
  editDescription.value = selectedList.value?.description ?? ''
})

function showFeedback(message, type = 'status') {
  feedback.value = message
  feedbackType.value = type
}

async function saveEdit() {
  isSaving.value = true
  editError.value = ''
  const accountId = currentUser.value?.id
  try {
    const updated = await updateCustomList(listId.value, {
      title: editTitle.value, description: editDescription.value,
    })
    if (currentUser.value?.id !== accountId) return
    editTitle.value = updated.title
    editDescription.value = updated.description ?? ''
    editing.value = false
    showFeedback('List details saved.')
  } catch (error) {
    if (currentUser.value?.id === accountId) {
      editError.value = error.fields?.title || error.fields?.description || error.fields?.list || error.message
    }
  } finally {
    isSaving.value = false
  }
}

async function removeList() {
  if (!selectedList.value || !window.confirm(
    `Delete “${selectedList.value.title}”? Its Library items will remain in your Library.`,
  )) return
  isDeleting.value = true
  const accountId = currentUser.value?.id
  try {
    await deleteCustomList(listId.value)
    if (currentUser.value?.id === accountId) await router.push('/lists')
  } catch (error) {
    if (currentUser.value?.id === accountId) showFeedback(error.message, 'alert')
  } finally {
    isDeleting.value = false
  }
}

async function addSelected() {
  if (!selectedLibraryId.value) return
  isAdding.value = true
  feedback.value = ''
  const accountId = currentUser.value?.id
  try {
    const result = await addToList(listId.value, selectedLibraryId.value)
    if (currentUser.value?.id !== accountId) return
    selectedLibraryId.value = ''
    showFeedback(result.added ? 'Added to this list.' : 'This item is already in the list.')
  } catch (error) {
    if (currentUser.value?.id === accountId) showFeedback(error.message, 'alert')
  } finally {
    isAdding.value = false
  }
}

async function removeSelected(item) {
  busyItemId.value = item.userMedia.id
  feedback.value = ''
  const accountId = currentUser.value?.id
  try {
    await removeFromList(listId.value, item.userMedia.id)
    if (currentUser.value?.id === accountId) showFeedback(`“${item.media.title}” was removed from this list. It remains in your Library.`)
  } catch (error) {
    if (currentUser.value?.id === accountId) showFeedback(error.message, 'alert')
  } finally {
    busyItemId.value = null
  }
}
</script>

<template>
  <div class="list-detail-page">
    <RouterLink class="inline-link list-back-link" to="/lists">← All lists</RouterLink>
    <p v-if="isAuthLoading" class="library-empty" role="status">Checking your session…</p>
    <div v-else-if="!currentUser" class="library-empty">
      <p>{{ authError || 'Log in or register to view your Custom Lists.' }}</p>
      <RouterLink class="inline-link" to="/login">Login</RouterLink>
      <RouterLink class="inline-link" to="/register">Register</RouterLink>
    </div>
    <div v-else-if="detailError" class="library-empty" role="alert">
      <p>{{ detailError }}</p>
      <button type="button" class="text-button" @click="loadList(listId, true)">Try again</button>
    </div>
    <p v-else-if="isDetailLoading || !isDetailLoaded" class="library-empty" role="status">Loading this list…</p>
    <template v-else-if="selectedList">
      <header class="list-detail-header">
        <h1>{{ selectedList.title }}</h1>
        <p v-if="selectedList.description" class="list-detail-description">{{ selectedList.description }}</p>
        <p class="list-meta">{{ selectedList.itemCount }} {{ selectedList.itemCount === 1 ? 'item' : 'items' }} · Created {{ formatListDate(selectedList.createdAt) }} · Updated {{ formatListDate(selectedList.updatedAt) }}</p>
        <div class="list-actions">
          <button type="button" class="text-button" @click="editing = !editing">{{ editing ? 'Cancel edit' : 'Edit list' }}</button>
          <button type="button" class="text-button list-delete" :disabled="isDeleting" @click="removeList">{{ isDeleting ? 'Deleting…' : 'Delete list' }}</button>
        </div>
      </header>

      <section v-if="editing" class="list-panel" aria-labelledby="edit-list-heading">
        <h2 id="edit-list-heading">Edit list</h2>
        <form class="list-form" @submit.prevent="saveEdit">
          <label for="edit-list-title">Title</label>
          <input id="edit-list-title" v-model="editTitle" type="text" required :disabled="isSaving" />
          <label for="edit-list-description">Description (optional)</label>
          <textarea id="edit-list-description" v-model="editDescription" rows="3" :disabled="isSaving" />
          <p v-if="editError" class="list-error" role="alert">{{ editError }}</p>
          <button type="submit" :disabled="isSaving">{{ isSaving ? 'Saving…' : 'Save changes' }}</button>
        </form>
      </section>

      <p v-if="feedback" :class="feedbackType === 'alert' ? 'list-error' : 'list-success'" :role="feedbackType">{{ feedback }}</p>

      <section class="list-panel" aria-labelledby="add-list-item-heading">
        <h2 id="add-list-item-heading">Add from Library</h2>
        <div v-if="libraryError" role="alert">
          <p class="list-error">Your Library could not be loaded. {{ libraryError }}</p>
          <button type="button" class="text-button" @click="loadLibrary(true)">Try again</button>
        </div>
        <p v-else-if="isLibraryLoading || !isLibraryLoaded" role="status">Loading your Library…</p>
        <div v-else-if="!libraryItems.length">
          <p>Add media to your Library before adding it to a list.</p>
          <RouterLink class="inline-link" to="/discover">Discover media</RouterLink>
        </div>
        <p v-else-if="!availableItems.length">Every item in your Library is already in this list.</p>
        <form v-else class="list-add-form" @submit.prevent="addSelected">
          <label for="list-library-item">Library item</label>
          <select id="list-library-item" v-model="selectedLibraryId" required :disabled="isAdding">
            <option value="">Choose an item</option>
            <option v-for="item in availableItems" :key="item.userMedia.id" :value="item.userMedia.id">
              {{ item.media.title }} ({{ item.media.mediaType }})
            </option>
          </select>
          <button type="submit" :disabled="isAdding || !selectedLibraryId">{{ isAdding ? 'Adding…' : 'Add to list' }}</button>
        </form>
      </section>

      <section aria-labelledby="list-items-heading">
        <h2 id="list-items-heading" class="section-title">List items</h2>
        <div v-if="!selectedItems.length" class="library-empty">
          <p>This list is empty. Add an item from your Library above.</p>
        </div>
        <div v-else class="library-grid">
          <ListMediaCard v-for="item in selectedItems" :key="item.userMedia.id"
            :item="item" :busy="busyItemId === item.userMedia.id" @remove="removeSelected" />
        </div>
        <TmdbAttribution v-if="hasTmdbMedia" />
        <RawgAttribution v-if="hasGames" />
      </section>
    </template>
  </div>
</template>
