<script setup>
import CollectionMediaCard from './CollectionMediaCard.vue'
import LibraryItemControls from './LibraryItemControls.vue'
import MediaDetailLists from './MediaDetailLists.vue'

defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, required: true },
  layout: { type: String, default: 'comfortable' },
  landscape: { type: Boolean, default: false },
})

defineEmits(['status-change', 'rating-change', 'remove'])

</script>

<template>
  <CollectionMediaCard :item="item" :layout="layout" :landscape="landscape">
    <LibraryItemControls
      :item="item"
      :busy="busy"
      compact
      @status-change="(entry, event) => $emit('status-change', entry, event)"
      @rating-change="(entry, event) => $emit('rating-change', entry, event)"
      @remove="$emit('remove', $event)"
    >
      <template #lists>
        <MediaDetailLists :media="item.media" :id-prefix="`library-${item.userMedia.id}`" :disabled="busy" compact />
      </template>
    </LibraryItemControls>
  </CollectionMediaCard>
</template>
