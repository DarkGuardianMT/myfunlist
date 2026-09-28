<script setup>
import BookCard from './BookCard.vue'
import GameCard from './GameCard.vue'
import MovieCard from './MovieCard.vue'
import TvCard from './TvCard.vue'

defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, required: true },
})
defineEmits(['remove'])

const cards = { book: BookCard, movie: MovieCard, tv: TvCard, game: GameCard }
const typeLabels = { book: 'Book', movie: 'Movie', tv: 'TV show', game: 'Game' }

function cardProps(item) {
  return { [item.media.mediaType === 'tv' ? 'show' : item.media.mediaType]: item.media }
}
</script>

<template>
  <component :is="cards[item.media.mediaType]" v-bind="cardProps(item)">
    <p class="library-media-badge">{{ typeLabels[item.media.mediaType] }}</p>
    <p class="personal-rating">Personal rating: <strong>{{ item.userMedia.rating === null ? 'Unrated' : `${item.userMedia.rating} / 10` }}</strong></p>
    <p class="list-item-status">Library status: {{ item.userMedia.status.replaceAll('-', ' ') }}</p>
    <button
      class="remove-button"
      type="button"
      :disabled="busy"
      :aria-label="`Remove ${item.media.title} from this list`"
      @click="$emit('remove', item)"
    >Remove from list</button>
  </component>
</template>
