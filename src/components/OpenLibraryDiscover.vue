<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { openLibraryDiscoverEnabled, resolveBookProvider } from '../domain/bookProviders.js'
import { normalizeOpenLibraryOptions, openLibraryError, searchOpenLibrary } from '../services/openLibrary.js'
import { useBrowsingReady } from '../router/browsingContext.js'
import OpenLibraryWorkCard from './OpenLibraryWorkCard.vue'

const props = defineProps({ enabled: { type: Boolean, default: openLibraryDiscoverEnabled } })
const route = useRoute()
const router = useRouter()
const query = ref('')
const options = computed(() => normalizeOpenLibraryOptions({ field: route.query.field, language: route.query.lang, languageMode: route.query.mode }))
const submitted = computed(() => typeof route.query.q === 'string' && route.query.q.length <= 200 ? route.query.q.trim() : '')
const status = ref('idle')
const message = ref('')
const data = ref(null)
const waiting = ref(false)
let retryAt = 0
let timer
let generation = 0
let lastError
const labels = { general: 'Title, author, or ISBN', title: 'Book title', author: 'Author name', isbn: 'ISBN-10 or ISBN-13' }

function location(q = submitted.value, filters = options.value) {
  return { path: '/discover', query: { provider: 'open-library', ...(q ? { q } : {}),
    ...(filters.field !== 'general' ? { field: filters.field } : {}),
    ...(filters.language !== 'any' ? { lang: filters.language } : {}),
    ...(filters.languageMode === 'strict' ? { mode: 'strict' } : {}) } }
}
async function load() {
  const version = ++generation
  data.value = null
  message.value = ''
  if (route.path !== '/discover' || route.query.type && route.query.type !== 'book' ||
    resolveBookProvider(route.query.provider, props.enabled) !== 'open-library') return
  if (!props.enabled) { status.value = 'blocked'; return }
  if (!submitted.value) { status.value = 'idle'; return }
  if (Date.now() < retryAt) { status.value = lastError.state; message.value = lastError.message; return }
  status.value = 'loading'
  try {
    const result = await searchOpenLibrary(submitted.value, options.value)
    if (version !== generation) return
    data.value = result
    status.value = result.items.length ? 'success' : 'empty'
  } catch (error) {
    if (version !== generation) return
    lastError = openLibraryError(error)
    status.value = lastError.state
    message.value = lastError.message
    if ([429, 503].includes(error.status)) {
      const seconds = Math.max(error.code === 'provider_busy' ? 2 : 60, error.retryAfter || 0)
      retryAt = Date.now() + seconds * 1000
      waiting.value = true
      clearTimeout(timer)
      timer = setTimeout(() => { waiting.value = false }, seconds * 1000)
    }
  }
}
watch(() => [route.path, route.query.type, route.query.provider, submitted.value, route.query.field, route.query.lang, route.query.mode, props.enabled], () => { query.value = submitted.value; load() }, { immediate: true })
useBrowsingReady('/discover', computed(() => status.value !== 'loading'))
onScopeDispose(() => { generation++; clearTimeout(timer) })
function setFilter(name, value) {
  const filters = normalizeOpenLibraryOptions({ ...options.value, [name]: value })
  return router.push(location(submitted.value, filters))
}
function submit() {
  if (!props.enabled || waiting.value || status.value === 'loading') return
  if (query.value.trim() === submitted.value) return load()
  return router.push(location(query.value.trim()))
}
</script>

<template>
  <section class="discovery-search open-library-discover" aria-labelledby="open-library-search-title" :aria-busy="status === 'loading'">
    <h2 id="open-library-search-title">Search books with Open Library</h2>
    <p>Discover Works, then inspect the edition selected by the catalogue. Modern titles and English, Dutch or Turkish editions may have incomplete metadata.</p>
    <p v-if="!enabled" role="status">Open Library discovery is awaiting operational and policy checks. No search requests are sent. Choose Google Books above to search now.</p>
    <form class="discovery-search__form" role="search" @submit.prevent="submit">
      <label for="open-library-query">{{ labels[options.field] }}</label>
      <div class="discovery-search__controls">
        <input id="open-library-query" v-model="query" type="search" maxlength="200" autocomplete="off" :disabled="!enabled" />
        <button type="submit" :disabled="!enabled || waiting || status === 'loading' || !query.trim()">{{ status === 'loading' ? 'Searching…' : 'Search' }}</button>
      </div>
      <div class="open-library-filters">
        <div>
          <label for="open-library-field">Search in</label>
          <select id="open-library-field" :value="options.field" :disabled="!enabled" @change="setFilter('field', $event.target.value)">
            <option value="general">General</option>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="isbn">ISBN</option>
          </select>
        </div>
        <div>
          <label for="open-library-language">Edition language preference</label>
          <select id="open-library-language" :value="options.language" :disabled="!enabled" @change="setFilter('language', $event.target.value)">
            <option value="any">Any language</option>
            <option value="en">English</option>
            <option value="nl">Dutch</option>
            <option value="tr">Turkish</option>
          </select>
        </div>
        <div>
          <label for="open-library-mode">Language matching</label>
          <select id="open-library-mode" :value="options.languageMode" :disabled="!enabled || options.language === 'any'" @change="setFilter('languageMode', $event.target.value)">
            <option value="preferred">Prefer this language</option>
            <option value="strict">Only matching edition tags</option>
          </select>
        </div>
      </div>
    </form>
    <p>Preference can return other or unknown languages. “Only matching edition tags” excludes unknown, mismatched and ambiguous selections. Results keep catalogue relevance order.</p>
    <div aria-live="polite" aria-atomic="true">
      <p v-if="status === 'idle'">Enter a title, author or ISBN to search.</p>
      <p v-else-if="status === 'loading'" role="status">Searching Open Library for “{{ submitted }}”…</p>
      <p v-else-if="status === 'empty'">No supported Works found for “{{ submitted }}”. Try General or Any language. This does not establish that no edition exists.</p>
      <p v-else-if="message" role="alert">{{ message }}</p>
      <p v-else-if="data">{{ data.items.length }} Works shown for “{{ submitted }}” (up to 10).</p>
      <p v-if="data && Object.values(data.omitted).some(count => count > 0)">Omitted from this bounded response: {{ data.omitted.invalid }} invalid, {{ data.omitted.duplicateWork }} repeated Work, {{ data.omitted.language }} language mismatch/unknown and {{ data.omitted.isbn }} ISBN mismatch.</p>
    </div>
    <button v-if="message && status !== 'invalid'" type="button" :disabled="waiting" @click="load">{{ waiting ? 'Please wait before retrying' : 'Retry search' }}</button>
    <div v-if="data?.items.length" class="open-library-results" aria-label="Open Library Work search results">
      <OpenLibraryWorkCard v-for="work in data.items" :key="work.workId" :work="work" />
    </div>
    <p>Book metadata and covers: <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">Open Library</a>.</p>
  </section>
</template>

<style scoped>
.open-library-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin: 1rem 0; }
.open-library-filters > div { min-width: 0; }
select { width: 100%; min-width: 0; min-height: 44px; padding: 0.5rem; border: 1px solid var(--color-control-border); border-radius: 0.55rem; background: var(--color-surface); color: var(--color-text); font: inherit; }
button { min-height: 44px; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.open-library-results { display: grid; gap: 1rem; margin-top: 1rem; }
@media (max-width: 640px) { .open-library-filters { grid-template-columns: minmax(0, 1fr); } }
</style>
