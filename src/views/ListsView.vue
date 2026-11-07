<script setup>
import { ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { useLists } from '../composables/useLists.js'
import { useLibrary } from '../composables/useLibrary.js'
import MediaArtwork from '../components/MediaArtwork.vue'
import MediaTypeIcon from '../components/MediaTypeIcon.vue'
import { formatListDate } from '../utils/listDisplay.js'

const { currentUser, isAuthLoading, authError } = useAuth()
const { lists, isListsLoaded, isListsLoading, listsError, loadLists, createCustomList, loadMemberships, isListMember } = useLists()
const { displayLibraryItems, isLibraryLoaded } = useLibrary()
const previewStatus = ref('idle')
const title = ref('')
const description = ref('')
const isCreating = ref(false)
const formError = ref('')
const formSuccess = ref('')
const createPanel = ref(null)

function cancelCreate() {
  title.value = ''
  description.value = ''
  formError.value = ''
  createPanel.value.open = false
  createPanel.value.querySelector('summary').focus()
}

watch(() => currentUser.value?.id, () => {
  previewStatus.value = 'idle'
  title.value = ''
  description.value = ''
  formError.value = ''
  formSuccess.value = ''
}, { immediate: true })

async function loadPreviews() {
  if (!currentUser.value || !isLibraryLoaded.value || !isListsLoaded.value || previewStatus.value === 'loading') return
  const accountId = currentUser.value.id
  previewStatus.value = 'loading'
  try {
    await loadMemberships()
    if (currentUser.value?.id === accountId) previewStatus.value = 'loaded'
  } catch {
    if (currentUser.value?.id === accountId) previewStatus.value = 'error'
  }
}
watch([isListsLoaded, isLibraryLoaded, () => currentUser.value?.id], () => {
  if (previewStatus.value === 'idle') loadPreviews()
}, { immediate: true })

function listPreview(list) {
  if (previewStatus.value !== 'loaded') return []
  return displayLibraryItems.value.filter(item => isListMember(list.id, item.userMedia.id)).slice(0, 3)
}

watch([() => currentUser.value?.id, isAuthLoading], async () => {
  if (currentUser.value && !isAuthLoading.value) {
    try { await loadLists(true) } catch { /* De gedeelde foutstatus toont de oorzaak. */ }
  }
}, { immediate: true })

async function submitCreate() {
  if (isCreating.value || !isListsLoaded.value) return
  isCreating.value = true
  formError.value = ''
  formSuccess.value = ''
  const accountId = currentUser.value?.id
  try {
    const list = await createCustomList(title.value, description.value)
    if (currentUser.value?.id !== accountId) return
    title.value = ''
    description.value = ''
    formSuccess.value = `Created “${list.title}”.`
    if (createPanel.value) {
      createPanel.value.open = false
      createPanel.value.querySelector('summary').focus()
    }
  } catch (error) {
    if (currentUser.value?.id === accountId) {
      formError.value = error.fields?.title || error.fields?.description || error.fields?.list || error.message
    }
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="lists-page">
    <section class="page-intro" aria-labelledby="page-title">
      <p class="cinematic-eyebrow">Your taste. Your collections.</p>
      <h1 id="page-title">Lists</h1>
      <p>Create private lists to organize books, movies, shows and games from your Library.</p>
    </section>

    <p v-if="isAuthLoading" class="library-empty" role="status">Checking your session…</p>
    <div v-else-if="!currentUser" class="library-empty">
      <p>{{ authError || 'Log in or register to view your Custom Lists.' }}</p>
      <RouterLink class="inline-link" to="/login">Login</RouterLink>
      <RouterLink class="inline-link" to="/register">Register</RouterLink>
    </div>
    <template v-else>
      <details ref="createPanel" class="list-panel list-disclosure">
        <summary>Create a list</summary>
        <form class="list-form" @submit.prevent="submitCreate">
          <div class="list-form__field">
            <label for="list-title">Title</label>
            <input id="list-title" v-model="title" type="text" required maxlength="120" :disabled="isCreating || !isListsLoaded" />
          </div>
          <div class="list-form__field">
            <label for="list-description">Description (optional)</label>
            <textarea id="list-description" v-model="description" rows="2" maxlength="1000" :disabled="isCreating || !isListsLoaded" />
          </div>
          <p v-if="formError" class="list-error" role="alert">{{ formError }}</p>
          <div class="list-form__actions">
            <button type="submit" :disabled="isCreating || !isListsLoaded">{{ isCreating ? 'Creating…' : 'Create list' }}</button>
            <button type="button" class="list-form__cancel" :disabled="isCreating" @click="cancelCreate">Cancel</button>
          </div>
        </form>
      </details>
      <p v-if="formSuccess" class="list-success" role="status">{{ formSuccess }}</p>

      <section aria-labelledby="my-lists-heading">
        <h2 id="my-lists-heading" class="section-title">My lists</h2>
        <p v-if="previewStatus === 'error'" class="list-preview-message" role="status">Artwork previews could not be loaded. Your lists are still available. <button class="text-button" type="button" @click="loadPreviews">Retry previews</button></p>
        <div v-if="listsError" class="library-empty" role="alert">
          <p>Your lists could not be loaded. {{ listsError }}</p>
          <button type="button" class="text-button" @click="loadLists(true)">Try again</button>
        </div>
        <p v-else-if="isListsLoading || !isListsLoaded" class="library-empty" role="status">Loading your lists…</p>
        <div v-else-if="!lists.length" class="library-empty">
          <p>You have no Custom Lists yet. Create one to organize your favorite books, movies, shows and games.</p>
        </div>
        <ul v-else class="list-summary-grid">
          <li v-for="list in lists" :key="list.id" class="list-summary-card">
            <RouterLink class="list-art" :to="`/lists/${list.id}`" :aria-label="`Open list ${list.title}`">
              <template v-if="listPreview(list).length"><MediaArtwork v-for="item in listPreview(list)" :key="item.userMedia.id" :media="item.media" :linked="false" /></template>
              <span v-else class="list-art__empty"><MediaTypeIcon type="book" /><span>{{ previewStatus === 'loading' ? 'Loading artwork…' : 'A collection of your own' }}</span></span>
            </RouterLink>
            <div class="list-summary-card__body"><span class="private-label">Private collection</span>
            <h3><RouterLink :to="`/lists/${list.id}`">{{ list.title }}</RouterLink></h3>
            <p v-if="list.description" class="list-summary-description">{{ list.description }}</p>
            <p class="list-meta">{{ list.itemCount }} {{ list.itemCount === 1 ? 'item' : 'items' }} · Updated {{ formatListDate(list.updatedAt) }}</p>
            <RouterLink class="list-open-link" :to="`/lists/${list.id}`">Explore collection <span aria-hidden="true">↗</span></RouterLink></div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
