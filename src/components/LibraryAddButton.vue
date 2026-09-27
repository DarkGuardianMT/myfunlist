<script setup>
defineProps({
  media: { type: Object, required: true },
  isLibraryLoaded: { type: Boolean, required: true },
  isAnonymous: { type: Boolean, default: false },
  hasLoadError: { type: Boolean, default: false },
  isAdded: { type: Boolean, required: true },
  isAdding: { type: Boolean, required: true },
  hasIdentity: { type: Boolean, required: true },
})

defineEmits(['add'])
</script>

<template>
  <button
    class="library-add-button"
    :class="{ 'library-add-button--added': isAdded }"
    type="button"
    :disabled="(!isLibraryLoaded && !isAnonymous) || !hasIdentity || isAdded || isAdding"
    :aria-label="`${isAdded ? 'In Library:' : isAnonymous ? 'Log in to add:' : 'Add to Library:'} ${media.title}`"
    @click="$emit('add', media)"
  >
    <template v-if="isAdded">In Library</template>
    <template v-else-if="isAnonymous">Log in to add</template>
    <template v-else-if="isAdding">Adding…</template>
    <template v-else-if="hasLoadError">Library unavailable</template>
    <template v-else-if="!isLibraryLoaded">Loading Library…</template>
    <template v-else>Add to Library</template>
  </button>
</template>
