<script setup>
import MediaCard from './MediaCard.vue'

defineProps({
  poster: { type: Boolean, default: false },
  movie: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <MediaCard
    :poster="poster"
    :media="movie"
    :title="movie.title"
    :image="movie.posterImage"
    :image-alt="`Poster for ${movie.title}`"
    :year="movie.releaseYear"
    :description="movie.description"
  >
    <slot />
  </MediaCard>
</template>
