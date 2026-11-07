<script setup>
import { getStatusOptions, PERSONAL_RATINGS } from '../domain/libraryMedia.js'

defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, required: true },
  compact: { type: Boolean, default: false },
})

defineEmits(['status-change', 'rating-change', 'remove'])

const statusLabels = {
  book: 'Reading status',
  movie: 'Watch status',
  tv: 'Watching status',
  game: 'Play status',
}
</script>

<template>
  <div class="library-item-controls" :class="{ 'collection-controls': compact }">
    <div class="tracking-field">
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
    </div>
    <div class="tracking-field">
    <p class="personal-rating" :class="{ 'collection-rating-description': compact }">
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
    </div>
    <details v-if="compact" class="collection-manage">
      <summary :aria-label="`Manage ${item.media.title}`">Manage <span aria-hidden="true">＋</span></summary>
      <slot name="lists" />
      <button :id="`remove-library-${item.userMedia.id}`" class="remove-button" type="button" :disabled="busy"
        :aria-label="`Remove ${item.media.title} from Library`" @click="$emit('remove', item)">Remove from Library</button>
    </details>
    <template v-else>
      <slot name="lists" />
      <button
      :id="`remove-library-${item.userMedia.id}`"
      class="remove-button"
      type="button"
      :disabled="busy"
      :aria-label="`Remove ${item.media.title} from Library`"
      @click="$emit('remove', item)"
    >
      Remove from Library
    </button>
    </template>
  </div>
</template>

<style scoped>
.tracking-field { display: grid; gap: 0.5rem; min-width: 0; }
.collection-rating-description { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.collection-controls { display: grid; gap: 0.75rem; margin-top: auto; }
.collection-controls label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); }
.collection-controls select { width: 100%; min-width: 0; min-height: 44px; padding: 0.6rem 0.5rem; font: 500 0.875rem var(--font-body); border: 1px solid var(--color-control-border); border-radius: var(--radius-control); }
.collection-manage { border-top: 1px solid var(--color-border); }
.collection-manage summary { display: flex; align-items: center; justify-content: space-between; min-height: 44px; color: var(--color-text-muted); font-size: 0.8125rem; cursor: pointer; list-style: none; }
.collection-manage summary::-webkit-details-marker { display: none; }
.collection-manage[open] > summary { color: var(--color-primary-ink); }
.collection-manage .remove-button { margin-top: 0.5rem; min-height: 44px; border-color: var(--color-border); background: transparent; color: var(--color-danger-ink); font-size: 0.8125rem; }
.collection-manage .remove-button:hover:not(:disabled) { background: var(--color-danger-soft); }
.collection-manage summary:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 3px; }
@media (min-width: 641px) { :global(.collection-card--list) .collection-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 0; } :global(.collection-card--list) .collection-manage { grid-column: 1 / -1; } }
</style>
