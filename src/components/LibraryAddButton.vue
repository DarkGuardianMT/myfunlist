<script setup>
defineProps({
  media: { type: Object, required: true },
  isLibraryLoaded: { type: Boolean, required: true },
  isAdded: { type: Boolean, required: true },
  isAdding: { type: Boolean, required: true },
  hasIdentity: { type: Boolean, required: true },
})

defineEmits(['add'])
</script>

<template>
  <button
    class="book-action-button"
    :class="{ 'book-action-button--added': isAdded }"
    type="button"
    :disabled="!isLibraryLoaded || !hasIdentity || isAdded || isAdding"
    :aria-label="`${isAdded ? 'In Library:' : 'Add to Library:'} ${media.title}`"
    @click="$emit('add', media)"
  >
    <template v-if="isAdded">In Library</template>
    <template v-else-if="isAdding">Adding…</template>
    <template v-else-if="!isLibraryLoaded">Loading Library…</template>
    <template v-else>Add to Library</template>
  </button>
</template>
