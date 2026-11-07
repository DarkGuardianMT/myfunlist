<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'

const props = defineProps({
  poster: { type: Boolean, default: false },
  media: {
    type: Object,
    default: null,
  },
  title: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    default: null,
  },
  imageAlt: {
    type: String,
    required: true,
  },
  year: {
    type: String,
    default: null,
  },
  description: {
    type: String,
    default: null,
  },
})

const imageFailed = ref(false)
const detailRoute = computed(() => getMediaDetailRoute(props.media))
const artworkRoute = computed(() => props.image && !imageFailed.value ? detailRoute.value : null)

watch(
  () => props.image,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <article class="media-card" :class="{ 'media-card--poster': poster }">
    <component
      :is="artworkRoute ? RouterLink : 'div'"
      class="media-card__poster"
      :to="artworkRoute || undefined"
      :aria-label="artworkRoute ? `View details for ${title}` : undefined"
    >
      <img
        v-if="image && !imageFailed"
        :src="image"
        :alt="imageAlt"
        loading="lazy"
        @error="imageFailed = true"
      />
      <div v-else class="media-card__poster-fallback" aria-hidden="true">
        <span>No poster</span>
      </div>
    </component>

    <div class="media-card__details">
      <h3>
        <RouterLink v-if="detailRoute" class="media-card-title-link" :to="detailRoute">{{ title }}</RouterLink>
        <template v-else>{{ title }}</template>
      </h3>
      <p class="media-card__year">{{ year || 'Year unknown' }}</p>
      <details v-if="poster" class="media-card__overview"><summary>Overview</summary><p class="media-card__description">{{ description || 'No description available.' }}</p></details>
      <p v-else class="media-card__description">{{ description || 'No description available.' }}</p>
    </div>
    <div v-if="$slots.default" class="media-card__actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.media-card--poster { display: flex; flex-direction: column; min-width: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; gap: 0; }
.media-card--poster .media-card__poster { width: 100%; aspect-ratio: 2 / 3; border: 1px solid var(--color-border); border-radius: var(--radius-card); }
.media-card--poster .media-card__poster img { object-fit: contain; }
.media-card--poster .media-card__details { padding: 0.9rem 0 0.5rem; }
.media-card--poster h3 { margin: 0; font: 650 1rem/1.4 var(--font-body); letter-spacing: -0.015em; min-height: 2.8em; }
.media-card--poster h3 a { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.media-card--poster .media-card__year { font-size: 0.8125rem; margin-top: 0.4rem; }
.media-card__overview summary { display: flex; align-items: center; min-height: 44px; gap: 0.4rem; color: var(--color-text-muted); font-size: 0.8125rem; cursor: pointer; }
.media-card__overview summary::after { content: '+'; }
.media-card__overview[open] summary::after { content: '−'; }
.media-card__overview summary:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.media-card__overview .media-card__description { display: block; font-size: 0.875rem; line-height: 1.7; overflow-wrap: anywhere; }
.media-card--poster .media-card__actions { margin-top: auto; padding-top: 0.5rem; }
.media-card--poster:hover { transform: none; }
@media (max-width: 640px) { .media-card--poster h3 { font-size: 0.9375rem; } }
</style>
