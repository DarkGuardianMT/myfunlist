<script setup>
import BookCard from './BookCard.vue'
import GameCard from './GameCard.vue'
import MovieCard from './MovieCard.vue'
import TvCard from './TvCard.vue'
import LibraryItemControls from './LibraryItemControls.vue'
import MediaDetailLists from './MediaDetailLists.vue'

defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, required: true },
})

defineEmits(['status-change', 'rating-change', 'remove'])

const cards = { book: BookCard, movie: MovieCard, tv: TvCard, game: GameCard }
const typeLabels = { book: 'Book', movie: 'Movie', tv: 'TV show', game: 'Game' }

function cardProps(item) {
  return { [item.media.mediaType === 'tv' ? 'show' : item.media.mediaType]: item.media }
}
</script>

<template>
  <component :is="cards[item.media.mediaType]" v-bind="cardProps(item)">
    <p class="library-media-badge" :data-media-type="item.media.mediaType">{{ typeLabels[item.media.mediaType] }}</p>
    <LibraryItemControls
      :item="item"
      :busy="busy"
      @status-change="(entry, event) => $emit('status-change', entry, event)"
      @rating-change="(entry, event) => $emit('rating-change', entry, event)"
      @remove="$emit('remove', $event)"
    >
      <template #lists>
        <MediaDetailLists :media="item.media" :id-prefix="`library-${item.userMedia.id}`" :disabled="busy" compact />
      </template>
    </LibraryItemControls>
  </component>
</template>
