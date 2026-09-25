<script setup>
import MediaCard from './MediaCard.vue'

defineProps({
  show: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <MediaCard
    :title="show.title"
    :image="show.posterImage"
    :image-alt="`Poster for ${show.title}`"
    :year="show.firstAirYear"
    :description="show.description"
  />
</template>
