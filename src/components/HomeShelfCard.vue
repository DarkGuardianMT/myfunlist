<script setup>
import { computed } from 'vue'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'
import { getStatusOptions } from '../domain/libraryMedia.js'
import MediaArtwork from './MediaArtwork.vue'

const props = defineProps({ item: { type: Object, required: true } })
const status = computed(() => getStatusOptions(props.item.media.mediaType).find(option => option.value === props.item.userMedia.status)?.label || props.item.userMedia.status)
</script>

<template>
  <article class="home-shelf-card">
    <MediaArtwork :media="item.media" class="home-shelf-art" fallback-label="No artwork available" />
    <p class="home-shelf-status">{{ status }}</p>
    <h3><RouterLink :to="getMediaDetailRoute(item.media) || '/library'" :title="item.media.title">{{ item.media.title }}</RouterLink></h3>
    <p v-if="item.userMedia.rating !== null" class="home-shelf-rating">Your rating: {{ item.userMedia.rating }}/10</p>
  </article>
</template>
