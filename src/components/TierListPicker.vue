<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TierDialog from '../../prototypes/tier-lists/TierDialog.vue'
import TierMediaCard from '../../prototypes/tier-lists/TierMediaCard.vue'
import { useLibrary } from '../composables/useLibrary.js'
import { tierListError } from '../composables/useTierLists.js'
import { getMediaKey, isSupportedMediaIdentity } from '../domain/mediaIdentity.js'
import { MEDIA_CATEGORIES } from '../domain/mediaPresentation.js'
import { libraryCard, MAX_BOARD_ITEMS } from '../domain/tierLists.js'
import { getGoogleBooksErrorMessage, searchBooks } from '../services/googleBooks.js'
import { getRawgErrorMessage, getTmdbErrorMessage, searchGames, searchMovies, searchTvShows } from '../services/mediaDiscovery.js'
import { forgetOpenLibraryEdition, forgetOpenLibrarySearch, getOpenLibraryCooldown, openLibraryError, searchOpenLibrary } from '../services/openLibrary.js'

const props = defineProps({
  allowedTypes: { type: Array, required: true },
  discoverTypes: { type: Array, required: true },
  includedKeys: { type: Set, required: true },
  addLibrary: { type: Function, required: true },
  prepare: { type: Function, required: true },
  preparing: Boolean,
  prepareCooldownUntil: Number,
  openLibraryEnabled: Boolean,
})
const emit = defineEmits(['close'])
const { displayLibraryItems, isLibraryLoaded, isLibraryLoading, libraryError, loadLibrary } = useLibrary()
const tab = ref('library')
const tabs = [{ id: 'library', label: 'My Library' }, { id: 'discover', label: 'Discover' }]
const libraryQuery = ref('')
const libraryType = ref('all')
const categories = computed(() => MEDIA_CATEGORIES.filter(({ id }) => props.allowedTypes.includes(id)))
const discoverCategories = computed(() => MEDIA_CATEGORIES.filter(({ id }) => props.discoverTypes.includes(id)))
const discoverType = ref(discoverCategories.value[0]?.id ?? '')
const provider = ref(props.openLibraryEnabled ? 'open-library' : 'google-books')
const discoverQuery = ref('')
const submitted = ref(null)
const results = ref([])
const searching = ref(false)
const searchError = ref('')
const selectionError = ref('')
const rejected = ref(new Map())
const pendingKey = ref(null)
const announcement = ref('')
const now = ref(Date.now())
const searchCooldowns = ref({})
let version = 0
let closed = false
let timer

const sources = { tmdb: 'TMDb', rawg: 'RAWG', 'google-books': 'Google Books', 'open-library': 'Open Library' }
const activeProvider = computed(() => discoverType.value === 'book' ? provider.value : discoverType.value === 'game' ? 'rawg' : 'tmdb')
const full = computed(() => props.includedKeys.size >= MAX_BOARD_ITEMS)
const prepareSeconds = computed(() => Math.max(0, Math.ceil(((props.prepareCooldownUntil || 0) - now.value) / 1000)))
const searchSeconds = computed(() => Math.max(0, Math.ceil(((searchCooldowns.value[activeProvider.value] || 0) - now.value) / 1000)))
const libraryResults = computed(() => {
  const query = libraryQuery.value.trim().toLocaleLowerCase()
  return displayLibraryItems.value.map(entry => libraryCard(entry?.media)).filter(item => item
    && props.allowedTypes.includes(item.mediaType) && (libraryType.value === 'all' || item.mediaType === libraryType.value)
    && item.title.toLocaleLowerCase().includes(query))
})

async function readLibrary() {
  try { await loadLibrary() } catch { /* De gedeelde status toont een fout zonder accountgegevens. */ }
}
onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 500)
  void readLibrary()
})
onBeforeUnmount(() => {
  closed = true
  version++
  clearInterval(timer)
})

function selectTab(id) {
  tab.value = id
  announcement.value = ''
}
function navigateTabs(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 'library' : event.key === 'End' ? 'discover'
    : tab.value === 'library' ? 'discover' : 'library'
  selectTab(next)
  document.getElementById('picker-tab-' + next)?.focus()
}
watch([discoverType, provider], () => {
  version++
  results.value = []
  submitted.value = null
  searching.value = false
  searchError.value = ''
  selectionError.value = ''
  if (activeProvider.value === 'open-library') observeOpenLibraryCooldown()
})
watch(tab, value => { if (value === 'discover' && activeProvider.value === 'open-library') observeOpenLibraryCooldown() })

function observeOpenLibraryCooldown() {
  const cooldown = getOpenLibraryCooldown()
  if (cooldown) searchCooldowns.value = { ...searchCooldowns.value, 'open-library': cooldown.retryAt }
}

function openLibraryResult(work) {
  const edition = work.selectedEdition
  const usable = edition && !!edition.title?.trim() && !['ambiguous', 'inconsistent', 'mismatch'].includes(edition.languageStatus)
  const card = libraryCard({
    source: 'open-library', mediaType: 'book', sourceId: edition?.editionId,
    title: edition?.title?.trim() || work.workTitle,
    artworkImage: work.provenance?.cover?.field === 'editions.docs[0].cover_i' ? work.cover?.url : null,
  })
  return {
    key: work.workId, workTitle: work.workTitle, editionId: edition?.editionId,
    card: card || { mediaType: 'book', title: work.workTitle, artworkImage: work.cover?.url || null },
    selectable: Boolean(usable && card),
  }
}

const searches = { movie: searchMovies, tv: searchTvShows, game: searchGames, book: searchBooks }
async function runSearch(query = discoverQuery.value.trim(), renew = false) {
  if (!query || searching.value || props.preparing || searchSeconds.value || !discoverCategories.value.length) return
  const type = discoverType.value
  const source = activeProvider.value
  const exactQuery = query.trim()
  const request = ++version
  const refresh = source === 'open-library' && (renew || [...rejected.value.values()].includes(exactQuery))
  submitted.value = exactQuery
  searching.value = true
  searchError.value = ''
  selectionError.value = ''
  results.value = []
  try {
    if (source === 'open-library') {
      if (!props.openLibraryEnabled) return
      if (refresh) forgetOpenLibrarySearch(exactQuery)
      // Een nieuwe sessie moet opnieuw langs de serverautorisatie van de pilot.
      const result = await searchOpenLibrary(exactQuery, {}, { reuse: false, isCurrent: () => request === version })
      if (request !== version) return
      results.value = result.items.map(openLibraryResult)
      if (refresh) {
        const next = new Map(rejected.value)
        for (const item of results.value) {
          if (item.selectable && next.get(item.editionId) === exactQuery) next.delete(item.editionId)
        }
        rejected.value = next
      }
    } else {
      const result = await searches[type](exactQuery)
      if (request !== version) return
      const seen = new Set()
      for (const media of result) {
        const card = libraryCard(media)
        const key = getMediaKey(card)
        if (card && card.mediaType === type && card.source === source && !seen.has(key)) {
          seen.add(key)
          results.value.push({ key, card, selectable: true })
        }
      }
    }
  } catch (error) {
    if (request !== version) return
    if (source === 'open-library') {
      observeOpenLibraryCooldown()
      searchError.value = openLibraryError(error).message
    } else {
      const format = source === 'google-books' ? getGoogleBooksErrorMessage : source === 'rawg' ? getRawgErrorMessage : getTmdbErrorMessage
      searchError.value = format(error)
      if (error.retryAfter || error.status === 429 || error.code === 'rate-limited') {
        searchCooldowns.value = { ...searchCooldowns.value, [source]: Date.now() + (error.retryAfter || 60) * 1000 }
      }
    }
  } finally {
    if (request === version) searching.value = false
  }
}

function pickLibrary(item) {
  if (full.value || props.includedKeys.has(getMediaKey(item))) return
  if (props.addLibrary(item)) announcement.value = item.title + ' added to Unranked.'
}
async function pickDiscover(result) {
  const item = result.card
  const key = getMediaKey(item)
  if (!result.selectable || !isSupportedMediaIdentity(item) || rejected.value.has(result.editionId)
    || props.includedKeys.has(key) || full.value || pendingKey.value || props.preparing || prepareSeconds.value) return
  const searchVersion = version
  const isCurrent = () => !closed && version === searchVersion
  const query = submitted.value
  pendingKey.value = key
  selectionError.value = ''
  try {
    if (await props.prepare(item, isCurrent) && isCurrent()) announcement.value = item.title + ' added to Unranked.'
  } catch (error) {
    if (!isCurrent()) return
    selectionError.value = tierListError(error, 'We couldn’t prepare this item. You can retry by selecting it again.')
    if (error.code === 'edition_unavailable' && item.source === 'open-library') {
      forgetOpenLibraryEdition(item.sourceId)
      rejected.value = new Map(rejected.value).set(item.sourceId, query)
      nextTick(() => document.getElementById('renew-' + item.sourceId)?.focus())
    }
  } finally {
    if (isCurrent()) pendingKey.value = null
  }
}
</script>

<template>
  <TierDialog title="Add media" wide @close="emit('close')">
    <div class="tier-picker-tabs" role="tablist" aria-label="Media source" @keydown="navigateTabs">
      <button v-for="choice in tabs" :id="'picker-tab-' + choice.id" :key="choice.id" type="button" role="tab"
        :aria-selected="tab === choice.id" :aria-controls="'picker-panel-' + choice.id"
        :tabindex="tab === choice.id ? 0 : -1" @click="selectTab(choice.id)">{{ choice.label }}</button>
    </div>
    <p v-if="full" class="tier-picker-message" role="status">This board has reached its 100-item limit.</p>

    <div id="picker-panel-library" v-show="tab === 'library'" role="tabpanel" aria-labelledby="picker-tab-library">
      <div class="tier-search">
        <label>Search your Library<input v-model="libraryQuery" type="search" placeholder="Search titles" /></label>
        <label>Media type<select v-model="libraryType">
          <option value="all">All types</option>
          <option v-for="type in categories" :key="type.id" :value="type.id">{{ type.label }}</option>
        </select></label>
      </div>
      <p v-if="isLibraryLoading" class="tier-picker-message" role="status">Loading your Library…</p>
      <div v-else-if="libraryError" class="tier-notice">
        <p class="tier-error" role="alert">We couldn’t load your Library.</p>
        <button type="button" class="tl-button" @click="readLibrary">Retry Library</button>
      </div>
      <p v-else-if="isLibraryLoaded && !libraryResults.length" class="tier-picker-message" role="status">No Library items match your filters.</p>
      <div v-else class="tier-picker-grid">
        <TierMediaCard v-for="item in libraryResults" :key="getMediaKey(item)" :media="item">
          <button type="button" class="tl-button tier-pick-button"
            :aria-label="includedKeys.has(getMediaKey(item)) ? item.title + ' is in this Tier List' : 'Add ' + item.title"
            :aria-disabled="full || includedKeys.has(getMediaKey(item))" @click="pickLibrary(item)">
            {{ includedKeys.has(getMediaKey(item)) ? 'In this Tier List' : 'Add' }}
          </button>
        </TierMediaCard>
      </div>
    </div>

    <div id="picker-panel-discover" v-show="tab === 'discover'" role="tabpanel" aria-labelledby="picker-tab-discover">
      <p v-if="!discoverCategories.length" class="tier-picker-message">Save your allowed media types before searching Discover.</p>
      <form v-else class="tier-search tier-discover-search" @submit.prevent="runSearch()">
        <label>Media category<select v-model="discoverType" :disabled="preparing">
          <option v-for="type in discoverCategories" :key="type.id" :value="type.id">{{ type.label }}</option>
        </select></label>
        <label v-if="discoverType === 'book' && openLibraryEnabled">Book provider<select v-model="provider" :disabled="preparing">
          <option value="open-library">Open Library</option><option value="google-books">Google Books</option>
        </select></label>
        <label>Search Discover<input v-model="discoverQuery" type="search" maxlength="120" required placeholder="Search titles" /></label>
        <button class="tl-button tl-primary" type="submit" :disabled="searching || preparing || !!searchSeconds">Search</button>
      </form>
      <p v-if="searchSeconds" class="tier-picker-message" role="status">Search again in {{ searchSeconds }} seconds.</p>
      <p v-if="activeProvider === 'google-books' && results.length" class="google-attribution">
        <a href="https://books.google.com" target="_blank" rel="noopener noreferrer"><img src="https://books.google.com/googlebooks/images/poweredby.png" alt="Powered by Google" /></a>
      </p>
      <p v-if="prepareSeconds" class="tier-picker-message" role="status">You can prepare another item in {{ prepareSeconds }} seconds.</p>
      <p v-if="selectionError" class="tier-notice tier-error" role="alert">{{ selectionError }}</p>
      <p v-if="searching" class="tier-picker-message" role="status">Searching…</p>
      <div v-else-if="searchError" class="tier-notice">
        <p class="tier-error" role="alert">{{ searchError }}</p>
        <button class="tl-button" type="button" :disabled="!!searchSeconds || preparing" @click="runSearch(submitted)">Retry search</button>
      </div>
      <p v-else-if="submitted !== null && !results.length" class="tier-picker-message" role="status">No results matched “{{ submitted }}”.</p>
      <div v-else-if="results.length" class="tier-picker-grid">
        <TierMediaCard v-for="result in results" :key="result.key" :media="result.card">
          <p class="tier-provider">{{ sources[activeProvider] }}</p>
          <template v-if="result.workTitle">
            <p v-if="result.workTitle !== result.card.title" class="tier-edition">Work {{ result.workTitle }}</p>
            <p v-if="result.editionId" class="tier-edition">Exact Edition <strong>{{ result.editionId }}</strong></p>
          </template>
          <p v-if="!result.selectable" class="tier-edition">This result has no available, unambiguous Edition.</p>
          <button v-else-if="rejected.has(result.editionId)" :id="'renew-' + result.editionId" class="tl-button tier-pick-button" type="button"
            :disabled="preparing || !!searchSeconds || !!prepareSeconds" @click="runSearch(submitted, true)">Search again</button>
          <button v-else class="tl-button tier-pick-button" type="button"
            :aria-label="includedKeys.has(getMediaKey(result.card)) ? result.card.title + ' is in this Tier List' : 'Add ' + result.card.title + ' to Unranked'"
            :aria-disabled="includedKeys.has(getMediaKey(result.card)) || full || preparing || !!prepareSeconds"
            @click="pickDiscover(result)">
            {{ includedKeys.has(getMediaKey(result.card)) ? 'In this Tier List' : pendingKey === getMediaKey(result.card) ? 'Preparing…' : 'Add to Unranked' }}
          </button>
        </TierMediaCard>
      </div>
    </div>
    <p class="tier-screen-reader" role="status">{{ announcement }}</p>
    <template #footer><button type="button" class="tl-button tl-primary" @click="emit('close')">Done</button></template>
  </TierDialog>
</template>

<style scoped>
.tier-discover-search { display: flex; flex-wrap: wrap; }
.tier-discover-search label { min-width: 0; flex: 1 1 8rem; }
.tier-discover-search label:has(input) { flex-grow: 2; }
@media (max-width: 480px) { .tier-discover-search label { flex-basis: 100%; } }
</style>
