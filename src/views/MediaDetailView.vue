<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MediaDetailHero from '../components/MediaDetailHero.vue'
import MediaDetailMetadata from '../components/MediaDetailMetadata.vue'
import MediaDetailLibrary from '../components/MediaDetailLibrary.vue'
import RawgAttribution from '../components/RawgAttribution.vue'
import TmdbAttribution from '../components/TmdbAttribution.vue'
import { useMediaDetails } from '../composables/useMediaDetails.js'
import { getMediaKey } from '../domain/mediaIdentity.js'

const route = useRoute()
const identity = computed(() => ({ mediaType: route.params.mediaType, source: route.params.source, sourceId: route.params.sourceId }))
const { detail, status, error, retry } = useMediaDetails(identity)
const feedback = computed(() => {
  if (status.value === 'not-found') return { title: 'Media not found', message: 'This media item could not be found. Discover something else to explore.' }
  if (status.value === 'provider-unavailable') return { title: 'Media provider temporarily unavailable', message: 'We cannot load this item right now. Please try again in a moment.' }
  if (status.value === 'rate-limited') return { title: 'Too many detail requests', message: 'Please wait a moment before trying again.' }
  if (error.value?.code === 'request_timeout') return { title: 'The request timed out', message: 'Loading this item took too long. Please try again.' }
  if (error.value?.code === 'network_error') return { title: 'Could not connect', message: 'Check your connection and try again.' }
  return { title: 'Could not load media details', message: 'We could not load this item. Please try again later.' }
})
</script>

<template>
  <article class="media-detail-page" :aria-busy="status === 'loading'" aria-labelledby="media-title">
    <RouterLink class="inline-link media-detail-back" to="/discover">← Discover</RouterLink>
    <div v-if="status === 'loading'" class="media-detail-state" role="status">
      <h1 id="media-title">Loading media…</h1>
      <p>Getting the details for this item.</p>
    </div>
    <template v-else-if="status === 'success' && detail">
      <MediaDetailHero :media="detail">
        <MediaDetailLibrary :key="getMediaKey(detail)" :media="detail" />
      </MediaDetailHero>
      <MediaDetailMetadata :media="detail" />
      <TmdbAttribution v-if="detail.source === 'tmdb'" />
      <RawgAttribution v-else-if="detail.source === 'rawg'" />
      <p v-else class="media-detail-credits">
        Book data provided by <a href="https://books.google.com/" target="_blank" rel="noopener noreferrer">Google Books</a>.
      </p>
    </template>
    <div v-else class="media-detail-state" role="alert" :data-state="status">
      <h1 id="media-title">{{ feedback.title }}</h1>
      <p>{{ feedback.message }}</p>
      <RouterLink v-if="status === 'not-found'" class="inline-link" to="/discover">Back to Discover</RouterLink>
      <button v-else class="text-button" type="button" @click="retry">Try again</button>
    </div>
  </article>
</template>

<style scoped>
.media-detail-page { min-width: 0; }
.media-detail-back { display: inline-block; margin-bottom: 1.25rem; }
.media-detail-state { padding: 2rem; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); overflow-wrap: anywhere; }
.media-detail-state h1 { margin: 0; font-size: clamp(1.5rem, 4vw, 2rem); }
.media-detail-state p { color: var(--color-text-muted); line-height: 1.6; }
.media-detail-credits { margin-top: 1.5rem; color: var(--color-text-muted); font-size: 0.85rem; }
.media-detail-credits a { color: var(--color-primary-ink); }
@media (max-width: 640px) { .media-detail-state { padding: 1.25rem; } }
</style>
