<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
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

watch(
  () => props.image,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <article class="media-card">
    <div class="media-card__poster">
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
    </div>

    <div class="media-card__details">
      <h3>{{ title }}</h3>
      <p class="media-card__year">{{ year || 'Year unknown' }}</p>
      <p class="media-card__description">{{ description || 'No description available.' }}</p>
    </div>
    <div v-if="$slots.default" class="media-card__actions">
      <slot />
    </div>
  </article>
</template>
