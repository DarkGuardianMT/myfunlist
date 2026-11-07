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
  <header class="media-detail-hero" :data-type="media.mediaType">
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
.media-detail-hero { position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: radial-gradient(ellipse at 20% 0, var(--color-primary-soft), transparent 65%), var(--color-surface); }
.media-detail-hero__backdrop { position: absolute; z-index: -1; inset: 0; height: 100%; pointer-events: none; opacity: 0.14; }
.media-detail-hero__backdrop img { display: block; width: 100%; height: 100%; object-fit: cover; }
.media-detail-hero__body { display: grid; grid-template-columns: minmax(180px, var(--detail-art-width, 250px)) minmax(0, 1fr) minmax(240px, 300px); grid-template-areas: 'artwork identity actions' 'artwork genres actions' 'synopsis synopsis synopsis'; align-items: start; gap: 1.5rem 2rem; padding: clamp(1.5rem, 3vw, 3rem); }
.media-detail-hero[data-type='game'] { --detail-art-width: 420px; }
.media-detail-hero__body--text-only { grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); grid-template-areas: 'identity actions' 'genres actions' 'synopsis synopsis'; }
.media-detail-hero__artwork { grid-area: artwork; overflow: hidden; background: var(--color-surface-soft); border: 1px solid var(--color-border); border-radius: var(--radius-card); box-shadow: var(--shadow-cover); }
.media-detail-hero__artwork img { display: block; width: 100%; aspect-ratio: 2 / 3; object-fit: contain; }
.media-detail-hero[data-type='game'] .media-detail-hero__artwork img { aspect-ratio: 16 / 9; }
.media-detail-hero__content { grid-area: identity; min-width: 0; align-self: end; overflow-wrap: anywhere; }
.media-detail-hero__type { margin: 0 0 1rem; color: var(--color-primary-ink); font-size: 0.75rem; font-weight: 650; letter-spacing: 0.14em; text-transform: uppercase; }
h1 { margin: 0; font: 750 clamp(2rem, 3.8vw, 3.75rem)/1.08 var(--font-display); letter-spacing: -0.055em; }
.media-detail-hero__authors { margin: 1rem 0 0; font-size: 1rem; line-height: 1.6; }
.media-detail-hero__date { margin: 0.75rem 0 0; color: var(--color-text-muted); font-size: 0.875rem; }
.media-detail-hero__genres { grid-area: genres; display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0; margin: 0; list-style: none; min-width: 0; }
.media-detail-hero__genres li { max-width: 100%; border: 1px solid var(--color-border); border-radius: 2rem; padding: 0.4rem 0.75rem; background: var(--color-surface); color: var(--color-text-muted); font-size: 0.75rem; overflow-wrap: anywhere; }
.media-detail-hero__genres--book li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.media-detail-hero__actions { grid-area: actions; min-width: 0; display: grid; gap: 1.5rem; padding: 1.25rem; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.media-detail-hero__actions :deep(.media-detail-lists) { border-left: 0; padding-left: 0; border-top: 1px solid var(--color-border); padding-top: 1rem; }
.media-detail-hero__synopsis { grid-area: synopsis; min-width: 0; padding-top: 2rem; border-top: 1px solid var(--color-border); overflow-wrap: anywhere; }
.media-detail-hero__synopsis h2 { margin: 0 0 0.75rem; font-size: 1.2rem; letter-spacing: -0.025em; }
.media-detail-hero__description { max-width: 78ch; margin: 0; font-size: 1rem; line-height: 1.85; white-space: pre-line; color: var(--color-text-muted); }
@media (max-width: 1100px) {
  .media-detail-hero__body { grid-template-columns: minmax(150px, 210px) minmax(0, 1fr); grid-template-areas: 'artwork identity' 'artwork genres' 'actions actions' 'synopsis synopsis'; }
  .media-detail-hero__body--text-only { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'identity' 'genres' 'actions' 'synopsis'; }
  .media-detail-hero__actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .media-detail-hero__actions :deep(.media-detail-lists) { border-top: 0; padding-top: 0; border-left: 1px solid var(--color-border); padding-left: 1rem; }
}
@media (max-width: 640px) {
  .media-detail-hero__body { grid-template-columns: minmax(110px, 40%) minmax(0, 1fr); grid-template-areas: 'artwork identity' 'genres genres' 'actions actions' 'synopsis synopsis'; gap: 1.25rem 1rem; padding: 1.25rem; }
  .media-detail-hero__body--text-only { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'identity' 'genres' 'actions' 'synopsis'; }
  h1 { font-size: clamp(1.5rem, 6vw, 2rem); line-height: 1.15; }
  .media-detail-hero__content { align-self: center; }
  .media-detail-hero__type { font-size: 0.6875rem; margin-bottom: 0.6rem; }
  .media-detail-hero__authors, .media-detail-hero__date { font-size: 0.8125rem; margin-top: 0.6rem; }
  .media-detail-hero__actions { grid-template-columns: minmax(0, 1fr); padding: 1rem; }
  .media-detail-hero__actions :deep(.media-detail-lists) { border-left: 0; padding-left: 0; border-top: 1px solid var(--color-border); padding-top: 1rem; }
  .media-detail-hero__synopsis { padding-top: 1.25rem; }
  .media-detail-hero__description { font-size: 0.9375rem; line-height: 1.8; }
  .media-detail-hero[data-type='game'] .media-detail-hero__body { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'artwork' 'identity' 'genres' 'actions' 'synopsis'; }
}
@media (max-width: 360px) {
  .media-detail-hero__body { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'artwork' 'identity' 'genres' 'actions' 'synopsis'; padding: 1rem; }
  .media-detail-hero__artwork { width: 170px; max-width: 100%; justify-self: center; }
  .media-detail-hero[data-type='game'] .media-detail-hero__artwork { width: 100%; }
}
</style>
