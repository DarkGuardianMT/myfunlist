<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import BookCard from '../components/BookCard.vue'
import MovieCard from '../components/MovieCard.vue'
import TmdbAttribution from '../components/TmdbAttribution.vue'
import TvCard from '../components/TvCard.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { searchBooks } from '../services/googleBooks.js'
import {
  getTmdbErrorMessage,
  searchMovies,
  searchTvShows,
} from '../services/tmdb.js'

const discoveryTypes = [
  {
    id: 'book',
    label: 'Books',
    heading: 'Discover books',
    intro: 'Search for your next read using book information from Google Books.',
    searchTitle: 'Search books',
    searchLabel: 'Title, author, or ISBN',
    placeholder: 'For example: The Hobbit',
    idleMessage: 'Enter a title, author, or ISBN to find books.',
    provider: 'Google Books',
    singular: 'book',
    plural: 'books',
  },
  {
    id: 'movie',
    label: 'Movies',
    heading: 'Discover movies',
    intro: 'Search for movies using metadata and artwork from TMDB.',
    searchTitle: 'Search movies',
    searchLabel: 'Movie title',
    placeholder: 'For example: Inception',
    idleMessage: 'Enter a title to find movies.',
    provider: 'TMDB',
    singular: 'movie',
    plural: 'movies',
  },
  {
    id: 'tv',
    label: 'TV Shows',
    heading: 'Discover TV shows',
    intro: 'Search for TV shows using metadata and artwork from TMDB.',
    searchTitle: 'Search TV shows',
    searchLabel: 'TV show title',
    placeholder: 'For example: Breaking Bad',
    idleMessage: 'Enter a title to find TV shows.',
    provider: 'TMDB',
    singular: 'TV show',
    plural: 'TV shows',
  },
]

function createSearchState() {
  return reactive({
    query: '',
    results: [],
    status: 'idle',
    searchedQuery: '',
    errorMessage: '',
  })
}

const activeMediaType = ref('book')
const searchStates = {
  book: createSearchState(),
  movie: createSearchState(),
  tv: createSearchState(),
}
const searchFunctions = {
  book: searchBooks,
  movie: searchMovies,
  tv: searchTvShows,
}
const activeType = computed(
  () => discoveryTypes.find((type) => type.id === activeMediaType.value) || discoveryTypes[0],
)
const activeSearch = computed(() => searchStates[activeMediaType.value])
const activeQuery = computed({
  get: () => activeSearch.value.query,
  set: (value) => {
    activeSearch.value.query = value
  },
})
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

function selectMediaType(mediaType) {
  activeMediaType.value = mediaType
}

async function handleSearch() {
  const mediaType = activeMediaType.value
  const searchState = searchStates[mediaType]
  const trimmedQuery = searchState.query.trim()

  if (!trimmedQuery || searchState.status === 'loading') {
    return
  }

  if (mediaType === 'book') {
    libraryFeedback.value = ''
  }

  searchState.status = 'loading'
  searchState.searchedQuery = trimmedQuery
  searchState.errorMessage = ''

  try {
    searchState.results = await searchFunctions[mediaType](trimmedQuery)
    searchState.status = searchState.results.length ? 'success' : 'empty'
  } catch (error) {
    searchState.results = []
    searchState.status = 'error'
    searchState.errorMessage =
      mediaType === 'book'
        ? 'We couldn’t load books right now. Please try again in a moment.'
        : getTmdbErrorMessage(error)
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
      <h1 id="page-title">{{ activeType.heading }}</h1>
      <p>{{ activeType.intro }}</p>
    </section>

    <div class="discover-type-switcher" role="group" aria-label="Choose a discovery type">
      <button
        v-for="type in discoveryTypes"
        :key="type.id"
        class="discover-type-switcher__button"
        :class="{ 'discover-type-switcher__button--active': activeMediaType === type.id }"
        type="button"
        :aria-pressed="activeMediaType === type.id"
        @click="selectMediaType(type.id)"
      >
        {{ type.label }}
      </button>
    </div>

    <section class="discovery-search" :aria-labelledby="`${activeMediaType}-search-title`">
      <h2 :id="`${activeMediaType}-search-title`">{{ activeType.searchTitle }}</h2>

      <form class="discovery-search__form" role="search" @submit.prevent="handleSearch">
        <label :for="`${activeMediaType}-query`">{{ activeType.searchLabel }}</label>
        <div class="discovery-search__controls">
          <input
            :id="`${activeMediaType}-query`"
            v-model="activeQuery"
            type="search"
            :name="`${activeMediaType}-query`"
            :placeholder="activeType.placeholder"
            maxlength="200"
            autocomplete="off"
          />
          <button
            type="submit"
            :disabled="activeSearch.status === 'loading' || !activeSearch.query.trim()"
          >
            {{ activeSearch.status === 'loading' ? 'Searching…' : 'Search' }}
          </button>
        </div>
      </form>

      <div class="discovery-search__feedback" aria-live="polite" aria-atomic="true">
        <p v-if="activeSearch.status === 'idle'">{{ activeType.idleMessage }}</p>
        <p v-else-if="activeSearch.status === 'loading'" role="status">
          Searching {{ activeType.provider }} for “{{ activeSearch.searchedQuery }}”…
        </p>
        <p v-else-if="activeSearch.status === 'empty'">
          No {{ activeType.plural }} found for “{{ activeSearch.searchedQuery }}”. Try a different
          search.
        </p>
        <p v-else-if="activeSearch.status === 'error'" class="discovery-search__error" role="alert">
          {{ activeSearch.errorMessage }}
        </p>
        <p v-else>
          {{ activeSearch.results.length }}
          {{ activeSearch.results.length === 1 ? activeType.singular : activeType.plural }} found for
          “{{ activeSearch.searchedQuery }}”.
        </p>
      </div>

      <p
        v-if="activeMediaType === 'book' && libraryFeedback"
        class="library-feedback"
        :class="{ 'library-feedback--error': libraryFeedbackType === 'alert' }"
        :role="libraryFeedbackType"
      >
        {{ libraryFeedback }}
        <RouterLink
          v-if="libraryFeedbackType === 'status'"
          class="inline-link"
          to="/library"
        >
          View Library
        </RouterLink>
      </p>

      <div
        v-if="activeMediaType === 'book' && activeSearch.status === 'success'"
        class="book-grid"
        aria-label="Book search results"
      >
        <BookCard
          v-for="(book, index) in activeSearch.results"
          :key="`${book.source}:${book.sourceId || index}`"
          :book="book"
        >
          <button
            class="book-action-button"
            :class="{ 'book-action-button--added': hasLibraryItem(book) }"
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

      <div
        v-else-if="activeMediaType === 'movie' && activeSearch.status === 'success'"
        class="media-grid"
        aria-label="Movie search results"
      >
        <MovieCard
          v-for="(movie, index) in activeSearch.results"
          :key="`${movie.source}:${movie.sourceId || index}`"
          :movie="movie"
        />
      </div>

      <div
        v-else-if="activeMediaType === 'tv' && activeSearch.status === 'success'"
        class="media-grid"
        aria-label="TV show search results"
      >
        <TvCard
          v-for="(show, index) in activeSearch.results"
          :key="`${show.source}:${show.sourceId || index}`"
          :show="show"
        />
      </div>

      <TmdbAttribution v-if="activeMediaType !== 'book'" />
    </section>
  </div>
</template>
