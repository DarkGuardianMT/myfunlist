<script setup>
import { computed, ref, watch } from 'vue'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'
import { getStatusOptions } from '../domain/libraryMedia.js'
import MediaTypeIcon from './MediaTypeIcon.vue'

const props = defineProps({ item: { type: Object, required: true } })
const failed = ref(false)
const artwork = computed(() => props.item.media.coverImage || props.item.media.posterImage || props.item.media.artworkImage)
const status = computed(() => getStatusOptions(props.item.media.mediaType).find(option => option.value === props.item.userMedia.status)?.label || props.item.userMedia.status)
watch(artwork, () => { failed.value = false })
</script>

<template>
  <article class="home-shelf-card">
    <RouterLink :to="getMediaDetailRoute(item.media) || '/library'" class="home-shelf-art" :data-type="item.media.mediaType" :aria-label="`View details for ${item.media.title}`">
      <img v-if="artwork && !failed" :src="artwork" :alt="`Artwork for ${item.media.title}`" loading="lazy" @error="failed = true" />
      <span v-else class="home-art-fallback"><MediaTypeIcon :type="item.media.mediaType" /><span>No artwork available</span></span>
    </RouterLink>
    <p class="home-shelf-status">{{ status }}</p>
    <h3><RouterLink :to="getMediaDetailRoute(item.media) || '/library'">{{ item.media.title }}</RouterLink></h3>
    <p v-if="item.userMedia.rating !== null" class="home-shelf-rating">Your rating: {{ item.userMedia.rating }}/10</p>
  </article>
</template>
