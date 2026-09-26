<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  game: {
    type: Object,
    required: true,
  },
})

const imageFailed = ref(false)
const platformSummary = computed(() => {
  const platforms = props.game.platforms
  if (!platforms.length) return 'Platforms unknown'

  const firstPlatforms = platforms.slice(0, 3).join(', ')
  return platforms.length > 3 ? `${firstPlatforms} +${platforms.length - 3} more` : firstPlatforms
})

watch(
  () => props.game.coverImage,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <article class="game-card">
    <div class="game-card__image">
      <img
        v-if="game.coverImage && !imageFailed"
        :src="game.coverImage"
        :alt="`Artwork for ${game.title}`"
        loading="lazy"
        @error="imageFailed = true"
      />
      <div v-else class="game-card__image-fallback" aria-hidden="true">No artwork</div>
    </div>
    <div class="game-card__details">
      <h3>{{ game.title }}</h3>
      <p>{{ game.releaseYear || 'Release year unknown' }}</p>
      <p :title="game.platforms.join(', ')">{{ platformSummary }}</p>
    </div>
    <div v-if="$slots.default" class="game-card__actions">
      <slot />
    </div>
  </article>
</template>
