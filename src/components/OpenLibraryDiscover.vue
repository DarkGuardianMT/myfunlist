<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { openLibraryDiscoverEnabled, resolveBookProvider } from '../domain/bookProviders.js'
import { getOpenLibraryCooldown, normalizeOpenLibraryOptions, openLibraryError, searchOpenLibrary } from '../services/openLibrary.js'
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
let timer
let generation = 0
const labels = { general: 'Title, author, or ISBN', title: 'Book title', author: 'Author name', isbn: 'ISBN-10 or ISBN-13' }

function syncCooldown() {
  const cooldown = getOpenLibraryCooldown()
  clearTimeout(timer)
  waiting.value = Boolean(cooldown)
  if (cooldown) timer = setTimeout(() => { waiting.value = false }, cooldown.retryAt - Date.now())
  return cooldown
}

function location(q = submitted.value, filters = options.value) {
  return { path: '/discover', query: { type: 'book', provider: 'open-library', ...(q ? { q } : {}),
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
  const cooldown = syncCooldown()
  if (!submitted.value) { status.value = 'idle'; return }
  if (cooldown) {
    const error = openLibraryError(cooldown.error)
    status.value = error.state
    message.value = error.message
    return
  }
  status.value = 'loading'
  try {
    const result = await searchOpenLibrary(submitted.value, options.value)
    if (version !== generation) return
    data.value = result
    status.value = result.items.length ? 'success' : 'empty'
  } catch (error) {
    if (version !== generation) return
    const lastError = openLibraryError(error)
    status.value = lastError.state
    message.value = lastError.message
    syncCooldown()
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
    <div class="book-search-panel">
      <div class="book-search-heading">
        <h2 id="open-library-search-title">Search books with Open Library</h2>
        <span class="catalogue-badge">Tester pilot · read-only</span>
      </div>
      <p v-if="!enabled" class="catalogue-state" role="status">Open Library discovery is awaiting operational and policy checks. No search requests are sent. Choose Google Books above to search now.</p>
      <form class="discovery-search__form" role="search" @submit.prevent="submit">
        <label for="open-library-query">{{ labels[options.field] }}</label>
        <div class="discovery-search__controls">
          <input id="open-library-query" v-model="query" type="search" maxlength="200" autocomplete="off" placeholder="A title, an author, a new possibility…" :disabled="!enabled" />
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
      <details class="search-guide">
        <summary>About editions &amp; language matching</summary>
        <p>Discover Works, then inspect the edition selected by the catalogue. Modern titles and English, Dutch or Turkish editions may have incomplete metadata.</p>
        <p>Preference can return other or unknown languages. “Only matching edition tags” excludes unknown, mismatched and ambiguous selections. Results keep catalogue relevance order.</p>
      </details>
    </div>
    <div class="catalogue-summary" :class="{ 'catalogue-state': status !== 'success', 'catalogue-state--error': Boolean(message) }" aria-live="polite" aria-atomic="true">
      <span v-if="data?.items.length" class="result-source">Open Library · Works</span>
      <p v-if="status === 'idle'">Enter a title, author or ISBN to search.</p>
      <p v-else-if="status === 'loading'" role="status">Searching Open Library for “{{ submitted }}”…</p>
      <p v-else-if="status === 'empty'">No supported Works found for “{{ submitted }}”. Try General or Any language. This does not establish that no edition exists.</p>
      <p v-else-if="message" role="alert">{{ message }}</p>
      <p v-else-if="data">{{ data.items.length }} {{ data.items.length === 1 ? 'Work' : 'Works' }} shown for “{{ submitted }}” (up to 10).</p>
      <p v-if="data && Object.values(data.omitted).some(count => count > 0)" class="catalogue-omissions">Omitted from this bounded response: {{ data.omitted.invalid }} invalid, {{ data.omitted.duplicateWork }} repeated Work, {{ data.omitted.language }} language mismatch/unknown and {{ data.omitted.isbn }} ISBN mismatch.</p>
    </div>
    <div v-if="status === 'loading'" class="catalogue-skeletons" aria-hidden="true">
      <div v-for="index in 4" :key="index" class="catalogue-skeleton"><span /><div><i /><i /><i /></div></div>
    </div>
    <button v-if="message && status !== 'invalid'" class="catalogue-retry" type="button" :disabled="waiting" @click="load">{{ waiting ? 'Please wait before retrying' : 'Retry search' }}</button>
    <div v-if="data?.items.length" class="open-library-results" aria-label="Open Library Work search results">
      <OpenLibraryWorkCard v-for="work in data.items" :key="work.workId" :work="work" />
    </div>
    <p class="catalogue-attribution">Book metadata and covers: <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">Open Library</a>.</p>
  </section>
</template>
