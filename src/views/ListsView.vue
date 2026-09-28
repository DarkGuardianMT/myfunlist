<script setup>
import { ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { useLists } from '../composables/useLists.js'
import { formatListDate } from '../utils/listDisplay.js'

const { currentUser, isAuthLoading, authError } = useAuth()
const { lists, isListsLoaded, isListsLoading, listsError, loadLists, createCustomList } = useLists()
const title = ref('')
const description = ref('')
const isCreating = ref(false)
const formError = ref('')
const formSuccess = ref('')

watch(() => currentUser.value?.id, () => {
  title.value = ''
  description.value = ''
  formError.value = ''
  formSuccess.value = ''
}, { immediate: true })

watch([() => currentUser.value?.id, isAuthLoading], async () => {
  if (currentUser.value && !isAuthLoading.value) {
    try { await loadLists(true) } catch { /* De gedeelde foutstatus toont de oorzaak. */ }
  }
}, { immediate: true })

async function submitCreate() {
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
      <section class="list-panel" aria-labelledby="create-list-heading">
        <h2 id="create-list-heading">Create a list</h2>
        <form class="list-form" @submit.prevent="submitCreate">
          <label for="list-title">Title</label>
          <input id="list-title" v-model="title" type="text" required :disabled="isCreating || !isListsLoaded" />
          <label for="list-description">Description (optional)</label>
          <textarea id="list-description" v-model="description" rows="3" :disabled="isCreating || !isListsLoaded" />
          <p v-if="formError" class="list-error" role="alert">{{ formError }}</p>
          <p v-if="formSuccess" class="list-success" role="status">{{ formSuccess }}</p>
          <button type="submit" :disabled="isCreating || !isListsLoaded">{{ isCreating ? 'Creating…' : 'Create list' }}</button>
        </form>
      </section>

      <section aria-labelledby="my-lists-heading">
        <h2 id="my-lists-heading" class="section-title">My lists</h2>
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
            <h3><RouterLink :to="`/lists/${list.id}`">{{ list.title }}</RouterLink></h3>
            <p v-if="list.description" class="list-summary-description">{{ list.description }}</p>
            <p class="list-meta">{{ list.itemCount }} {{ list.itemCount === 1 ? 'item' : 'items' }} · Updated {{ formatListDate(list.updatedAt) }}</p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
