<script setup>
import MediaCard from './MediaCard.vue'

defineProps({
  movie: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <MediaCard
    :title="movie.title"
    :image="movie.posterImage"
    :image-alt="`Poster for ${movie.title}`"
    :year="movie.releaseYear"
    :description="movie.description"
  />
</template>
