<script setup>
import { computed } from 'vue'
import { getMediaDetailRoute } from '../domain/mediaIdentity.js'
import MediaArtwork from './MediaArtwork.vue'

const props = defineProps({ item: { type: Object, required: true }, layout: { type: String, default: 'comfortable' }, landscape: { type: Boolean, default: false } })
const route = computed(() => getMediaDetailRoute(props.item.media))
const creator = computed(() => {
  const media = props.item.media
  if (media.mediaType === 'book') return media.authors?.filter(Boolean).join(', ') || 'Unknown author'
  if (media.mediaType === 'game') return media.platforms?.join(', ') || 'Platforms unknown'
  return media.releaseYear || media.firstAirYear || 'Year unknown'
})
const year = computed(() => props.item.media.publishedYear || props.item.media.releaseYear || props.item.media.firstAirYear)
</script>

<template>
  <article class="collection-card" :class="{ 'collection-card--list': layout === 'list' }" :data-type="item.media.mediaType">
    <MediaArtwork :media="item.media" :landscape="landscape && layout !== 'list'" badge />
    <div class="collection-card__body">
      <div class="collection-card__identity">
        <h3><RouterLink v-if="route" :to="route" :title="item.media.title">{{ item.media.title }}</RouterLink><span v-else>{{ item.media.title }}</span></h3>
        <p :title="creator">{{ creator }}<span v-if="year && (item.media.mediaType === 'book' || item.media.mediaType === 'game')" class="collection-card__year"> · {{ year }}</span></p>
      </div>
      <slot />
    </div>
  </article>
</template>

<style scoped>
.collection-card { min-width: 0; display: flex; flex-direction: column; }
.collection-card__body { display: flex; flex: 1; flex-direction: column; gap: 0.35rem; padding-top: 0.9rem; min-width: 0; }
.collection-card__identity { min-width: 0; }
h3 { margin: 0; min-height: 2.8em; font: 650 1rem/1.4 var(--font-body); letter-spacing: -0.015em; overflow-wrap: anywhere; }
h3 a { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--color-text); text-decoration: none; }
h3 a:hover { color: var(--color-primary-ink); text-decoration: underline; text-underline-offset: 0.2em; }
p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-muted); font-size: 0.875rem; margin: 0.35rem 0 0; }
.collection-card__year { color: var(--color-text-muted); font-size: 0.75rem; }
.collection-card--list { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 1.5rem; padding-block: 1.25rem; border-bottom: 1px solid var(--color-border); }
.collection-card--list .collection-card__body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 1.3fr); gap: 2rem; align-items: center; padding: 0; }
.collection-card--list .collection-card__identity { min-height: 0; }
.collection-card--list h3 { min-height: 0; }
@media (max-width: 900px) { .collection-card--list .collection-card__body { display: flex; flex-direction: column; align-items: stretch; gap: 1rem; } }
@media (max-width: 640px) { h3 { font-size: 0.9375rem; } p { font-size: 0.8125rem; } }
@media (max-width: 640px) { .collection-card--list { grid-template-columns: 80px minmax(0, 1fr); gap: 1rem; } }
</style>
