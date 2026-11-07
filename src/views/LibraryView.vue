<script setup>
import { computed, ref, watch } from 'vue'
import LibraryItemCard from '../components/LibraryItemCard.vue'
import MediaTypeSelector from '../components/MediaTypeSelector.vue'
import RawgAttribution from '../components/RawgAttribution.vue'
import TmdbAttribution from '../components/TmdbAttribution.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { useAuth } from '../composables/useAuth.js'
import { useLibraryBrowsing } from '../composables/useLibraryBrowsing.js'
import { useCollectionView } from '../composables/useCollectionView.js'
import { useBrowsingReady } from '../router/browsingContext.js'
import { getStatusOptions } from '../domain/libraryMedia.js'
import { getVisibleLibraryItems } from '../utils/libraryDisplay.js'

const busyMediaKeys = ref(new Set())
const feedback = ref('')
const feedbackType = ref('status')
const { mediaTypeFilter, statusFilter, sortOrder, titleQuery } = useLibraryBrowsing()
const { viewMode, selectView } = useCollectionView()
const { currentUser, isAuthLoading, authError } = useAuth()
const {
  libraryItems, displayLibraryItems,
  isLibraryLoaded,
  isLibraryLoading,
  libraryError,
  loadLibrary,
  updateLibraryStatus,
  updateLibraryRating,
  scheduleLibraryRemoval,
} = useLibrary()
const visibleLibraryItems = computed(() =>
  getVisibleLibraryItems(
    displayLibraryItems.value,
    mediaTypeFilter.value,
    statusFilter.value,
    sortOrder.value,
  ).filter(item => !titleQuery.value.trim() || item.media.title.toLocaleLowerCase().includes(titleQuery.value.trim().toLocaleLowerCase())),
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

function handleRemove(item) {
  const mediaKey = item.userMedia.mediaKey
  if (busyMediaKeys.value.has(mediaKey)) return
  feedback.value = ''
  scheduleLibraryRemoval(mediaKey, { expectedId: item.userMedia.id })
}
</script>

<template>
  <div class="library-page">
    <section class="page-intro" aria-labelledby="page-title">
      <div><p class="cinematic-eyebrow">The stories you keep</p><h1 id="page-title">Library</h1>
      <p>A bookshelf. A watchlist. A few worlds you're not quite ready to leave.</p></div>
      <RouterLink class="home-primary-link" to="/discover">Find something new <span aria-hidden="true">↗</span></RouterLink>
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
      <div class="collection-toolbar">
        <div class="collection-search"><label for="library-title-query">Search your Library</label><input id="library-title-query" v-model="titleQuery" type="search" maxlength="200" placeholder="Find a title in your collection…" /></div>
        <div class="collection-view" role="group" aria-label="Library view">
          <button v-for="mode in ['comfortable', 'compact', 'list']" :key="mode" type="button" :aria-pressed="viewMode === mode" @click="selectView(mode)">{{ mode[0].toUpperCase() + mode.slice(1) }}</button>
        </div>
      </div>

      <div class="library-filterbar"><MediaTypeSelector id="library-media-filter" v-model="mediaTypeFilter" label="Library media type" include-all />

      <div class="library-toolbar" role="group" aria-label="Library display options">

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

      </div>
      <div class="collection-caption"><h2 id="saved-media-title">Saved media <span>{{ visibleLibraryItems.length }}</span></h2><p>Collected by you. Enjoyed at your pace.</p></div>

      <div v-if="!visibleLibraryItems.length" class="library-empty" role="status">
        <p v-if="!displayLibraryItems.length">Your Library items are pending removal. Use Undo to keep them.</p>
        <p v-else>No items match the selected filters.</p>
        <button
          class="text-button"
          type="button"
          @click="mediaTypeFilter = 'all'; statusFilter = 'all'; titleQuery = ''"
        >
          Show all media
        </button>
      </div>

      <div v-else class="library-grid collection-grid" :class="[`collection-grid--${viewMode}`, { 'collection-grid--games': mediaTypeFilter === 'game' }]">
        <LibraryItemCard
          v-for="item in visibleLibraryItems"
          :key="item.userMedia.mediaKey"
          :item="item"
          :busy="busyMediaKeys.has(item.userMedia.mediaKey)"
          :layout="viewMode"
          :landscape="mediaTypeFilter === 'game'"
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
