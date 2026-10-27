<script setup>
import { computed } from 'vue'

const props = defineProps({ media: { type: Object, required: true } })
const fields = {
  book: [['authors', 'Authors'], ['publisher', 'Publisher'], ['pageCount', 'Pages'],
    ['publishedDate', 'Published'], ['language', 'Language'], ['isbn10', 'ISBN-10'], ['isbn13', 'ISBN-13']],
  movie: [['releaseDate', 'Release date'], ['runtimeMinutes', 'Runtime'], ['directors', 'Directors'],
    ['originalTitle', 'Original title'], ['originalLanguage', 'Original language']],
  tv: [['firstAirDate', 'First aired'], ['lastAirDate', 'Last aired'], ['numberOfSeasons', 'Seasons'],
    ['numberOfEpisodes', 'Episodes'], ['seriesStatus', 'Series status'], ['originalTitle', 'Original title'],
    ['originalLanguage', 'Original language']],
  game: [['releaseDate', 'Release date'], ['platforms', 'Platforms'], ['developers', 'Developers'], ['publishers', 'Publishers']],
}
const rows = computed(() => fields[props.media.mediaType].flatMap(([key, label]) => {
  const value = props.media.details[key]
  const present = Array.isArray(value) ? value.length > 0
    : typeof value === 'number' ? value > 0 : typeof value === 'string' && Boolean(value.trim())
  if (!present) return []
  return [{ key, label, text: Array.isArray(value) ? value.join(', ')
    : key === 'runtimeMinutes' ? `${value} minutes` : String(value) }]
}))
</script>

<template>
  <section v-if="rows.length || (media.mediaType === 'book' && media.genres?.length)" class="media-detail-metadata" aria-labelledby="media-metadata-title">
    <h2 id="media-metadata-title">Details</h2>
    <dl v-if="rows.length">
      <div v-for="row in rows" :key="row.key" class="media-detail-metadata__row" :data-field="row.key">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.text }}</dd>
      </div>
    </dl>
    <details v-if="media.mediaType === 'book' && media.genres?.length" class="media-detail-metadata__classifications">
      <summary>Full classifications ({{ media.genres.length }})</summary>
      <ul><li v-for="(classification, index) in media.genres" :key="index">{{ classification }}</li></ul>
    </details>
  </section>
</template>

<style scoped>
.media-detail-metadata { margin-top: 1.5rem; padding: 1.5rem 2rem; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
h2 { margin: 0 0 1.25rem; font-size: 1.2rem; }
dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem 2rem; margin: 0; }
.media-detail-metadata__row { min-width: 0; overflow-wrap: anywhere; }
dt { margin-bottom: 0.35rem; color: var(--color-text-muted); font-size: 0.85rem; }
dd { margin: 0; line-height: 1.6; }
.media-detail-metadata__classifications { margin-top: 1rem; overflow-wrap: anywhere; }
.media-detail-metadata__classifications summary { display: list-item; width: fit-content; max-width: 100%; min-height: 44px; padding: 0.75rem 0.25rem; color: var(--color-primary-ink); font-weight: 650; cursor: pointer; }
.media-detail-metadata__classifications summary:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; border-radius: 0.25rem; }
.media-detail-metadata__classifications ul { margin: 0.5rem 0 0; padding-left: 1.25rem; line-height: 1.6; }
.media-detail-metadata__classifications li + li { margin-top: 0.5rem; }
@media (max-width: 640px) {
  .media-detail-metadata { padding: 1.25rem; }
  dl { grid-template-columns: minmax(0, 1fr); }
}
</style>
