<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  book: {
    type: Object,
    required: true,
  },
})

const coverImageFailed = ref(false)

watch(
  () => props.book.coverImage,
  () => {
    coverImageFailed.value = false
  },
)
</script>

<template>
  <article class="book-card">
    <div class="book-card__cover">
      <img
        v-if="book.coverImage && !coverImageFailed"
        :src="book.coverImage"
        :alt="`Cover of ${book.title}`"
        loading="lazy"
        @error="coverImageFailed = true"
      />
      <div v-else class="book-card__cover-fallback" aria-hidden="true">
        <span>No cover</span>
      </div>
    </div>

    <div class="book-card__details">
      <h3>{{ book.title }}</h3>
      <p class="book-card__authors">
        {{ book.authors.length ? book.authors.join(', ') : 'Unknown author' }}
      </p>
      <p v-if="book.publishedYear" class="book-card__year">{{ book.publishedYear }}</p>
    </div>

    <div v-if="$slots.default" class="book-card__actions">
      <slot />
    </div>
  </article>
</template>
