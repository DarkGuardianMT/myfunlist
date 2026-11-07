<script setup>
import CollectionMediaCard from './CollectionMediaCard.vue'
import { getStatusOptions } from '../domain/libraryMedia.js'

defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, required: true },
})
defineEmits(['remove'])

const statusLabel = item => getStatusOptions(item.media.mediaType).find(option => option.value === item.userMedia.status)?.label || item.userMedia.status.replaceAll('-', ' ')
</script>

<template>
  <CollectionMediaCard :item="item">
    <p class="personal-rating">Personal rating: <strong>{{ item.userMedia.rating === null ? 'Unrated' : `${item.userMedia.rating} / 10` }}</strong></p>
    <p class="list-item-status">Library status: {{ statusLabel(item) }}</p>
    <button
      class="remove-button"
      type="button"
      :disabled="busy"
      :aria-label="`Remove ${item.media.title} from this list`"
      @click="$emit('remove', item)"
    >Remove from list</button>
  </CollectionMediaCard>
</template>
