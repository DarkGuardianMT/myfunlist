<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'

const props = defineProps({
  book: {
    type: Object,
    required: true,
  },
  compactMetadata: { type: Boolean, default: false },
})

const coverImageFailed = ref(false)
const detailRoute = computed(() => getMediaDetailRoute(props.book))
const artworkRoute = computed(() => props.book.coverImage && !coverImageFailed.value ? detailRoute.value : null)
const authorText = computed(() => (Array.isArray(props.book.authors)
  ? props.book.authors.filter((author) => typeof author === 'string' && author.trim()).join(', ')
  : '') || 'Unknown author')

watch(
  () => props.book.coverImage,
  () => {
    coverImageFailed.value = false
  },
)
</script>

<template>
  <article class="book-card" :class="{ 'book-card--compact': compactMetadata }">
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
        <RouterLink v-if="detailRoute" class="media-card-title-link" :to="detailRoute">
          <span :class="{ 'book-card__title-preview': compactMetadata }">{{ book.title }}</span>
        </RouterLink>
        <span v-else :class="{ 'book-card__title-preview': compactMetadata }">{{ book.title }}</span>
      </h3>
      <details v-if="compactMetadata" class="book-card__metadata">
        <summary>
          <span class="book-card__authors book-card__author-preview">{{ authorText }}</span>
          <span class="book-card__metadata-hint">Full info <span aria-hidden="true">▾</span></span>
        </summary>
        <div class="book-card__full-metadata" role="region" :aria-label="`Full title and authors for ${book.title}`" tabindex="0">
          <p><strong>Title:</strong> {{ book.title }}</p>
          <p><strong>Authors:</strong> {{ authorText }}</p>
        </div>
      </details>
      <p v-else class="book-card__authors">{{ authorText }}</p>
      <p v-if="book.publishedYear" class="book-card__year">{{ book.publishedYear }}</p>
    </div>

    <div v-if="$slots.default" class="book-card__actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.book-card--compact { grid-template-columns: 5.5rem minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; align-items: start; }
.book-card--compact .media-card-title-link { display: block; }
.book-card__title-preview, .book-card__author-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.book-card__title-preview { max-height: 2.7em; }
.book-card__metadata { min-width: 0; margin-top: 0.45rem; }
.book-card__metadata summary { min-height: 44px; list-style: none; cursor: pointer; border-radius: 0.25rem; }
.book-card__metadata summary::-webkit-details-marker { display: none; }
.book-card__metadata .book-card__authors { max-height: 2.9em; margin: 0; }
.book-card__metadata-hint { display: block; margin-top: 0.2rem; color: var(--color-primary-ink); font-size: 0.75rem; line-height: 1.4; text-decoration: underline; text-underline-offset: 0.15em; }
.book-card__metadata[open] .book-card__metadata-hint span { display: inline-block; transform: rotate(180deg); }
.book-card__full-metadata { max-height: 12rem; overflow: auto; margin-top: 0.5rem; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.35rem; background: var(--color-surface-soft); font-size: 0.85rem; line-height: 1.5; overflow-wrap: anywhere; }
.book-card__full-metadata p { margin: 0; }
.book-card__full-metadata p + p { margin-top: 0.5rem; }
.book-card__metadata summary:focus-visible, .book-card__full-metadata:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.book-card--compact .book-card__actions { align-self: end; }
</style>
