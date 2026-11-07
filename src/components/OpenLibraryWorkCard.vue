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
      <div v-else class="open-library-work__fallback">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 8c-4-3-9-3-13-1v19c4-2 9-2 13 1 4-3 9-3 13-1V7c-4-2-9-2-13 1Zm0 0v19" /></svg>
        <span>No cover available</span>
      </div>
    </div>
    <div class="open-library-work__intro">
      <span class="open-library-work__type">Work</span>
      <h3 :title="work.workTitle">{{ work.workTitle }}</h3>
      <p class="open-library-work__authors">{{ work.authors.length ? work.authors.join(', ') : 'Author information unavailable' }}</p>
      <p class="open-library-work__publication">First publication (Work): <span>{{ work.firstPublicationYear ?? 'Unknown' }}</span></p>
      <p class="open-library-work__language">Edition tags: {{ edition?.languages.length ? edition.languages.map(code => languageNames[code] || code).join(', ') : 'Not supplied' }}</p>
      <a class="open-library-work__source" :href="`https://openlibrary.org/works/${work.workId}`" target="_blank" rel="noopener noreferrer">View Work on Open Library <span aria-hidden="true">↗</span></a>
    </div>
    <details class="edition-details">
      <summary :aria-label="`Inspect selected edition for ${work.workTitle}`">
        <span>Edition details</span><span class="edition-details__hint" aria-hidden="true">{{ chosen ? 'Preview selected' : 'Inspect edition' }} <span class="edition-details__arrow">⌄</span></span>
      </summary>
      <div class="edition-details__body">
        <p class="edition-details__note">The search supplies at most one selected edition per Work. This is not a complete edition catalogue. Change language or search by ISBN to look for another selection.</p>
        <dl class="edition-details__metadata">
          <div><dt>Work: </dt><dd>{{ work.workId }}</dd></div>
          <div><dt>Work title: </dt><dd>{{ work.workTitle }}</dd></div>
          <div><dt>Authors: </dt><dd>{{ work.authors.length ? work.authors.join(', ') : 'Author information unavailable' }}</dd></div>
          <div><dt>Reported editions: </dt><dd>{{ work.editionCount ?? 'Unknown' }}</dd></div>
          <div v-if="work.cover"><dt>Cover source: </dt><dd>{{ work.provenance?.cover?.field === 'editions.docs[0].cover_i' ? 'Selected edition cover' : 'Work cover; edition cover unavailable' }}</dd></div>
        </dl>
        <template v-if="edition">
          <dl class="edition-details__metadata edition-details__metadata--edition">
            <div><dt>Edition: </dt><dd>{{ edition.editionId }}</dd></div>
            <div><dt>Edition title: </dt><dd>{{ edition.title || 'Unavailable' }}</dd></div>
            <div><dt>Edition publication: </dt><dd>{{ edition.publicationDates.join('; ') || 'Unknown' }}</dd></div>
            <div><dt>Edition language tags: </dt><dd>{{ edition.languages.map(code => languageNames[code] || code).join(', ') || 'Unknown' }} ({{ edition.languageStatus }})</dd></div>
            <div><dt>ISBN: </dt><dd>{{ edition.isbns.join(', ') || 'Unavailable' }}</dd></div>
          </dl>
          <p class="edition-details__note">Language tags describe catalogue metadata; content language has not been independently verified.</p>
          <p v-if="!canChoose" class="edition-details__note">This selection cannot be chosen: the title is missing or language metadata is conflicting, mismatched or ambiguous.</p>
          <button type="button" :disabled="!canChoose || chosen" @click="chosen = true">{{ chosen ? 'Edition selected for preview' : 'Use this edition for preview' }}</button>
          <p v-if="chosen" class="edition-details__selection" role="status">Preview selection: {{ work.workId }} / {{ edition.editionId }}. The catalogue association is not independently verified.</p>
          <a :href="`https://openlibrary.org/books/${edition.editionId}`" target="_blank" rel="noopener noreferrer">View edition on Open Library</a>
        </template>
        <p v-else class="edition-details__note">No supported edition was supplied. This Work cannot be selected as an edition.</p>
        <p class="edition-details__note edition-details__read-only">Saving Open Library editions to your Library is not available yet.</p>
      </div>
    </details>
  </article>
</template>

<style scoped>
.open-library-work {
  display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; align-items: start;
  gap: 1rem; min-width: 0; overflow-wrap: anywhere;
}
.open-library-work:has(.edition-details[open]) { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.open-library-work__cover { width: 100%; aspect-ratio: 2 / 3; padding: 0.4rem; overflow: hidden; background: var(--color-surface-soft); border: 1px solid var(--color-border); border-radius: var(--radius-card); }
.open-library-work__cover img { display: block; width: 100%; height: 100%; object-fit: contain; }
.open-library-work__fallback { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 0.5rem; color: var(--color-text-muted); font: 1rem/1.3 var(--font-display); text-align: center; }
.open-library-work__fallback svg { width: 2rem; fill: none; stroke: currentColor; stroke-width: 1; }
.open-library-work__intro { min-width: 0; }
.open-library-work__type { display: inline-block; margin-bottom: 0.45rem; color: var(--color-primary-ink); font-size: 0.65rem; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase; }
h3 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 0; font: 650 1rem/1.4 var(--font-display); letter-spacing: -0.025em; }
.open-library-work__authors { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 0.45rem 0 0.75rem; font-size: var(--text-sm); line-height: 1.4; color: var(--color-text-muted); }
.open-library-work__publication, .open-library-work__language { margin: 0.35rem 0; font-size: var(--text-xs); line-height: 1.5; color: var(--color-text-muted); }
.open-library-work__publication span { color: var(--color-text); }
a { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 44px; color: var(--color-primary-ink); font-size: var(--text-xs); text-underline-offset: 0.2em; }
.edition-details { grid-column: 1 / -1; min-width: 0; border-top: 1px solid var(--color-border); }
summary { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 44px; padding-top: 0.5rem; list-style: none; cursor: pointer; font-size: var(--text-xs); font-weight: 650; }
summary::-webkit-details-marker { display: none; }
.edition-details__hint { color: var(--color-primary-ink); font-weight: 500; font-size: 0; }
.edition-details__arrow { font-size: 1rem; }
.edition-details__arrow { display: inline-block; margin-left: 0.25rem; }
.edition-details[open] .edition-details__arrow { transform: rotate(180deg); }
.edition-details__body { padding-top: 0.75rem; }
.edition-details__note { margin: 0 0 1rem; font-size: var(--text-xs); line-height: 1.65; color: var(--color-text-muted); }
.edition-details__metadata { display: grid; gap: 0.65rem; margin: 0 0 1rem; padding: 1rem; background: var(--color-surface-soft); border-radius: var(--radius-control); font-size: var(--text-xs); line-height: 1.6; }
.edition-details__metadata > div { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 0.5rem; }
dt { color: var(--color-text-muted); }
dd { margin: 0; }
.edition-details__metadata--edition { border-left: 2px solid var(--color-primary-ink); }
button { width: 100%; min-height: 44px; border: 1px solid var(--color-control-border); border-radius: var(--radius-control); background: var(--color-primary-soft); color: var(--color-primary-ink); padding: 0.7rem; font: inherit; font-size: var(--text-xs); font-weight: 650; cursor: pointer; }
button:hover:not(:disabled) { background: var(--color-primary); color: var(--color-on-primary); }
button:disabled { cursor: not-allowed; opacity: 0.65; }
.edition-details__selection { padding: 0.75rem; border: 1px solid var(--color-control-border); border-radius: var(--radius-control); font-size: var(--text-xs); line-height: 1.6; color: var(--color-primary-ink); }
.edition-details__read-only { margin-bottom: 0; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
summary:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
@media (min-width: 851px) {
  .open-library-work:has(.edition-details[open]) { grid-column: 1 / -1; grid-template-columns: minmax(170px, 220px) minmax(0, 1fr); padding: 1.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); gap: 1.5rem; }
  .edition-details__body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 1.5rem; }
  .edition-details__body > * { grid-column: 1 / -1; }
  .edition-details__body > .edition-details__metadata { grid-column: auto; align-self: start; }
  .edition-details__body > button { width: fit-content; min-width: 16rem; }
}
@media (max-width: 640px) {
  .open-library-work { gap: 0.75rem; }
  .edition-details__metadata > div { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); }
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .open-library-work { transition: border-color 150ms ease, box-shadow 150ms ease; }
  .open-library-work:hover { border-color: var(--color-control-border); }
}
</style>
