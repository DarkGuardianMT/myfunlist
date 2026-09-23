<script setup>
defineProps({
  book: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <article class="book-card">
    <div class="book-card__cover">
      <img
        v-if="book.coverImage"
        :src="book.coverImage"
        :alt="`Cover of ${book.title}`"
        loading="lazy"
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
      <div v-if="$slots.default" class="book-card__actions">
        <slot />
      </div>
    </div>
  </article>
</template>
