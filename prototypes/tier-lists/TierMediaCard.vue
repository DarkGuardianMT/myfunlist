<script setup>
import MediaArtwork from '../../src/components/MediaArtwork.vue'
import MediaTypeIcon from '../../src/components/MediaTypeIcon.vue'

defineProps({ media: { type: Object, required: true } })
const singular = { movie: 'Movie', tv: 'TV show', game: 'Game', book: 'Book' }
</script>

<template>
  <article class="tier-media-card" :aria-label="media.title">
    <MediaArtwork :media="media" :linked="false" />
    <h3 class="tier-media-title">{{ media.title }}</h3>
    <p class="tier-media-type" :data-type="media.mediaType">
      <MediaTypeIcon :type="media.mediaType" />{{ singular[media.mediaType] }}
    </p>
    <slot />
  </article>
</template>
