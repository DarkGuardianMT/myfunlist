<script setup>
import { computed, ref, watch } from 'vue'

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
watch(() => props.media.artworkImage, () => { artworkFailed.value = false })
watch(() => props.media.backdropImage, () => { backdropFailed.value = false })
</script>

<template>
  <header class="media-detail-hero">
    <div v-if="media.backdropImage && !backdropFailed" class="media-detail-hero__backdrop" aria-hidden="true">
      <img :key="media.backdropImage" :src="media.backdropImage" alt="" decoding="async" @error="backdropFailed = true" />
    </div>
    <div class="media-detail-hero__body" :class="{ 'media-detail-hero__body--text-only': !hasArtwork }">
      <div v-if="hasArtwork" class="media-detail-hero__artwork">
        <img :key="media.artworkImage" :src="media.artworkImage" :alt="`Artwork for ${media.title}`" decoding="async" @error="artworkFailed = true" />
      </div>
      <div class="media-detail-hero__content">
        <p class="media-detail-hero__type">{{ typeLabels[media.mediaType] }}</p>
        <h1 id="media-title">{{ media.title }}</h1>
        <p v-if="date.value" class="media-detail-hero__date">
          {{ date.label }} <time :datetime="date.value">{{ date.value }}</time>
        </p>
        <ul v-if="media.genres?.length" class="media-detail-hero__genres" aria-label="Genres">
          <li v-for="genre in media.genres" :key="genre">{{ genre }}</li>
        </ul>
        <p v-if="media.description" class="media-detail-hero__description">{{ media.description }}</p>
      </div>
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
.media-detail-hero__backdrop { height: clamp(140px, 20vw, 230px); background: var(--color-surface-soft); }
.media-detail-hero__backdrop img { display: block; width: 100%; height: 100%; object-fit: cover; }
.media-detail-hero__body { display: grid; grid-template-columns: minmax(150px, 230px) minmax(0, 1fr); gap: 2rem; padding: 2rem; }
.media-detail-hero__body--text-only { grid-template-columns: minmax(0, 1fr); }
.media-detail-hero__artwork { align-self: start; overflow: hidden; border-radius: 0.5rem; background: var(--color-surface-soft); }
.media-detail-hero__artwork img { display: block; width: 100%; max-height: 370px; object-fit: contain; }
.media-detail-hero__content { min-width: 0; overflow-wrap: anywhere; }
.media-detail-hero__type { margin: 0 0 0.5rem; color: var(--color-primary-ink); font-size: 0.8rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.15; letter-spacing: -0.035em; }
.media-detail-hero__date { margin: 1rem 0 0; color: var(--color-text-muted); }
.media-detail-hero__genres { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0; margin: 1rem 0 0; list-style: none; }
.media-detail-hero__genres li { border-radius: 0.4rem; padding: 0.35rem 0.65rem; background: var(--color-primary-soft); color: var(--color-primary-ink); font-size: 0.85rem; }
.media-detail-hero__description { margin: 1.5rem 0 0; line-height: 1.75; white-space: pre-line; }
@media (max-width: 640px) {
  .media-detail-hero__body { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; padding: 1.25rem; }
  .media-detail-hero__artwork { width: min(100%, 230px); justify-self: center; }
}
</style>
