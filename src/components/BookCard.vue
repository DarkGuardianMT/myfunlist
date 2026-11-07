<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'

const props = defineProps({
  book: {
    type: Object,
    required: true,
  },
  showProviderLink: { type: Boolean, default: false },
  compactMetadata: { type: Boolean, default: false },
  poster: { type: Boolean, default: false },
})

const coverImageFailed = ref(false)
const detailRoute = computed(() => getMediaDetailRoute(props.book))
const artworkRoute = computed(() => props.book.coverImage && !coverImageFailed.value ? detailRoute.value : null)
const authorText = computed(() => (Array.isArray(props.book.authors)
  ? props.book.authors.filter((author) => typeof author === 'string' && author.trim()).join(', ')
  : '') || 'Unknown author')
const languageLabel = computed(() => ({ en: 'English', nl: 'Dutch', tr: 'Turkish' })[props.book.language] || props.book.language || 'Unknown language')

watch(
  () => props.book.coverImage,
  () => {
    coverImageFailed.value = false
  },
)
</script>

<template>
  <article class="book-card" :class="{ 'book-card--compact': compactMetadata, 'book-card--poster': poster }">
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
      <p v-if="compactMetadata" class="book-card__authors book-card__author-preview">{{ authorText }}</p>
      <p v-if="compactMetadata" class="book-card__publication">
        <span>{{ book.publishedYear || 'Year unknown' }}</span>
        <span v-if="showProviderLink">{{ languageLabel }}</span>
      </p>
      <details v-if="compactMetadata" class="book-card__metadata">
        <summary>
          <span class="book-card__metadata-hint">Full info <span aria-hidden="true">▾</span></span>
        </summary>
        <div class="book-card__full-metadata" role="region" :aria-label="`Full title and authors for ${book.title}`" tabindex="0">
          <p><strong>Title:</strong> {{ book.title }}</p>
          <p><strong>Authors:</strong> {{ authorText }}</p>
          <p v-if="showProviderLink"><strong>Language tag:</strong> {{ book.language || 'Unknown' }}</p>
        </div>
      </details>
      <p v-else class="book-card__authors">{{ authorText }}</p>
      <a v-if="showProviderLink && book.source === 'google-books' && detailRoute" class="book-provider-link" :href="'https://books.google.com/books?id=' + encodeURIComponent(book.sourceId)" target="_blank" rel="noopener noreferrer">View on Google Books</a>
      <p v-if="showProviderLink && !compactMetadata">Language tag: {{ book.language || 'Unknown' }}</p>
      <p v-if="book.publishedYear && !compactMetadata" class="book-card__year">{{ book.publishedYear }}</p>
    </div>

    <div v-if="$slots.default" class="book-card__actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.book-provider-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--color-primary-ink); font-size: 0.75rem; text-underline-offset: 0.2em; }
.book-card--compact { grid-template-columns: 7.5rem minmax(0, 1fr); grid-template-rows: 1fr auto; gap: 0.65rem 1.25rem; padding: 1.25rem; align-items: start; }
.book-card--compact .book-card__cover { grid-row: 1 / 3; width: 100%; }
.book-card__cover img { object-fit: contain; }
.book-card__details { min-width: 0; }
.book-card__title-preview, .book-card__author-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.book-card__publication { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.5rem 0; color: var(--color-text-muted); font-size: 0.75rem; line-height: 1.5; }
.book-card__publication span + span::before { content: '·'; margin-right: 0.4rem; }
.book-card__metadata summary { display: flex; align-items: center; min-height: 44px; cursor: pointer; list-style: none; }
.book-card__metadata summary::-webkit-details-marker { display: none; }
.book-card__metadata-hint { color: var(--color-text-muted); font-size: 0.8125rem; }
.book-card__metadata-hint span { display: inline-block; margin-left: 0.25rem; }
.book-card__metadata[open] .book-card__metadata-hint span { transform: rotate(180deg); }
.book-card__full-metadata { max-height: 18rem; overflow: auto; margin-bottom: 0.5rem; padding: 0.9rem; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface); font-size: 0.8125rem; line-height: 1.7; overflow-wrap: anywhere; }
.book-card__full-metadata p { margin: 0; }
.book-card__full-metadata p + p { margin-top: 0.5rem; }
.book-card--compact .book-card__actions { grid-column: 2; }
.book-card__metadata summary:focus-visible, .book-card__full-metadata:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.book-card--poster.book-card--compact { display: flex; flex-direction: column; align-items: stretch; padding: 0; gap: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.book-card--poster .book-card__cover { width: 100%; aspect-ratio: 2 / 3; border: 1px solid var(--color-border); border-radius: var(--radius-card); box-shadow: none; }
.book-card--poster .book-card__cover img { padding: 0.4rem; }
.book-card--poster .book-card__details { padding-top: 0.9rem; }
.book-card--poster h3 { font: 650 1rem/1.4 var(--font-body); letter-spacing: -0.015em; margin: 0; min-height: 2.8em; }
.book-card--poster .book-card__authors { font-size: 0.8125rem; line-height: 1.5; margin-top: 0.4rem; min-height: 3em; }
.book-card--poster .book-card__metadata { display: block; }
.book-card--poster .book-provider-link { margin-bottom: 0.5rem; }
.book-card--poster .book-card__actions { align-self: stretch; margin-top: auto; padding-top: 0.5rem; }
.book-card--poster:hover { transform: none; }
@media (max-width: 640px) {
  .book-card--compact { grid-template-columns: 6rem minmax(0, 1fr); padding: 1rem; gap: 0.5rem 1rem; }
  .book-card--compact .book-card__actions { grid-column: 1 / -1; }
  .book-card--poster h3 { font-size: 0.9375rem; }
}
</style>
