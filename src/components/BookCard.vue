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
.book-provider-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--color-primary-ink); }
.book-card--compact {
  grid-template-columns: 7.5rem minmax(0, 1fr); grid-template-rows: 1fr auto;
  gap: 0.65rem 1.25rem; padding: 1.25rem; align-items: start;
}
.book-card--compact .book-card__cover { grid-row: 1 / 3; width: 100%; box-shadow: var(--shadow-cover); border-radius: 0.25rem 0.4rem 0.4rem 0.25rem; }
.book-card--compact .book-card__cover img { object-fit: contain; }
.book-card--compact .book-card__cover-fallback { font-family: var(--font-display); font-size: 1rem; font-weight: 400; }
.book-card--compact .book-card__details { display: grid; grid-template-columns: auto 1fr; align-content: start; }
.book-card--compact h3 { grid-column: 1 / -1; font: 500 1.4rem/1.2 var(--font-display); letter-spacing: -0.025em; }
.book-card--compact .media-card-title-link { display: block; }
.book-card__title-preview, .book-card__author-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.book-card__title-preview { max-height: 2.4em; }
.book-card--compact .book-card__authors { grid-column: 1 / -1; margin: 0.45rem 0 0; font-size: var(--text-sm); line-height: 1.4; }
.book-card__publication { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.75rem 0 0.4rem; color: var(--color-text-muted); font-size: var(--text-xs); line-height: 1.5; }
.book-card__publication span + span::before { content: '·'; margin-right: 0.5rem; }
.book-card__metadata { min-width: 0; grid-column: 1; }
.book-card__metadata[open] { grid-column: 1 / -1; }
.book-card__metadata summary { display: flex; align-items: center; min-height: 44px; padding-right: 0.5rem; list-style: none; cursor: pointer; border-radius: 0.25rem; }
.book-card__metadata summary::-webkit-details-marker { display: none; }
.book-card__metadata-hint { color: var(--color-primary-ink); font-size: var(--text-xs); font-weight: 600; line-height: 1.4; }
.book-card__metadata-hint span { display: inline-block; margin-left: 0.2rem; }
.book-card__metadata[open] .book-card__metadata-hint span { transform: rotate(180deg); }
.book-card__full-metadata { max-height: 14rem; overflow: auto; margin: 0 0 0.5rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface-soft); font-size: var(--text-xs); line-height: 1.6; overflow-wrap: anywhere; }
.book-card__full-metadata p { margin: 0; }
.book-card__full-metadata p + p { margin-top: 0.5rem; }
.book-card--compact .book-provider-link { grid-column: 2; justify-self: end; gap: 0.25rem; font-size: var(--text-xs); text-underline-offset: 0.2em; text-align: right; }
.book-card__metadata[open] + .book-provider-link { grid-column: 1 / -1; justify-self: start; }
.book-card__metadata summary:focus-visible, .book-card__full-metadata:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.book-card--compact .book-card__actions { grid-column: 2; padding: 0; align-self: end; }
.book-card--compact :deep(.library-add-button) { min-height: 44px; background: var(--color-primary-soft); color: var(--color-primary-ink); border: 1px solid var(--color-border); font-size: var(--text-xs); }
.book-card--compact :deep(.library-add-button:hover:not(:disabled)) { border-color: var(--color-primary-ink); background: var(--color-primary); color: var(--color-on-primary); }
@media (max-width: 640px) {
  .book-card--compact { grid-template-columns: 6rem minmax(0, 1fr); padding: 1rem; gap: 0.5rem 1rem; }
  .book-card--compact h3 { font-size: 1.25rem; }
  .book-card--compact .book-card__details { grid-template-columns: minmax(0, 1fr); }
  .book-card--compact .book-provider-link { grid-column: 1; justify-self: start; text-align: left; }
  .book-card--compact .book-card__actions { grid-column: 1 / -1; padding-top: 0.5rem; }
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .book-card--compact { transition: border-color 150ms ease, box-shadow 150ms ease; }
  .book-card--compact:hover { transform: none; border-color: var(--color-control-border); box-shadow: var(--shadow-card); }
}
</style>
