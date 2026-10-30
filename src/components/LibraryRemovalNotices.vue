<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { cancelUnsentLibraryRemovals, useLibrary } from '../composables/useLibrary.js'

const { removalNotices, undoLibraryRemoval, dismissRemovalNotice } = useLibrary()
const panel = ref(null)
const announcement = ref('')
const errorAnnouncement = ref('')
const undoId = (id) => `library-removal-undo-${id}`
const noticeId = (id) => `library-removal-${id}`

function message(notice) {
  const title = `“${notice.title}”`
  if (notice.state === 'pending') return `Removal of ${title} is pending. Undo within 8 seconds to keep its status, rating and Custom Lists.`
  if (notice.state === 'deleting') return `Removing ${title} from your Library and Custom Lists… Undo is no longer available.`
  if (notice.state === 'removed') return `${title} was removed from your Library and Custom Lists.`
  if (notice.state === 'undone') return `Removal of ${title} was undone. Its status, rating and Custom Lists are unchanged.`
  if (notice.state === 'cancelled') return `Removal of ${title} was cancelled before it was sent.`
  return `Removal of ${title} could not be confirmed. It is shown again. Refresh to check before removing it again.`
}

watch(() => removalNotices.value.at(-1)?.id, async (id) => {
  if (!removalNotices.value.some((notice) => notice.id === id && notice.state === 'pending')) return
  await nextTick()
  document.getElementById(undoId(id))?.focus()
})

watch(removalNotices, async (notices, previous) => {
  const changed = notices.filter((notice) => previous.find((entry) => entry.id === notice.id)?.state !== notice.state)
  announcement.value = changed.filter((notice) => notice.state !== 'error').map(message).join(' ')
  errorAnnouncement.value = changed.filter((notice) => notice.state === 'error').map(message).join(' ')
  const focused = previous.find((notice) => document.activeElement?.id === undoId(notice.id))
  if (!focused || notices.find((notice) => notice.id === focused.id)?.state !== 'deleting') return
  await nextTick()
  document.getElementById(noticeId(focused.id))?.focus({ preventScroll: true })
})

async function undo(notice) {
  if (!undoLibraryRemoval(notice.id)) return
  await nextTick()
  const target = document.getElementById(`remove-library-${notice.entryId}`)
    || document.getElementById(noticeId(notice.id))?.querySelector('button')
  target?.focus({ preventScroll: true })
}

async function dismiss(notice) {
  dismissRemovalNotice(notice.id)
  await nextTick()
  const target = panel.value?.querySelector('button') || document.querySelector('#main-content h1, #page-title')
  if (target) {
    if (target.tagName === 'H1') target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }
}

onMounted(() => window.addEventListener('pagehide', cancelUnsentLibraryRemovals))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', cancelUnsentLibraryRemovals)
  cancelUnsentLibraryRemovals()
})
</script>

<template>
  <p class="library-removal-announcement" role="status" aria-atomic="true">{{ announcement }}</p>
  <p class="library-removal-announcement" role="alert" aria-atomic="true">{{ errorAnnouncement }}</p>
  <section v-show="removalNotices.length" ref="panel" class="library-removal-notices" aria-label="Library removals">
    <p class="library-removal-notices__help">Refresh or close this tab to cancel removals that have not been sent. Sent requests may still complete.</p>
    <article v-for="notice in removalNotices" :id="noticeId(notice.id)" :key="notice.id" tabindex="-1" :aria-labelledby="`${noticeId(notice.id)}-message`">
      <p :id="`${noticeId(notice.id)}-message`" :class="{ 'library-removal-notices__error': notice.state === 'error' }">{{ message(notice) }}</p>
      <button v-if="notice.state === 'pending'" :id="undoId(notice.id)" type="button" :aria-label="`Undo removal of ${notice.title}`" @click="undo(notice)">Undo</button>
      <button v-else-if="notice.state !== 'deleting'" type="button" :aria-label="`Dismiss removal notice for ${notice.title}`" @click="dismiss(notice)">Dismiss</button>
    </article>
  </section>
</template>

<style scoped>
.library-removal-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.library-removal-notices { position: fixed; z-index: 25; right: max(1rem, env(safe-area-inset-right)); bottom: 1rem; width: min(28rem, calc(100% - 2rem)); max-height: 45vh; overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box; padding: 0.85rem; border: 1px solid var(--color-control-border); border-radius: var(--radius-card); background: var(--color-surface); color: var(--color-text); box-shadow: var(--shadow-card); overflow-wrap: anywhere; }
.library-removal-notices__help { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--color-text-muted); }
.library-removal-notices article { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; padding: 0.65rem 0; border-top: 1px solid var(--color-border); }
.library-removal-notices article > p { flex: 1 1 12rem; min-width: 0; margin: 0; line-height: 1.5; }
.library-removal-notices__error { color: var(--color-danger-ink); }
.library-removal-notices button { flex: 0 0 auto; min-width: 44px; min-height: 44px; padding: 0.6rem 0.85rem; border: 1px solid var(--color-primary); border-radius: 0.5rem; background: var(--color-primary-soft); color: var(--color-primary-ink); font: inherit; font-weight: 650; cursor: pointer; }
.library-removal-notices button:hover { background: var(--color-surface-soft); }
.library-removal-notices article:focus { outline: 2px solid var(--color-primary-ink); outline-offset: -2px; }
@media (max-width: 640px) { .library-removal-notices { bottom: calc(5rem + env(safe-area-inset-bottom)); } }
</style>
