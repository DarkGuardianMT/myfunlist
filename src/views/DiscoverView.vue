<script setup>
import { ref } from 'vue'
import BookCard from '../components/BookCard.vue'
import { searchBooks } from '../services/googleBooks.js'

const query = ref('')
const books = ref([])
const status = ref('idle')
const searchedQuery = ref('')

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

      <div v-if="status === 'success'" class="book-grid" aria-label="Book search results">
        <BookCard
          v-for="(book, index) in books"
          :key="`${book.source}:${book.sourceId || index}`"
          :book="book"
        />
      </div>
    </section>
  </div>
</template>
