<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import LibraryAddButton from './LibraryAddButton.vue'
import { useAuth } from '../composables/useAuth.js'
import { useLibrary } from '../composables/useLibrary.js'
import { isSupportedMediaIdentity } from '../domain/mediaIdentity.js'

const props = defineProps({ edition: { type: Object, required: true }, canRenew: { type: Boolean, default: false } })
const emit = defineEmits(['renew-search'])
const { currentUser, isAuthLoading } = useAuth()
const { isLibraryLoaded, isLibraryLoading, libraryError, loadLibrary, hasLibraryItem, addLibraryItem } = useLibrary()
const media = computed(() => ({ source: 'open-library', mediaType: 'book', sourceId: props.edition.editionId, title: props.edition.title }))
const busy = ref(false)
const feedback = ref('')
const failed = ref(false)
const unverifiable = ref(false)
const waiting = ref(false)
let version = 0
let timer

watch([currentUser, isAuthLoading, () => props.edition], () => {
  version++
  busy.value = false
  feedback.value = ''
  failed.value = false
  unverifiable.value = false
  waiting.value = false
  clearTimeout(timer)
  if (currentUser.value && !isAuthLoading.value) retryLibrary()
}, { immediate: true, flush: 'sync' })
onScopeDispose(() => { version++; clearTimeout(timer) })

async function retryLibrary() {
  if (isLibraryLoading.value) return
  try { await loadLibrary() } catch { /* De gedeelde Library-fout biedt een handmatige herkansing. */ }
}

async function save() {
  if (!currentUser.value || isAuthLoading.value || !isLibraryLoaded.value || libraryError.value
    || busy.value || waiting.value || hasLibraryItem(media.value) || !isSupportedMediaIdentity(media.value)) return
  const requestVersion = version
  busy.value = true
  feedback.value = ''
  unverifiable.value = false
  try {
    const result = await addLibraryItem(media.value)
    if (requestVersion !== version) return
    failed.value = false
    feedback.value = result.added ? 'Selected edition added to Library.' : 'This edition is already in your Library.'
  } catch (error) {
    if (requestVersion !== version) return
    failed.value = true
    unverifiable.value = error.code === 'edition_unavailable'
    feedback.value = error.code === 'edition_unavailable'
      ? 'This edition could not be verified. Submit the search again, then check the returned edition before saving.'
      : error.status === 429 || error.status === 503
        ? 'Saving is temporarily unavailable. Please wait before trying again.'
        : 'This edition could not be added. Please try again.'
    if ([429, 503].includes(error.status)) {
      waiting.value = true
      timer = setTimeout(() => { waiting.value = false }, Math.max(60, error.retryAfter || 0) * 1000)
    }
  } finally {
    if (requestVersion === version) busy.value = false
  }
}
</script>

<template>
  <div class="edition-save" :aria-busy="busy || isAuthLoading || isLibraryLoading">
    <p v-if="isAuthLoading" role="status">Checking your session…</p>
    <template v-else-if="!currentUser">
      <RouterLink class="library-add-button" to="/login" :aria-label="`Log in to add: ${edition.title}`">Log in to add</RouterLink>
      <p class="edition-save__note">Sign in, then return to this search to save this edition.</p>
    </template>
    <div v-else-if="libraryError" role="alert">
      <p>Your Library is unavailable.</p>
      <button class="text-button" type="button" @click="retryLibrary">Retry Library</button>
    </div>
    <LibraryAddButton v-else :media="media" :is-library-loaded="isLibraryLoaded" :is-added="hasLibraryItem(media)"
      :is-adding="busy" :has-identity="isSupportedMediaIdentity(media) && !waiting" @add="save" />
    <p v-if="feedback" :role="failed ? 'alert' : 'status'" class="edition-save__note">{{ feedback }}</p>
    <button v-if="unverifiable" class="edition-save__renew" type="button" :disabled="!canRenew || busy || waiting" @click="emit('renew-search')">Search again</button>
    <RouterLink v-if="hasLibraryItem(media)" class="inline-link" :to="`/media/book/open-library/${edition.editionId}`">Open saved edition</RouterLink>
    <p class="edition-save__note">Saves this exact Edition. Edition titles and covers may differ from the Work above.</p>
  </div>
</template>

<style scoped>
.edition-save { min-width: 0; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
.edition-save__note { margin: 0.65rem 0; color: var(--color-text-muted); font-size: var(--text-xs); line-height: 1.65; }
.edition-save__renew { width: 100%; min-height: 44px; padding: 0.4rem; border: 1px solid var(--color-control-border); border-radius: var(--radius-control); background: var(--color-primary-soft); color: var(--color-primary-ink); font: inherit; font-size: var(--text-xs); cursor: pointer; }
.edition-save__renew:disabled { opacity: 0.65; cursor: not-allowed; }
.edition-save__renew:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.edition-save :deep(.library-add-button) { display: inline-flex; justify-content: center; align-items: center; min-height: 44px; width: 100%; box-sizing: border-box; }
</style>
