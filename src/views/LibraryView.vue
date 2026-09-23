<script setup>
import { onMounted, ref } from 'vue'
import BookCard from '../components/BookCard.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { BOOK_STATUSES } from '../services/libraryRepository.js'

const statusLabels = {
  'want-to-read': 'Want to read',
  reading: 'Reading',
  finished: 'Finished',
}
const busyMediaKeys = ref(new Set())
const feedback = ref('')
const {
  libraryItems,
  isLibraryLoaded,
  loadLibrary,
  updateLibraryStatus,
  removeLibraryItem,
} = useLibrary()

onMounted(async () => {
  try {
    await loadLibrary()
  } catch {
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
    feedback.value = `The status for “${item.media.title}” could not be updated.`
  } finally {
    busyMediaKeys.value.delete(mediaKey)
  }
}

async function handleRemove(item) {
  const mediaKey = item.userMedia.mediaKey

  busyMediaKeys.value.add(mediaKey)
  feedback.value = ''

  try {
    await removeLibraryItem(mediaKey)
  } catch {
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
      <p>Your saved books and their current reading status.</p>
    </section>

    <p v-if="feedback" class="library-feedback library-feedback--error" role="alert">
      {{ feedback }}
    </p>

    <p v-if="!isLibraryLoaded" class="library-empty" role="status">Loading your Library…</p>
    <p v-else-if="!libraryItems.length" class="library-empty">
      Your Library is empty. Add a book from Discover to get started.
    </p>

    <section v-else aria-labelledby="saved-books-title">
      <h2 id="saved-books-title" class="section-title">Saved books</h2>
      <div class="book-grid">
        <BookCard
          v-for="(item, index) in libraryItems"
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
