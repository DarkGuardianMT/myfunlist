<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'

const props = defineProps({
  poster: { type: Boolean, default: false },
  game: {
    type: Object,
    required: true,
  },
})

const imageFailed = ref(false)
const detailRoute = computed(() => getMediaDetailRoute(props.game))
const artworkRoute = computed(() => props.game.coverImage && !imageFailed.value ? detailRoute.value : null)
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
    <component
      :is="artworkRoute ? RouterLink : 'div'"
      class="game-card__image"
      :to="artworkRoute || undefined"
      :aria-label="artworkRoute ? `View details for ${game.title}` : undefined"
    >
      <img
        v-if="game.coverImage && !imageFailed"
        :src="game.coverImage"
        :alt="`Artwork for ${game.title}`"
        loading="lazy"
        @error="imageFailed = true"
      />
      <div v-else class="game-card__image-fallback" aria-hidden="true">No artwork</div>
    </component>
    <div class="game-card__details">
      <h3>
        <RouterLink v-if="detailRoute" class="media-card-title-link" :to="detailRoute">{{ game.title }}</RouterLink>
        <template v-else>{{ game.title }}</template>
      </h3>
      <p>{{ game.releaseYear || 'Release year unknown' }}</p>
      <p :title="game.platforms.join(', ')">{{ platformSummary }}</p>
    </div>
    <div v-if="$slots.default" class="game-card__actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.game-card { display: flex; flex-direction: column; min-width: 0; overflow: visible; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.game-card__image { overflow: hidden; aspect-ratio: 16 / 9; border: 1px solid var(--color-border); border-radius: var(--radius-card); }
.game-card__image img { object-fit: contain; }
.game-card__details { padding: 0.9rem 0 0.5rem; }
.game-card h3 { font: 650 1rem/1.4 var(--font-body); letter-spacing: -0.015em; min-height: 2.8em; }
.game-card h3 a { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.game-card p { font-size: 0.8125rem; }
.game-card__actions { margin-top: auto; padding: 0.5rem 0 0; }
.game-card:hover { transform: none; }
</style>
