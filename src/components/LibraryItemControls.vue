<script setup>
import { getStatusOptions, PERSONAL_RATINGS } from '../domain/libraryMedia.js'
import CardPopover from './CardPopover.vue'

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
    <div v-if="compact" class="collection-card-actions">
      <CardPopover class="collection-rating" :label="`Edit personal rating for ${item.media.title}`">
        <template #trigger><svg class="rating-star" :class="{ 'rating-star--rated': item.userMedia.rating !== null }" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /></svg><span class="personal-rating">{{ item.userMedia.rating === null ? 'Rate' : `${item.userMedia.rating} / 10` }}</span></template>
        <label :for="`rating-${item.userMedia.mediaKey}`">Personal rating</label>
        <select :id="`rating-${item.userMedia.mediaKey}`" :value="item.userMedia.rating ?? ''" :disabled="busy"
          :aria-label="`Personal rating for ${item.media.title}`" @change="$emit('rating-change', item, $event)">
          <option value="">Not rated</option>
          <option v-for="rating in PERSONAL_RATINGS" :key="rating" :value="rating">{{ rating }} / 10</option>
        </select>
        <p class="rating-hint">Choose a half-point rating, or clear your rating.</p>
      </CardPopover>
      <CardPopover class="collection-manage" :label="`Manage ${item.media.title}`">
        <template #trigger><svg class="ellipsis-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg></template>
        <slot name="lists" />
        <button :id="`remove-library-${item.userMedia.id}`" class="remove-button" type="button" :disabled="busy"
          :aria-label="`Remove ${item.media.title} from Library`" @click="$emit('remove', item)">Remove from Library</button>
      </CardPopover>
    </div>
    <div class="tracking-field" :class="{ 'tracking-field--compact': compact }">
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
    <template v-if="!compact">
    <div class="tracking-field">
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
    </div>
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
.collection-controls { display: grid; gap: 0.25rem; margin-top: auto; }
.collection-card-actions { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.collection-rating { margin-left: -0.4rem; }
.collection-rating :deep(.card-popover__panel select) { font-size: 1rem; }
.rating-star { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.5; }
.rating-star--rated { fill: var(--color-primary); stroke: var(--color-primary); }
.ellipsis-icon { width: 22px; height: 22px; fill: currentColor; }
.rating-hint { margin: 0.75rem 0 0; font-size: 0.8125rem; color: var(--color-text-muted); line-height: 1.6; }
.tracking-field--compact > label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.collection-controls label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); }
.collection-controls select { width: 100%; min-width: 0; min-height: 44px; padding: 0.6rem 0.75rem; font: 500 0.8125rem var(--font-body); border: 1px solid var(--color-control-border); border-radius: var(--radius-control); }
.collection-controls .tracking-field--compact select { background: var(--color-primary-soft); color: var(--color-primary-ink); border-color: transparent; }
.collection-manage .remove-button { margin-top: 0.5rem; min-height: 44px; border-color: var(--color-border); background: transparent; color: var(--color-danger-ink); font-size: 0.8125rem; }
.collection-manage .remove-button:hover:not(:disabled) { background: var(--color-danger-soft); }
</style>
