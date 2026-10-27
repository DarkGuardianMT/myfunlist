<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'

const props = defineProps({
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
  <article class="media-card">
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
      <p class="media-card__description">{{ description || 'No description available.' }}</p>
    </div>
    <div v-if="$slots.default" class="media-card__actions">
      <slot />
    </div>
  </article>
</template>
