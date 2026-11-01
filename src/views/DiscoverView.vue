<script setup>
import { computed, ref, watch } from 'vue'
import OpenLibraryDiscover from '../components/OpenLibraryDiscover.vue'
import BookCard from '../components/BookCard.vue'
import GameCard from '../components/GameCard.vue'
import LibraryAddButton from '../components/LibraryAddButton.vue'
import MovieCard from '../components/MovieCard.vue'
import RawgAttribution from '../components/RawgAttribution.vue'
import TmdbAttribution from '../components/TmdbAttribution.vue'
import TvCard from '../components/TvCard.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { useAuth } from '../composables/useAuth.js'
import { useDiscoverSearch } from '../composables/useDiscoverSearch.js'

const discoveryTypes = [
  {
    id: 'book',
    label: 'Books',
    heading: 'Discover books',
    intro: 'Choose a book catalogue to discover books and inspect publication information.',
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
  {
    id: 'game',
    label: 'Games',
    heading: 'Discover games',
    intro: 'Search for games using information and artwork from RAWG.',
    searchTitle: 'Search games',
    searchLabel: 'Game title',
    placeholder: 'For example: Stardew Valley',
    idleMessage: 'Enter a title to find games.',
    provider: 'RAWG',
    singular: 'game',
    plural: 'games',
  },
]

const { bookProvider, setBookProvider, activeMediaType, activeSearch, activeQuery, bookFilters, bookFilterAdvice,
  setBookFilter, selectMediaType, handleSearch } = useDiscoverSearch()
const bookSearchLabel = computed(() => ({ all: 'Title, author, or ISBN', title: 'Book title', author: 'Author name' })[bookFilters.value.field])
const bookLanguageLabel = computed(() => ({ en: 'English', nl: 'Dutch', tr: 'Turkish' })[bookFilters.value.language])
const resultPresentation = {
  book: { component: BookCard, prop: 'book', grid: 'book-grid', label: 'Book search results' },
  movie: { component: MovieCard, prop: 'movie', grid: 'media-grid', label: 'Movie search results' },
  tv: { component: TvCard, prop: 'show', grid: 'media-grid', label: 'TV show search results' },
  game: { component: GameCard, prop: 'game', grid: 'game-grid', label: 'Game search results' },
}
const activeType = computed(
  () => discoveryTypes.find((type) => type.id === activeMediaType.value) || discoveryTypes[0],
)
const activeResultPresentation = computed(() => resultPresentation[activeMediaType.value])
const addingMediaKeys = ref(new Set())
const libraryFeedback = ref('')
const libraryFeedbackType = ref('status')
const { currentUser, isAuthLoading } = useAuth()
const {
  isLibraryLoaded,
  libraryError,
  loadLibrary,
  getMediaKey,
  hasLibraryItem,
  addLibraryItem,
} = useLibrary()

async function loadActiveLibrary() {
  if (!currentUser.value || isAuthLoading.value) return
  if (activeMediaType.value === 'book' && bookProvider.value === 'open-library') return
  try { await loadLibrary() } catch { /* De gedeelde foutstatus toont de oorzaak. */ }
}

watch([currentUser, isAuthLoading], async () => {
  libraryFeedback.value = ''
  addingMediaKeys.value = new Set()
  await loadActiveLibrary()
}, { immediate: true })
watch([activeMediaType, bookProvider], loadActiveLibrary)

watch([activeMediaType, activeSearch], () => { libraryFeedback.value = '' })

async function handleAddToLibrary(media) {
  if (!currentUser.value) {
    libraryFeedbackType.value = 'alert'
    libraryFeedback.value = 'Log in or register to add items to your Library.'
    return
  }
  const mediaKey = getMediaKey(media)

  if (!mediaKey || hasLibraryItem(media) || addingMediaKeys.value.has(mediaKey)) {
    return
  }

  addingMediaKeys.value.add(mediaKey)
  const accountId = currentUser.value.id
  libraryFeedback.value = ''

  try {
    const result = await addLibraryItem(media)
    if (currentUser.value?.id !== accountId) return
    libraryFeedbackType.value = 'status'
    libraryFeedback.value = result.added
      ? `“${media.title}” was added to your Library.`
      : `“${media.title}” is already in your Library.`
  } catch {
    if (currentUser.value?.id !== accountId) return
    libraryFeedbackType.value = 'alert'
    libraryFeedback.value = 'This item could not be added. Please try again.'
  } finally {
    if (currentUser.value?.id === accountId) addingMediaKeys.value.delete(mediaKey)
  }
}

function isAdding(media) {
  const mediaKey = getMediaKey(media)

  return Boolean(mediaKey && addingMediaKeys.value.has(mediaKey))
}

function cardProps(media) {
  return { [activeResultPresentation.value.prop]: media,
    ...(activeMediaType.value === 'book' ? { compactMetadata: true, showProviderLink: true } : {}) }
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

    <div v-if="activeMediaType === 'book'" class="book-provider-choice">
      <label for="book-provider">Book catalogue</label>
      <select id="book-provider" :value="bookProvider" @change="setBookProvider($event.target.value)">
        <option value="open-library">Open Library</option>
        <option value="google-books">Google Books (secondary option)</option>
      </select>
    </div>
    <OpenLibraryDiscover v-if="activeMediaType === 'book' && bookProvider === 'open-library'" />
    <section v-else class="discovery-search" :aria-labelledby="`${activeMediaType}-search-title`">
      <h2 :id="`${activeMediaType}-search-title`">{{ activeType.searchTitle }}</h2>

      <p v-if="activeMediaType === 'book'" class="google-attribution"><a href="https://books.google.com" target="_blank" rel="noopener noreferrer"><img src="https://books.google.com/googlebooks/images/poweredby.png" alt="Powered by Google" /></a></p>
      <form class="discovery-search__form" role="search" @submit.prevent="handleSearch">
        <label :for="`${activeMediaType}-query`">{{ activeMediaType === 'book' ? bookSearchLabel : activeType.searchLabel }}</label>
        <div class="discovery-search__controls">
          <input
            :id="`${activeMediaType}-query`"
            v-model="activeQuery"
            type="search"
            :name="`${activeMediaType}-query`"
            :placeholder="activeMediaType === 'book' && bookFilters.field === 'author' ? 'For example: Ursula Le Guin' : activeType.placeholder"
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
        <div v-if="activeMediaType === 'book'" class="book-search-filters">
          <div>
            <label for="book-search-field">Search in</label>
            <select id="book-search-field" :value="bookFilters.field" @change="setBookFilter('field', $event.target.value)">
              <option value="all">All fields</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
            </select>
          </div>
          <div>
            <label for="book-search-language">Language</label>
            <select id="book-search-language" :value="bookFilters.language" @change="setBookFilter('language', $event.target.value)">
              <option value="any">Any language</option>
              <option value="en">English</option>
              <option value="nl">Dutch</option>
              <option value="tr">Turkish</option>
            </select>
          </div>
        </div>
      </form>

      <div class="discovery-search__feedback" aria-live="polite" aria-atomic="true">
        <p v-if="activeSearch.status === 'idle'">{{ activeType.idleMessage }}</p>
        <p v-else-if="activeSearch.status === 'loading'" role="status">
          Searching {{ activeType.provider }} for “{{ activeSearch.searchedQuery }}”…
        </p>
        <p v-else-if="activeSearch.status === 'empty'">
          No {{ activeType.plural }} found for “{{ activeSearch.searchedQuery }}”. Try a different
          search.<template v-if="bookFilterAdvice"> {{ bookFilterAdvice }}</template>
        </p>
        <p v-else-if="activeSearch.status === 'error'" class="discovery-search__error" role="alert">
          {{ activeSearch.errorMessage }}
        </p>
        <p v-else>
          {{ activeSearch.results.length }}
          {{ activeSearch.results.length === 1 ? activeType.singular : activeType.plural }} found for
          “{{ activeSearch.searchedQuery }}”.
        </p>
        <p v-if="activeMediaType === 'book' && bookLanguageLabel" class="book-language-notice">
          Requested {{ bookLanguageLabel }} from Google Books. Its language restriction can be unreliable; all returned results remain visible in provider order. Check each book's metadata.
        </p>
      </div>

      <p
        v-if="libraryFeedback"
        class="library-feedback"
        :class="{ 'library-feedback--error': libraryFeedbackType === 'alert' }"
        :role="libraryFeedbackType"
      >
        {{ libraryFeedback }}
        <template v-if="!currentUser">
          <RouterLink class="inline-link" to="/login">Login</RouterLink>
          <RouterLink class="inline-link" to="/register">Register</RouterLink>
        </template>
        <RouterLink
          v-if="libraryFeedbackType === 'status'"
          class="inline-link"
          to="/library"
        >
          View Library
        </RouterLink>
      </p>

      <p v-if="currentUser && libraryError" class="library-feedback library-feedback--error" role="alert">
        Your Library could not be loaded.
        <button class="text-button" type="button" @click="loadLibrary()">Try again</button>
      </p>

      <button v-if="activeSearch.status === 'error'" type="button" @click="handleSearch">Retry search</button>
      <p v-if="activeMediaType === 'book' && activeSearch.status === 'success'">Google Books search results</p>
      <div
        v-if="activeSearch.status === 'success'"
        :class="activeResultPresentation.grid"
        :aria-label="activeResultPresentation.label"
      >
        <component
          :is="activeResultPresentation.component"
          v-for="(media, index) in activeSearch.results"
          :key="getMediaKey(media) || index"
          v-bind="cardProps(media)"
        >
          <LibraryAddButton
            :media="media"
            :is-library-loaded="isLibraryLoaded"
            :is-anonymous="!currentUser && !isAuthLoading"
            :has-load-error="Boolean(libraryError)"
            :is-added="hasLibraryItem(media)"
            :is-adding="isAdding(media)"
            :has-identity="Boolean(getMediaKey(media))"
            @add="handleAddToLibrary"
          />
        </component>
      </div>

      <TmdbAttribution v-if="activeMediaType === 'movie' || activeMediaType === 'tv'" />
      <RawgAttribution v-if="activeMediaType === 'game'" />
    </section>
  </div>
</template>

<style scoped>
.book-provider-choice { margin: 1rem 0; }
.book-provider-choice label { display: block; margin-bottom: 0.5rem; }
.book-provider-choice select { width: 100%; min-height: 44px; padding: 0.6rem; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-control-border); border-radius: 0.5rem; font: inherit; }
.book-provider-choice select:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.google-attribution img { background: white; padding: 0.5rem; max-width: 100%; }

.book-search-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin-top: 1rem; }
.book-search-filters > div { min-width: 0; }
.book-search-filters label { font-size: 0.85rem; }
.book-search-filters select { width: 100%; min-width: 0; min-height: 44px; padding: 0.5rem; border: 1px solid var(--color-control-border); border-radius: 0.55rem; background: var(--color-surface); color: var(--color-text); font: inherit; }
.book-search-filters select:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
@media (max-width: 400px) {
  .book-search-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .book-search-filters > div:last-child { grid-column: 1 / -1; }
}
</style>
