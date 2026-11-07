<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'
import MediaTypeIcon from './MediaTypeIcon.vue'

const props = defineProps({
  media: { type: Object, required: true },
  alt: { type: String, default: '' },
  linked: { type: Boolean, default: true },
  landscape: { type: Boolean, default: false },
  badge: { type: Boolean, default: false },
  fallbackLabel: { type: String, default: '' },
})
const failed = ref(false)
const source = computed(() => props.media.coverImage || props.media.posterImage || props.media.artworkImage)
const route = computed(() => props.linked && source.value && !failed.value ? getMediaDetailRoute(props.media) : null)
const typeLabel = computed(() => ({ book: 'Book', movie: 'Movie', tv: 'TV show', game: 'Game' })[props.media.mediaType])
const fallback = computed(() => props.fallbackLabel || ({ book: 'No cover', movie: 'No poster', tv: 'No poster', game: 'No artwork' })[props.media.mediaType] || 'No artwork')
watch(source, () => { failed.value = false })
</script>

<template>
  <component :is="route ? RouterLink : 'div'" class="media-artwork" :class="{ 'media-artwork--landscape': landscape }"
    :data-type="media.mediaType" :to="route || undefined" :aria-label="route ? `View details for ${media.title}` : undefined">
    <img v-if="source && !failed" :src="source" :alt="alt || `Artwork for ${media.title}`" loading="lazy" decoding="async" @error="failed = true" />
    <span v-else class="media-artwork__fallback"><MediaTypeIcon :type="media.mediaType" /><span>{{ fallback }}</span></span>
    <span v-if="badge" class="media-artwork__badge"><MediaTypeIcon :type="media.mediaType" />{{ typeLabel }}</span>
  </component>
</template>

<style scoped>
.media-artwork { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; width: 100%; aspect-ratio: 2 / 3; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-artwork, var(--color-surface-soft)); text-decoration: none; }
.media-artwork img { display: block; width: 100%; height: 100%; object-fit: contain; }
.media-artwork[data-type='book'] img { padding: 0.4rem; }
.media-artwork--landscape { aspect-ratio: 16 / 9; }
.media-artwork__fallback { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.9rem; width: 100%; height: 100%; min-height: inherit; padding: 1rem; color: var(--color-text-muted); font-size: 0.875rem; text-align: center; background: radial-gradient(ellipse at 50% 75%, var(--color-primary-soft), transparent 80%); }
.media-artwork__fallback .media-type-icon { width: 42px; height: 42px; opacity: 0.7; }
.media-artwork__badge { position: absolute; bottom: 0.65rem; left: 0.65rem; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.5rem; border: 1px solid #ffffff30; border-radius: 4px; background: #101810e8; color: #f3f4e9; font-size: 0.75rem; line-height: 1.2; }
.media-artwork__badge .media-type-icon { width: 13px; height: 13px; }
.media-artwork:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 4px; }
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  a.media-artwork { transition: border-color 160ms ease, box-shadow 160ms ease; }
  a.media-artwork:hover { border-color: var(--color-control-border); box-shadow: var(--shadow-cover); }
}
</style>
