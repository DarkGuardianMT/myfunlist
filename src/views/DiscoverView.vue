<script setup>
import { onMounted, ref } from 'vue'
import BookCard from '../components/BookCard.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { searchBooks } from '../services/googleBooks.js'

const query = ref('')
const books = ref([])
const status = ref('idle')
const searchedQuery = ref('')
const addingMediaKeys = ref(new Set())
const libraryFeedback = ref('')
const libraryFeedbackType = ref('status')
const {
  isLibraryLoaded,
  loadLibrary,
  getMediaKey,
  hasLibraryItem,
  addLibraryItem,
} = useLibrary()

onMounted(async () => {
  try {
    await loadLibrary()
  } catch {
    libraryFeedbackType.value = 'alert'
    libraryFeedback.value = 'Your Library could not be loaded.'
  }
})

async function handleSearch() {
  const trimmedQuery = query.value.trim()

  if (!trimmedQuery || status.value === 'loading') {
    return
  }

  status.value = 'loading'
  searchedQuery.value = trimmedQuery

  try {
    books.value = await searchBooks(trimmedQuery)
    status.value = books.value.length ? 'success' : 'empty'
  } catch {
    books.value = []
    status.value = 'error'
  }
}

async function handleAddToLibrary(book) {
  const mediaKey = getMediaKey(book)

  if (!mediaKey || hasLibraryItem(book) || addingMediaKeys.value.has(mediaKey)) {
    return
  }

  addingMediaKeys.value.add(mediaKey)
  libraryFeedback.value = ''

  try {
    const result = await addLibraryItem(book)
    libraryFeedbackType.value = 'status'
    libraryFeedback.value = result.added
      ? `“${book.title}” was added to your Library.`
      : `“${book.title}” is already in your Library.`
  } catch {
    libraryFeedbackType.value = 'alert'
    libraryFeedback.value = 'This book could not be added. Please try again.'
  } finally {
    addingMediaKeys.value.delete(mediaKey)
  }
}

function isAdding(book) {
  const mediaKey = getMediaKey(book)

  return Boolean(mediaKey && addingMediaKeys.value.has(mediaKey))
}
</script>

<template>
  <div class="discover-page">
    <section class="page-intro" aria-labelledby="page-title">
      <h1 id="page-title">Discover books</h1>
      <p>Search for your next read using book information from Google Books.</p>
    </section>

    <section class="book-search" aria-labelledby="book-search-title">
      <h2 id="book-search-title">Search books</h2>

      <form class="book-search__form" role="search" @submit.prevent="handleSearch">
        <label for="book-query">Title, author, or ISBN</label>
        <div class="book-search__controls">
          <input
            id="book-query"
            v-model="query"
            type="search"
            name="book-query"
            placeholder="For example: The Hobbit"
            maxlength="200"
            autocomplete="off"
          />
          <button type="submit" :disabled="status === 'loading' || !query.trim()">
            {{ status === 'loading' ? 'Searching…' : 'Search' }}
          </button>
        </div>
      </form>

      <div class="book-search__feedback" aria-live="polite" aria-atomic="true">
        <p v-if="status === 'idle'">Enter a title, author, or ISBN to find books.</p>
        <p v-else-if="status === 'loading'" role="status">
          Searching Google Books for “{{ searchedQuery }}”…
        </p>
        <p v-else-if="status === 'empty'">
          No books found for “{{ searchedQuery }}”. Try a different search.
        </p>
        <p v-else-if="status === 'error'" class="book-search__error" role="alert">
          We couldn’t load books right now. Please try again in a moment.
        </p>
        <p v-else>{{ books.length }} books found for “{{ searchedQuery }}”.</p>
      </div>

      <p
        v-if="libraryFeedback"
        class="library-feedback"
        :class="{ 'library-feedback--error': libraryFeedbackType === 'alert' }"
        :role="libraryFeedbackType"
      >
        {{ libraryFeedback }}
      </p>

      <div v-if="status === 'success'" class="book-grid" aria-label="Book search results">
        <BookCard
          v-for="(book, index) in books"
          :key="`${book.source}:${book.sourceId || index}`"
          :book="book"
        >
          <button
            class="book-action-button"
            type="button"
            :disabled="
              !isLibraryLoaded || !getMediaKey(book) || hasLibraryItem(book) || isAdding(book)
            "
            @click="handleAddToLibrary(book)"
          >
            <template v-if="hasLibraryItem(book)">In Library</template>
            <template v-else-if="isAdding(book)">Adding…</template>
            <template v-else-if="!isLibraryLoaded">Loading Library…</template>
            <template v-else>Add to Library</template>
          </button>
        </BookCard>
      </div>
    </section>
  </div>
</template>
