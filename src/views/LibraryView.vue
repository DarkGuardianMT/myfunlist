<script setup>
import { computed, onMounted, ref } from 'vue'
import BookCard from '../components/BookCard.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { BOOK_RATINGS, BOOK_STATUSES } from '../services/libraryRepository.js'
import { getVisibleLibraryItems } from '../utils/libraryDisplay.js'

const statusLabels = {
  'want-to-read': 'Want to read',
  reading: 'Reading',
  finished: 'Finished',
}
const busyMediaKeys = ref(new Set())
const feedback = ref('')
const feedbackType = ref('status')
const statusFilter = ref('all')
const sortOrder = ref('recent')
const {
  libraryItems,
  isLibraryLoaded,
  loadLibrary,
  updateLibraryStatus,
  updateLibraryRating,
  removeLibraryItem,
} = useLibrary()
const visibleLibraryItems = computed(() =>
  getVisibleLibraryItems(libraryItems.value, statusFilter.value, sortOrder.value),
)

onMounted(async () => {
  try {
    await loadLibrary()
  } catch {
    feedbackType.value = 'alert'
    feedback.value = 'Your Library could not be loaded.'
  }
})

async function handleStatusChange(item, event) {
  const mediaKey = item.userMedia.mediaKey
  const statusControl = event.target

  busyMediaKeys.value.add(mediaKey)
  feedback.value = ''

  try {
    await updateLibraryStatus(mediaKey, statusControl.value)
  } catch {
    statusControl.value = item.userMedia.status
    feedbackType.value = 'alert'
    feedback.value = `The status for “${item.media.title}” could not be updated.`
  } finally {
    busyMediaKeys.value.delete(mediaKey)
  }
}

async function handleRatingChange(item, event) {
  const mediaKey = item.userMedia.mediaKey
  const ratingControl = event.target
  const rating = ratingControl.value === '' ? null : Number(ratingControl.value)

  busyMediaKeys.value.add(mediaKey)
  feedback.value = ''

  try {
    await updateLibraryRating(mediaKey, rating)
  } catch {
    ratingControl.value = item.userMedia.rating ?? ''
    feedbackType.value = 'alert'
    feedback.value = `The rating for “${item.media.title}” could not be updated.`
  } finally {
    busyMediaKeys.value.delete(mediaKey)
  }
}

async function handleRemove(item) {
  const mediaKey = item.userMedia.mediaKey

  busyMediaKeys.value.add(mediaKey)
  feedback.value = ''

  try {
    const removed = await removeLibraryItem(mediaKey)

    if (!removed) {
      throw new Error('Library item was not found')
    }

    feedbackType.value = 'status'
    feedback.value = `“${item.media.title}” was removed from your Library.`
  } catch {
    feedbackType.value = 'alert'
    feedback.value = `“${item.media.title}” could not be removed.`
  } finally {
    busyMediaKeys.value.delete(mediaKey)
  }
}
</script>

<template>
  <div class="library-page">
    <section class="page-intro" aria-labelledby="page-title">
      <h1 id="page-title">Library</h1>
      <p>Your saved books, reading statuses, and personal ratings.</p>
    </section>

    <p
      v-if="feedback"
      class="library-feedback"
      :class="{ 'library-feedback--error': feedbackType === 'alert' }"
      :role="feedbackType"
    >
      {{ feedback }}
    </p>

    <p v-if="!isLibraryLoaded" class="library-empty" role="status">Loading your Library…</p>
    <div v-else-if="!libraryItems.length" class="library-empty">
      <p>Your Library is empty.</p>
      <RouterLink class="inline-link" to="/discover">Discover books to add</RouterLink>
    </div>

    <section v-else aria-labelledby="saved-books-title">
      <h2 id="saved-books-title" class="section-title">Saved books</h2>

      <div class="library-toolbar" role="group" aria-label="Library display options">
        <div class="library-toolbar__field">
          <label for="library-status-filter">Filter by status</label>
          <select id="library-status-filter" v-model="statusFilter">
            <option value="all">All</option>
            <option value="want-to-read">Want to Read</option>
            <option value="reading">Reading</option>
            <option value="finished">Finished</option>
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
        <p>No books match the selected status filter.</p>
        <button class="text-button" type="button" @click="statusFilter = 'all'">
          Show all books
        </button>
      </div>

      <div v-else class="book-grid">
        <BookCard
          v-for="(item, index) in visibleLibraryItems"
          :key="item.userMedia.mediaKey"
          :book="item.media"
        >
          <div class="library-item-controls">
            <label :for="`book-status-${index}`">Reading status</label>
            <select
              :id="`book-status-${index}`"
              :value="item.userMedia.status"
              :disabled="busyMediaKeys.has(item.userMedia.mediaKey)"
              :aria-label="`Reading status for ${item.media.title}`"
              @change="handleStatusChange(item, $event)"
            >
              <option v-for="bookStatus in BOOK_STATUSES" :key="bookStatus" :value="bookStatus">
                {{ statusLabels[bookStatus] }}
              </option>
            </select>
            <p class="personal-rating">
              Personal rating:
              <strong>
                {{ item.userMedia.rating === null ? 'Unrated' : `${item.userMedia.rating} / 10` }}
              </strong>
            </p>
            <label :for="`book-rating-${index}`">Personal rating</label>
            <select
              :id="`book-rating-${index}`"
              :value="item.userMedia.rating ?? ''"
              :disabled="busyMediaKeys.has(item.userMedia.mediaKey)"
              :aria-label="`Personal rating for ${item.media.title}`"
              @change="handleRatingChange(item, $event)"
            >
              <option value="">Not rated</option>
              <option v-for="rating in BOOK_RATINGS" :key="rating" :value="rating">
                {{ rating }} / 10
              </option>
            </select>
            <button
              class="remove-button"
              type="button"
              :disabled="busyMediaKeys.has(item.userMedia.mediaKey)"
              :aria-label="`Remove ${item.media.title} from Library`"
              @click="handleRemove(item)"
            >
              Remove from Library
            </button>
          </div>
        </BookCard>
      </div>
    </section>
  </div>
</template>
