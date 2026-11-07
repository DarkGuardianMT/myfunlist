<script setup>
import MediaCard from './MediaCard.vue'

defineProps({
  poster: { type: Boolean, default: false },
  show: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <MediaCard
    :poster="poster"
    :media="show"
    :title="show.title"
    :image="show.posterImage"
    :image-alt="`Poster for ${show.title}`"
    :year="show.firstAirYear"
    :description="show.description"
  >
    <slot />
  </MediaCard>
</template>
