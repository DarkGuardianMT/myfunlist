<script setup>
import { computed, ref, watch } from 'vue'
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

const { activeMediaType, activeSearch, activeQuery, selectMediaType, handleSearch } = useDiscoverSearch()
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

watch([currentUser, isAuthLoading], async () => {
  libraryFeedback.value = ''
  addingMediaKeys.value = new Set()
  if (!currentUser.value || isAuthLoading.value) return
  try { await loadLibrary() } catch { /* De gedeelde foutstatus toont de oorzaak. */ }
}, { immediate: true })

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
  return { [activeResultPresentation.value.prop]: media }
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
