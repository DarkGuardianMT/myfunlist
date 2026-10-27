<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'

const props = defineProps({
  book: {
    type: Object,
    required: true,
  },
})

const coverImageFailed = ref(false)
const detailRoute = computed(() => getMediaDetailRoute(props.book))
const artworkRoute = computed(() => props.book.coverImage && !coverImageFailed.value ? detailRoute.value : null)

watch(
  () => props.book.coverImage,
  () => {
    coverImageFailed.value = false
  },
)
</script>

<template>
  <article class="book-card">
    <component
      :is="artworkRoute ? RouterLink : 'div'"
      class="book-card__cover"
      :to="artworkRoute || undefined"
      :aria-label="artworkRoute ? `View details for ${book.title}` : undefined"
    >
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
    </component>

    <div class="book-card__details">
      <h3>
        <RouterLink v-if="detailRoute" class="media-card-title-link" :to="detailRoute">{{ book.title }}</RouterLink>
        <template v-else>{{ book.title }}</template>
      </h3>
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
