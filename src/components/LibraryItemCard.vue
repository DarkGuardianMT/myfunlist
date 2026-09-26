<script setup>
import BookCard from './BookCard.vue'
import GameCard from './GameCard.vue'
import MovieCard from './MovieCard.vue'
import TvCard from './TvCard.vue'
import { getStatusOptions, PERSONAL_RATINGS } from '../domain/libraryMedia.js'

defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, required: true },
})

defineEmits(['status-change', 'rating-change', 'remove'])

const cards = { book: BookCard, movie: MovieCard, tv: TvCard, game: GameCard }
const typeLabels = { book: 'Book', movie: 'Movie', tv: 'TV show', game: 'Game' }
const statusLabels = {
  book: 'Reading status',
  movie: 'Watch status',
  tv: 'Watching status',
  game: 'Play status',
}

function cardProps(item) {
  return { [item.media.mediaType === 'tv' ? 'show' : item.media.mediaType]: item.media }
}
</script>

<template>
  <component :is="cards[item.media.mediaType]" v-bind="cardProps(item)">
    <p class="library-media-badge">{{ typeLabels[item.media.mediaType] }}</p>
    <div class="library-item-controls">
      <label :for="`status-${item.userMedia.mediaKey}`">
        {{ statusLabels[item.media.mediaType] }}
      </label>
      <select
        :id="`status-${item.userMedia.mediaKey}`"
        :value="item.userMedia.status"
        :disabled="busy"
        :aria-label="`${statusLabels[item.media.mediaType]} for ${item.media.title}`"
        @change="$emit('status-change', item, $event)"
      >
        <option
          v-for="option in getStatusOptions(item.media.mediaType)"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <p class="personal-rating">
        Personal rating:
        <strong>{{ item.userMedia.rating === null ? 'Unrated' : `${item.userMedia.rating} / 10` }}</strong>
      </p>
      <label :for="`rating-${item.userMedia.mediaKey}`">Personal rating</label>
      <select
        :id="`rating-${item.userMedia.mediaKey}`"
        :value="item.userMedia.rating ?? ''"
        :disabled="busy"
        :aria-label="`Personal rating for ${item.media.title}`"
        @change="$emit('rating-change', item, $event)"
      >
        <option value="">Not rated</option>
        <option v-for="rating in PERSONAL_RATINGS" :key="rating" :value="rating">
          {{ rating }} / 10
        </option>
      </select>
      <button
        class="remove-button"
        type="button"
        :disabled="busy"
        :aria-label="`Remove ${item.media.title} from Library`"
        @click="$emit('remove', item)"
      >
        Remove from Library
      </button>
    </div>
  </component>
</template>
