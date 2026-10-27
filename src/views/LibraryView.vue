<script setup>
import { computed, ref, watch } from 'vue'
import LibraryItemCard from '../components/LibraryItemCard.vue'
import RawgAttribution from '../components/RawgAttribution.vue'
import TmdbAttribution from '../components/TmdbAttribution.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { useAuth } from '../composables/useAuth.js'
import { useLibraryBrowsing } from '../composables/useLibraryBrowsing.js'
import { useBrowsingReady } from '../router/browsingContext.js'
import { getStatusOptions } from '../domain/libraryMedia.js'
import { getVisibleLibraryItems } from '../utils/libraryDisplay.js'

const busyMediaKeys = ref(new Set())
const feedback = ref('')
const feedbackType = ref('status')
const { mediaTypeFilter, statusFilter, sortOrder } = useLibraryBrowsing()
const { currentUser, isAuthLoading, authError } = useAuth()
const {
  libraryItems,
  isLibraryLoaded,
  isLibraryLoading,
  libraryError,
  loadLibrary,
  updateLibraryStatus,
  updateLibraryRating,
  removeLibraryItem,
} = useLibrary()
const visibleLibraryItems = computed(() =>
  getVisibleLibraryItems(
    libraryItems.value,
    mediaTypeFilter.value,
    statusFilter.value,
    sortOrder.value,
  ),
)
const statusOptions = computed(() => getStatusOptions(mediaTypeFilter.value))
const hasVisibleGames = computed(() =>
  visibleLibraryItems.value.some((item) => item.media.mediaType === 'game'),
)
const hasVisibleTmdbMedia = computed(() =>
  visibleLibraryItems.value.some((item) => item.media.source === 'tmdb'),
)

useBrowsingReady('/library', computed(() => !isAuthLoading.value && (
  !currentUser.value || isLibraryLoaded.value || Boolean(libraryError.value)
)))

watch([currentUser, isAuthLoading], async () => {
  feedback.value = ''
  busyMediaKeys.value = new Set()
  if (currentUser.value && !isAuthLoading.value) {
    try { await loadLibrary() } catch { /* De gedeelde foutstatus toont de oorzaak. */ }
  }
}, { immediate: true })

async function handleStatusChange(item, event) {
  const accountId = currentUser.value?.id
  const mediaKey = item.userMedia.mediaKey
  const control = event.target
  busyMediaKeys.value.add(mediaKey)
  feedback.value = ''

  try {
    await updateLibraryStatus(mediaKey, control.value)
  } catch {
    if (currentUser.value?.id !== accountId) return
    control.value = item.userMedia.status
    feedbackType.value = 'alert'
    feedback.value = `The status for “${item.media.title}” could not be updated.`
  } finally {
    if (currentUser.value?.id === accountId) busyMediaKeys.value.delete(mediaKey)
  }
}

async function handleRatingChange(item, event) {
  const accountId = currentUser.value?.id
  const mediaKey = item.userMedia.mediaKey
  const control = event.target
  const rating = control.value === '' ? null : Number(control.value)
  busyMediaKeys.value.add(mediaKey)
  feedback.value = ''

  try {
    await updateLibraryRating(mediaKey, rating)
  } catch {
    if (currentUser.value?.id !== accountId) return
    control.value = item.userMedia.rating ?? ''
    feedbackType.value = 'alert'
    feedback.value = `The rating for “${item.media.title}” could not be updated.`
  } finally {
    if (currentUser.value?.id === accountId) busyMediaKeys.value.delete(mediaKey)
  }
}

async function handleRemove(item) {
  const accountId = currentUser.value?.id
  const mediaKey = item.userMedia.mediaKey
  busyMediaKeys.value.add(mediaKey)
  feedback.value = ''

  try {
    const removed = await removeLibraryItem(mediaKey)
    if (currentUser.value?.id !== accountId) return
    if (!removed) throw new Error('Library item was not found')
    feedbackType.value = 'status'
    feedback.value = `“${item.media.title}” was removed from your Library.`
  } catch {
    if (currentUser.value?.id !== accountId) return
    feedbackType.value = 'alert'
    feedback.value = `“${item.media.title}” could not be removed.`
  } finally {
    if (currentUser.value?.id === accountId) busyMediaKeys.value.delete(mediaKey)
  }
}
</script>

<template>
  <div class="library-page">
    <section class="page-intro" aria-labelledby="page-title">
      <h1 id="page-title">Library</h1>
      <p>Your saved books, movies, TV shows, games, statuses, and personal ratings.</p>
    </section>

    <p
      v-if="feedback"
      class="library-feedback"
      :class="{ 'library-feedback--error': feedbackType === 'alert' }"
      :role="feedbackType"
    >
      {{ feedback }}
    </p>

    <p v-if="isAuthLoading" class="library-empty" role="status">Checking your session…</p>
    <div v-else-if="!currentUser" class="library-empty">
      <p>{{ authError || 'Log in or register to view your account Library.' }}</p>
      <RouterLink class="inline-link" to="/login">Login</RouterLink>
      <RouterLink class="inline-link" to="/register">Register</RouterLink>
    </div>
    <div v-else-if="libraryError" class="library-empty" role="alert">
      <p>Your Library could not be loaded. {{ libraryError }}</p>
      <button class="text-button" type="button" @click="loadLibrary()">Try again</button>
    </div>
    <p v-else-if="isLibraryLoading || !isLibraryLoaded" class="library-empty" role="status">Loading your Library…</p>
    <div v-else-if="!libraryItems.length" class="library-empty">
      <p>Your Library is empty.</p>
      <RouterLink class="inline-link" to="/discover">Discover media to add</RouterLink>
    </div>

    <section v-else aria-labelledby="saved-media-title">
      <h2 id="saved-media-title" class="section-title">Saved media</h2>

      <div class="library-toolbar" role="group" aria-label="Library display options">
        <div class="library-toolbar__field">
          <label for="library-media-filter">Media type</label>
          <select id="library-media-filter" v-model="mediaTypeFilter">
            <option value="all">All</option>
            <option value="book">Books</option>
            <option value="movie">Movies</option>
            <option value="tv">TV Shows</option>
            <option value="game">Games</option>
          </select>
        </div>

        <div v-if="mediaTypeFilter !== 'all'" class="library-toolbar__field">
          <label for="library-status-filter">Filter by status</label>
          <select id="library-status-filter" v-model="statusFilter">
            <option value="all">All statuses</option>
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="library-toolbar__field">
          <label for="library-sort-order">Sort by</label>
          <select id="library-sort-order" v-model="sortOrder">
            <option value="recent">Recently Added</option>
            <option value="title">Title A–Z</option>
            <option value="rating-high-low">Rating High–Low</option>
            <option value="rating-low-high">Rating Low–High</option>
          </select>
        </div>
      </div>

      <div v-if="!visibleLibraryItems.length" class="library-empty" role="status">
        <p>No items match the selected filters.</p>
        <button
          class="text-button"
          type="button"
          @click="mediaTypeFilter = 'all'; statusFilter = 'all'"
        >
          Show all media
        </button>
      </div>

      <div v-else class="library-grid">
        <LibraryItemCard
          v-for="item in visibleLibraryItems"
          :key="item.userMedia.mediaKey"
          :item="item"
          :busy="busyMediaKeys.has(item.userMedia.mediaKey)"
          @status-change="handleStatusChange"
          @rating-change="handleRatingChange"
          @remove="handleRemove"
        />
      </div>
      <TmdbAttribution v-if="hasVisibleTmdbMedia" />
      <RawgAttribution v-if="hasVisibleGames" />
    </section>
  </div>
</template>
