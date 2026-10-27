<script setup>
import { computed, ref, watch } from 'vue'
import { getBookClassificationLabels } from '../utils/bookClassifications.js'

const props = defineProps({ media: { type: Object, required: true } })
const artworkFailed = ref(false)
const backdropFailed = ref(false)
const typeLabels = { book: 'Book', movie: 'Movie', tv: 'TV show', game: 'Game' }
const dateFields = { book: ['publishedDate', 'Published'], movie: ['releaseDate', 'Released'],
  tv: ['firstAirDate', 'First aired'], game: ['releaseDate', 'Released'] }
const date = computed(() => {
  const [field, label] = dateFields[props.media.mediaType]
  return { value: props.media.details[field], label }
})
const hasArtwork = computed(() => props.media.artworkImage && !artworkFailed.value)
const authors = computed(() => props.media.mediaType === 'book' ? props.media.details.authors?.join(', ') : '')
const genres = computed(() => props.media.mediaType === 'book'
  ? getBookClassificationLabels(props.media.genres).slice(0, 3) : props.media.genres || [])
watch(() => props.media.artworkImage, () => { artworkFailed.value = false })
watch(() => props.media.backdropImage, () => { backdropFailed.value = false })
</script>

<template>
  <header class="media-detail-hero">
    <div v-if="media.backdropImage && !backdropFailed" class="media-detail-hero__backdrop" aria-hidden="true">
      <img :key="media.backdropImage" :src="media.backdropImage" alt="" decoding="async" @error="backdropFailed = true" />
    </div>
    <div class="media-detail-hero__body" :class="{ 'media-detail-hero__body--text-only': !hasArtwork }">
      <div class="media-detail-hero__content">
        <p class="media-detail-hero__type">{{ typeLabels[media.mediaType] }}</p>
        <h1 id="media-title">{{ media.title }}</h1>
        <p v-if="authors" class="media-detail-hero__authors">By {{ authors }}</p>
        <p v-if="date.value" class="media-detail-hero__date">
          {{ date.label }} <time :datetime="date.value">{{ date.value }}</time>
        </p>
      </div>
      <div v-if="hasArtwork" class="media-detail-hero__artwork">
        <img :key="media.artworkImage" :src="media.artworkImage" :alt="`Artwork for ${media.title}`" decoding="async" @error="artworkFailed = true" />
      </div>
      <ul v-if="genres.length" class="media-detail-hero__genres" :class="{ 'media-detail-hero__genres--book': media.mediaType === 'book' }" aria-label="Genres">
        <li v-for="genre in genres" :key="genre" :title="genre">{{ genre }}</li>
      </ul>
      <div v-if="$slots.default" class="media-detail-hero__actions"><slot /></div>
      <section v-if="media.description" class="media-detail-hero__synopsis" aria-labelledby="media-synopsis-title">
        <h2 id="media-synopsis-title">Synopsis</h2>
        <p class="media-detail-hero__description">{{ media.description }}</p>
      </section>
    </div>
  </header>
</template>

<style scoped>
.media-detail-hero {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}
.media-detail-hero__backdrop { height: clamp(96px, 10vw, 140px); background: var(--color-surface-soft); }
.media-detail-hero__backdrop img { display: block; width: 100%; height: 100%; object-fit: cover; }
.media-detail-hero__body { display: grid; grid-template-columns: minmax(140px, 200px) minmax(0, 1fr); grid-template-areas: 'artwork identity' 'artwork genres' 'artwork actions' 'synopsis synopsis'; gap: 1rem 1.5rem; padding: 2rem; }
.media-detail-hero__body--text-only { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'identity' 'genres' 'actions' 'synopsis'; }
.media-detail-hero__artwork { grid-area: artwork; align-self: start; overflow: hidden; border-radius: 0.5rem; background: var(--color-surface-soft); }
.media-detail-hero__artwork img { display: block; width: 100%; max-height: 300px; object-fit: contain; }
.media-detail-hero__content { grid-area: identity; min-width: 0; overflow-wrap: anywhere; }
.media-detail-hero__type { margin: 0 0 0.5rem; color: var(--color-primary-ink); font-size: 0.8rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.15; letter-spacing: -0.035em; }
.media-detail-hero__authors { margin: 0.6rem 0 0; line-height: 1.5; }
.media-detail-hero__date { margin: 0.75rem 0 0; color: var(--color-text-muted); }
.media-detail-hero__genres { grid-area: genres; display: flex; flex-wrap: wrap; align-content: start; gap: 0.5rem; min-width: 0; padding: 0; margin: 0; list-style: none; }
.media-detail-hero__genres li { max-width: 100%; overflow-wrap: anywhere; border-radius: 0.4rem; padding: 0.35rem 0.65rem; background: var(--color-primary-soft); color: var(--color-primary-ink); font-size: 0.85rem; }
.media-detail-hero__genres--book li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.media-detail-hero__actions { grid-area: actions; display: grid; gap: 1rem; min-width: 0; padding: 1rem; border-radius: 0.65rem; background: var(--color-surface-soft); }
.media-detail-hero__synopsis { grid-area: synopsis; min-width: 0; padding-top: 1.25rem; border-top: 1px solid var(--color-border); overflow-wrap: anywhere; }
.media-detail-hero__synopsis h2 { margin: 0 0 0.75rem; font-size: 1.2rem; }
.media-detail-hero__description { max-width: 75ch; margin: 0; line-height: 1.75; white-space: pre-line; }
@media (min-width: 900px) {
  .media-detail-hero__actions { grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); }
}
@media (max-width: 640px) {
  .media-detail-hero__backdrop { display: none; }
  .media-detail-hero__body { grid-template-columns: clamp(72px, 22vw, 96px) minmax(0, 1fr); grid-template-areas: 'artwork identity' 'genres genres' 'actions actions' 'synopsis synopsis'; gap: 1rem; padding: 1rem; }
  .media-detail-hero__body--text-only { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'identity' 'genres' 'actions' 'synopsis'; }
  .media-detail-hero__artwork img { max-height: 144px; }
  h1 { font-size: clamp(1.4rem, 5.5vw, 1.8rem); line-height: 1.2; }
  .media-detail-hero__type { font-size: 0.7rem; margin-bottom: 0.35rem; }
  .media-detail-hero__authors, .media-detail-hero__date { font-size: 0.85rem; margin-top: 0.5rem; }
}
</style>
