<script setup>
import { computed, nextTick, ref } from 'vue'
import { MEDIA_CATEGORIES } from '../../src/domain/mediaPresentation.js'
import { getMediaKey } from '../../src/domain/mediaIdentity.js'
import { DISCOVER_MEDIA, LIBRARY_MEDIA, PROVIDERS } from './fixtures.js'
import TierDialog from './TierDialog.vue'
import TierMediaCard from './TierMediaCard.vue'

const props = defineProps({ allowedTypes: Array, includedKeys: Set })
const emit = defineEmits(['add', 'close'])
const tab = ref('library')
const libraryQuery = ref('')
const libraryType = ref('all')
const categories = computed(() => MEDIA_CATEGORIES.filter(({ id }) => props.allowedTypes.includes(id)))
const discoverType = ref(categories.value[0].id)
const discoverQuery = ref('')
const submitted = ref(null)
const renewed = ref(false)
const announcement = ref('')
const tabs = [{ id: 'library', label: 'My Library' }, { id: 'discover', label: 'Discover' }]

const matches = (item, query) => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
const libraryResults = computed(() => LIBRARY_MEDIA.filter(item => props.allowedTypes.includes(item.mediaType)
  && (libraryType.value === 'all' || item.mediaType === libraryType.value) && matches(item, libraryQuery.value)))
const discoverResults = computed(() => submitted.value === null ? [] : DISCOVER_MEDIA.filter(item =>
  item.mediaType === discoverType.value && matches(item, submitted.value)))

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
  document.getElementById(`picker-tab-${next}`)?.focus()
}

function submitSearch() {
  if (!discoverQuery.value.trim()) return
  renewed.value = false
  submitted.value = discoverQuery.value.trim()
}

function pick(item) {
  if (props.includedKeys.has(getMediaKey(item))) return
  emit('add', item)
  announcement.value = `${item.title} added to Unranked.`
}

function renewEdition() {
  renewed.value = true
  announcement.value = 'Sample Edition verified. You can now add it.'
  nextTick(() => document.getElementById('add-sample-edition')?.focus())
}
</script>

<template>
  <TierDialog title="Add media" wide @close="emit('close')">
    <div class="tier-picker-tabs" role="tablist" aria-label="Media source" @keydown="navigateTabs">
      <button v-for="choice in tabs" :id="`picker-tab-${choice.id}`" :key="choice.id" type="button" role="tab"
        :aria-selected="tab === choice.id" :aria-controls="`picker-panel-${choice.id}`"
        :tabindex="tab === choice.id ? 0 : -1" @click="selectTab(choice.id)">{{ choice.label }}</button>
    </div>

    <div id="picker-panel-library" v-show="tab === 'library'" role="tabpanel" aria-labelledby="picker-tab-library">
      <div class="tier-search">
        <label>Search your Library<input v-model="libraryQuery" type="search" placeholder="Search titles" /></label>
        <label>Media type
          <select v-model="libraryType">
            <option value="all">All types</option>
            <option v-for="type in categories" :key="type.id" :value="type.id">{{ type.label }}</option>
          </select>
        </label>
      </div>
      <p v-if="!libraryResults.length" class="tier-picker-message" role="status">No Library items match your filters.</p>
      <div v-else class="tier-picker-grid">
        <TierMediaCard v-for="item in libraryResults" :key="getMediaKey(item)" :media="item">
          <button class="tl-button tier-pick-button" type="button"
            :aria-label="includedKeys.has(getMediaKey(item)) ? `${item.title} is in this Tier List` : `Add ${item.title}`"
            :aria-disabled="includedKeys.has(getMediaKey(item))" @click="pick(item)">
            {{ includedKeys.has(getMediaKey(item)) ? 'In this Tier List' : 'Add' }}
          </button>
        </TierMediaCard>
      </div>
    </div>

    <div id="picker-panel-discover" v-show="tab === 'discover'" role="tabpanel" aria-labelledby="picker-tab-discover">
      <form class="tier-search tier-discover-search" @submit.prevent="submitSearch">
        <label>Media category
          <select v-model="discoverType" @change="submitted = null">
            <option v-for="type in categories" :key="type.id" :value="type.id">{{ type.label }}</option>
          </select>
        </label>
        <label>Search sample titles<input v-model="discoverQuery" type="search" maxlength="120" placeholder="Try Lantern" required /></label>
        <button class="tl-button tl-primary" type="submit">Search</button>
      </form>
      <p v-if="submitted === null" class="tier-picker-message">Choose a category and search the sample catalogue. Nothing is added to My Library.</p>
      <p v-else-if="!discoverResults.length" class="tier-picker-message" role="status">No sample titles matched “{{ submitted }}”.</p>
      <div v-else class="tier-picker-grid">
        <TierMediaCard v-for="item in discoverResults" :key="getMediaKey(item)" :media="item">
          <p class="tier-provider">{{ PROVIDERS[item.source] }}</p>
          <p v-if="item.workId" class="tier-edition">Exact Edition <strong>{{ item.sourceId }}</strong></p>
          <template v-if="item.unavailableExample && !renewed && !includedKeys.has(getMediaKey(item))">
            <p class="tier-edition">Sample Edition unavailable. Search again to verify it.</p>
            <button type="button" class="tl-button tier-pick-button" @click="renewEdition">Search again</button>
          </template>
          <button v-else :id="item.workId ? 'add-sample-edition' : undefined" class="tl-button tier-pick-button" type="button"
            :aria-label="includedKeys.has(getMediaKey(item)) ? `${item.title} is in this Tier List` : `Add ${item.title}`"
            :aria-disabled="includedKeys.has(getMediaKey(item))" @click="pick(item)">
            {{ includedKeys.has(getMediaKey(item)) ? 'In this Tier List' : 'Add to Unranked' }}
          </button>
        </TierMediaCard>
      </div>
    </div>
    <p class="tier-screen-reader" role="status">{{ announcement }}</p>
    <template #footer>
      <button type="button" class="tl-button tl-primary" @click="emit('close')">Done</button>
    </template>
  </TierDialog>
</template>
