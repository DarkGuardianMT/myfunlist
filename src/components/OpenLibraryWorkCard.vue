<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({ work: { type: Object, required: true } })
const failedCover = ref(false)
const chosen = ref(false)
const edition = computed(() => props.work.selectedEdition)
const canChoose = computed(() => edition.value?.title?.trim() && !['inconsistent', 'mismatch', 'ambiguous'].includes(edition.value.languageStatus))
const languageNames = { eng: 'English', dut: 'Dutch', tur: 'Turkish' }
watch(() => props.work, () => { failedCover.value = false; chosen.value = false })
</script>

<template>
  <article class="open-library-work">
    <div class="open-library-work__cover">
      <img v-if="work.cover && !failedCover" :src="work.cover.url" :alt="`Catalogue cover for ${work.workTitle}`" loading="lazy" @error="failedCover = true" />
      <p v-else>No cover available</p>
      <small v-if="work.cover">{{ work.provenance?.cover?.field === 'editions.docs[0].cover_i' ? 'Selected edition cover' : 'Work cover; edition cover unavailable' }}</small>
    </div>
    <div>
      <h3>{{ work.workTitle }}</h3>
      <p>{{ work.authors.length ? work.authors.join(', ') : 'Author information unavailable' }}</p>
      <p><strong>Work:</strong> {{ work.workId }}</p>
      <p><strong>First publication (Work):</strong> {{ work.firstPublicationYear ?? 'Unknown' }}</p>
      <p><strong>Reported editions:</strong> {{ work.editionCount ?? 'Unknown' }}</p>
      <a :href="`https://openlibrary.org/works/${work.workId}`" target="_blank" rel="noopener noreferrer">View Work on Open Library</a>
      <details>
        <summary>Inspect selected edition for {{ work.workTitle }}</summary>
        <p>The search supplies at most one selected edition per Work. This is not a complete edition catalogue. Change language or search by ISBN to look for another selection.</p>
        <template v-if="edition">
          <p><strong>Edition:</strong> {{ edition.editionId }}</p>
          <p><strong>Edition title:</strong> {{ edition.title || 'Unavailable' }}</p>
          <p><strong>Edition publication:</strong> {{ edition.publicationDates.join('; ') || 'Unknown' }}</p>
          <p><strong>Edition language tags:</strong> {{ edition.languages.map(code => languageNames[code] || code).join(', ') || 'Unknown' }} ({{ edition.languageStatus }})</p>
          <p>Language tags describe catalogue metadata; content language has not been independently verified.</p>
          <p><strong>ISBN:</strong> {{ edition.isbns.join(', ') || 'Unavailable' }}</p>
          <p v-if="!canChoose">This selection cannot be chosen: the title is missing or language metadata is conflicting, mismatched or ambiguous.</p>
          <button type="button" :disabled="!canChoose || chosen" @click="chosen = true">{{ chosen ? 'Edition selected for preview' : 'Use this edition for preview' }}</button>
          <p v-if="chosen" role="status">Preview selection: {{ work.workId }} / {{ edition.editionId }}. The catalogue association is not independently verified.</p>
          <a :href="`https://openlibrary.org/books/${edition.editionId}`" target="_blank" rel="noopener noreferrer">View edition on Open Library</a>
        </template>
        <p v-else>No supported edition was supplied. This Work cannot be selected as an edition.</p>
        <p>Saving Open Library editions to your Library is not available yet.</p>
      </details>
    </div>
  </article>
</template>

<style scoped>
.open-library-work { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: 1rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-surface); overflow-wrap: anywhere; }
h3 { margin-top: 0; }
p { line-height: 1.5; }
img { width: 100%; height: auto; }
small { display: block; }
a { color: var(--color-primary-ink); display: inline-flex; align-items: center; min-height: 44px; }
summary { cursor: pointer; min-height: 44px; padding: 0.6rem 0; }
button { min-height: 44px; padding: 0.65rem; font: inherit; }
summary:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
@media (max-width: 400px) { .open-library-work { grid-template-columns: minmax(0, 1fr); } .open-library-work__cover { max-width: 6rem; } }
</style>
