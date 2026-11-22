<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { lanes, moveMedia, removeMedia, UNRANKED } from '../../prototypes/tier-lists/board.js'
import TierConfiguration from '../../prototypes/tier-lists/TierConfiguration.vue'
import TierDialog from '../../prototypes/tier-lists/TierDialog.vue'
import TierMediaCard from '../../prototypes/tier-lists/TierMediaCard.vue'
import TierMoveDialog from '../../prototypes/tier-lists/TierMoveDialog.vue'
import '../../prototypes/tier-lists/tier-lists.css'
import MediaTypeIcon from '../components/MediaTypeIcon.vue'
import TierListPicker from '../components/TierListPicker.vue'
import { useAuth } from '../composables/useAuth.js'
import { useTierLists } from '../composables/useTierLists.js'
import { openLibraryDiscoverEnabled } from '../domain/bookProviders.js'
import { getMediaKey } from '../domain/mediaIdentity.js'
import { MEDIA_CATEGORIES } from '../domain/mediaPresentation.js'
import { MAX_BOARD_ITEMS, TIER_LIST_TYPES } from '../domain/tierLists.js'

defineProps({ openLibraryEnabled: { type: Boolean, default: openLibraryDiscoverEnabled } })
const route = useRoute()
const router = useRouter()
const { currentUser, isAuthLoading } = useAuth()
const account = computed(() => currentUser.value?.id ?? null)
const overview = { name: 'tier-lists' }
const creation = { name: 'tier-lists-create' }
const boardRoute = id => ({ name: 'tier-lists-board', params: { id } })
const state = useTierLists(() => ({ account: account.value, section: route.name, id: route.params.id }))
const { boards, cursor, loading, loadError, unavailable, saved, draft, dirty, includedKeys, load,
  creating, createError, pendingCreation, create, saving, saveError, savedMessage, pendingSave,
  remote, conflictFound, verifyNeeded, mutationCooldownUntil, save, verifySave, reloadLatest,
  deleting, deleteBoard, addToDraft, preparing, prepare, prepareCooldownUntil } = state
const fields = () => ({ title: '', description: '', allowedTypes: [...TIER_LIST_TYPES] })
const createFields = ref(fields())
const detailsOpen = ref(false)
const overlay = ref('')
const activeItem = ref(null)
const dragged = ref(null)
const insertion = ref(null)
const announcement = ref('')
const root = ref(null)
let departure
let trigger
let interval
const now = ref(Date.now())
const waitSeconds = computed(() => Math.max(0, Math.ceil((mutationCooldownUntil.value - now.value) / 1000)))
const busy = computed(() => saving.value || deleting.value)
const editingLocked = computed(() => busy.value || unavailable.value || verifyNeeded.value || (pendingSave.value && !conflictFound.value))
const boardLanes = computed(() => draft.value ? lanes(draft.value) : [])
const savedKeys = computed(() => new Set(saved.value?.tiers.map(tier => tier.id)))
const discoverTypes = computed(() => draft.value?.allowedTypes.filter(type => saved.value?.allowedTypes.includes(type)) ?? [])
const labels = Object.fromEntries(MEDIA_CATEGORIES.map(({ id, label }) => [id, label]))

function focusPage() {
  nextTick(() => root.value?.querySelector('h1')?.focus({ preventScroll: true }))
}

watch([() => route.fullPath, account], () => {
  if (!String(route.name).startsWith('tier-lists')) return
  const pending = pendingCreation.value?.body
  createFields.value = pending ? { ...pending, description: pending.description ?? '', allowedTypes: [...pending.allowedTypes] } : fields()
  detailsOpen.value = false
  activeItem.value = null
  announcement.value = ''
  stopDrag()
  if (departure) confirmDeparture(false)
  else overlay.value = ''
  trigger = null
  focusPage()
}, { immediate: true, flush: 'sync' })
watch(loading, (value, previous) => {
  if (!value && previous && route.name === 'tier-lists-board'
    && (document.activeElement === document.body || root.value?.contains(document.activeElement))) focusPage()
})

const unguard = router.beforeEach(to => {
  if (to.fullPath === route.fullPath) return true
  if (busy.value || creating.value || departure) return false
  if (!dirty.value) return true
  openOverlay('leave', document.activeElement)
  return new Promise(resolve => { departure = resolve })
})

function beforeUnload(event) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => {
  interval = setInterval(() => { now.value = Date.now() }, 1000)
  window.addEventListener('beforeunload', beforeUnload)
})
onUnmounted(() => {
  unguard()
  departure?.(false)
  clearInterval(interval)
  window.removeEventListener('beforeunload', beforeUnload)
})

function openOverlay(name, opener) {
  trigger = opener
  overlay.value = name
}
function closeOverlay(focus = trigger) {
  overlay.value = ''
  trigger = null
  nextTick(() => {
    const element = typeof focus === 'string' ? document.getElementById(focus) : focus
    if (element?.isConnected) {
      element.focus({ preventScroll: true })
      element.scrollIntoView({ block: 'nearest' })
    } else if (focus) focusPage()
  })
}
function confirmDeparture(leave) {
  const resolve = departure
  departure = null
  closeOverlay(leave ? null : trigger)
  resolve?.(leave)
}
async function submitCreate() {
  const board = await create(createFields.value)
  if (board) await router.push(boardRoute(board.id))
}
async function confirmDelete() {
  closeOverlay()
  if (await deleteBoard()) await router.push(overview)
}
function loadLatest() {
  reloadLatest()
  closeOverlay(null)
  focusPage()
}
function jump(event) {
  const heading = document.getElementById('tier-' + event.target.value)
  if (heading) {
    heading.focus({ preventScroll: true })
    heading.scrollIntoView({ block: 'start' })
  }
  event.target.value = ''
}
const focusKey = key => 'move-' + key

function moveAction(tier, item, event) {
  activeItem.value = { tier, item }
  openOverlay('move', event.currentTarget)
}
function move(key, destination, position) {
  if (editingLocked.value || !moveMedia(draft.value, key, destination, position)) return
  const tier = boardLanes.value.find(lane => lane.id === destination)
  announcement.value = tier.items[position].title + ' moved to ' + tier.name + ', position ' + (position + 1) + ' of ' + tier.items.length + '.'
}
function moveSelected(destination, position) {
  const key = getMediaKey(activeItem.value.item)
  move(key, destination, position)
  closeOverlay(focusKey(key))
}
function removeSelected() {
  const { item, tier } = activeItem.value
  if (!editingLocked.value && removeMedia(draft.value, getMediaKey(item))) announcement.value = item.title + ' removed from the board.'
  closeOverlay('tier-' + tier.id)
}
function startDrag(event, tier, item, index) {
  if (editingLocked.value) return event.preventDefault()
  dragged.value = { key: getMediaKey(item), tierId: tier.id, index }
  event.dataTransfer.setData('text/plain', dragged.value.key)
  event.dataTransfer.effectAllowed = 'move'
}
function targetDrop(event, tier, item, index = tier.items.length) {
  if (!dragged.value || editingLocked.value) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const bounds = item && event.currentTarget.getBoundingClientRect()
  const after = bounds && event.clientX > bounds.left + bounds.width / 2
  const slot = index + Number(Boolean(after))
  insertion.value = { tierId: tier.id, key: getMediaKey(item), side: after ? 'after' : 'before',
    position: slot - Number(dragged.value.tierId === tier.id && dragged.value.index < slot) }
}
function stopDrag() {
  dragged.value = null
  insertion.value = null
}
function drop(event) {
  if (!dragged.value || !insertion.value) return
  event.preventDefault()
  const { key } = dragged.value
  move(key, insertion.value.tierId, insertion.value.position)
  stopDrag()
  nextTick(() => document.getElementById(focusKey(key))?.focus({ preventScroll: true }))
}
</script>

<template>
  <div ref="root" class="tier-preview tier-integration">
    <section v-if="isAuthLoading" class="tier-state" role="status">
      <h1 tabindex="-1">Tier Lists</h1><p>Checking your session…</p>
    </section>
    <section v-else-if="!account" class="tier-state">
      <h1 tabindex="-1">Tier Lists</h1><p>Log in to open your tier lists.</p>
      <RouterLink class="tl-button tl-primary" to="/login">Log in</RouterLink>
    </section>
    <template v-else-if="route.name === 'tier-lists'">
      <header class="tier-hero">
        <div><h1 tabindex="-1">Tier Lists</h1><p>Rank your favorite movies, shows, books and games in your own tier lists.</p></div>
        <RouterLink class="tl-button tl-primary" :to="creation"><span aria-hidden="true">+</span> Create Tier List</RouterLink>
      </header>
      <div v-if="boards.length" class="tier-board-grid">
        <article v-for="board in boards" :key="board.id" class="tier-board-card">
          <div class="tier-board-art tier-board-art-empty tier-summary-types">
            <span v-for="type in board.allowedTypes" :key="type"><MediaTypeIcon :type="type" /> {{ labels[type] }}</span>
          </div>
          <div class="tier-board-summary">
            <h2>{{ board.title }}</h2>
            <p>{{ board.itemCount }} {{ board.itemCount === 1 ? 'item' : 'items' }}</p>
            <RouterLink class="tl-button" :to="boardRoute(board.id)" :aria-label="'Open ' + board.title">Open tier list <span aria-hidden="true">→</span></RouterLink>
          </div>
        </article>
      </div>
      <section v-if="loading && !boards.length" class="tier-state" role="status">
        <h2>Loading tier lists…</h2><div class="tier-skeleton" aria-hidden="true"></div>
      </section>
      <section v-else-if="loadError" class="tier-state">
        <p role="alert">{{ loadError }}</p>
        <button class="tl-button" type="button" @click="load(boards.length > 0)">Retry</button>
      </section>
      <section v-else-if="!boards.length" class="tier-state">
        <h2>No tier lists yet</h2><p>Create a list and add the media you want to rank.</p>
        <RouterLink class="tl-button tl-primary" :to="creation">Create Tier List</RouterLink>
      </section>
      <button v-if="cursor && !loadError" class="tl-button tier-load-more" type="button" :disabled="loading" @click="load(true)">
        {{ loading ? 'Loading…' : 'Load more tier lists' }}
      </button>
    </template>

    <template v-else-if="route.name === 'tier-lists-create'">
      <RouterLink class="tier-back" :to="overview">← Back to Tier Lists</RouterLink>
      <header class="tier-heading"><h1 tabindex="-1">Create Tier List</h1><p>Start with five tiers. You can customize them in the editor.</p></header>
      <form class="tier-form tier-create-form" @submit.prevent="submitCreate">
        <label>Title<input v-model="createFields.title" maxlength="120" placeholder="Give your tier list a name" :disabled="!!pendingCreation" required /></label>
        <label>Description <span class="tier-muted">(optional)</span><textarea v-model="createFields.description" maxlength="1000" rows="3" :disabled="!!pendingCreation" /></label>
        <fieldset class="tier-type-options" :disabled="!!pendingCreation">
          <legend>Allowed media types</legend><p class="tier-muted">Keep at least one type selected.</p>
          <div><label v-for="type in MEDIA_CATEGORIES" :key="type.id">
            <input v-model="createFields.allowedTypes" type="checkbox" :value="type.id"
              :disabled="createFields.allowedTypes.length === 1 && createFields.allowedTypes.includes(type.id)" /> {{ type.label }}
          </label></div>
        </fieldset>
        <p v-if="createError" class="tier-error" role="alert">{{ createError }}</p>
        <p v-if="waitSeconds" class="tier-muted" role="status">Try again in {{ waitSeconds }} seconds.</p>
        <div class="tier-actions">
          <RouterLink class="tl-button" :to="overview">Cancel</RouterLink>
          <button class="tl-button tl-primary" type="submit" :disabled="creating || !!waitSeconds">
            {{ creating ? 'Creating…' : pendingCreation ? 'Retry creation' : 'Create Tier List' }}
          </button>
        </div>
      </form>
    </template>

    <template v-else-if="route.name === 'tier-lists-board' && draft">
      <RouterLink class="tier-back" :to="overview">← Back to Tier Lists</RouterLink>
      <header class="tier-heading tier-editor-heading">
        <div><h1 tabindex="-1">{{ draft.title || 'Untitled tier list' }}</h1><p v-if="draft.description">{{ draft.description }}</p></div>
        <button class="tl-button" type="button" :aria-expanded="detailsOpen" aria-controls="tier-board-details" :disabled="editingLocked"
          @click="detailsOpen = !detailsOpen">Edit details</button>
      </header>
      <div v-show="detailsOpen" id="tier-board-details" class="tier-form tier-inline-form">
        <label>Title<input v-model="draft.title" maxlength="120" :disabled="editingLocked" required /></label>
        <label>Description<textarea v-model="draft.description" maxlength="1000" rows="2" :disabled="editingLocked" /></label>
        <fieldset class="tier-type-options" :disabled="editingLocked">
          <legend>Allowed media types</legend>
          <div><label v-for="type in MEDIA_CATEGORIES" :key="type.id">
            <input v-model="draft.allowedTypes" type="checkbox" :value="type.id"
              :disabled="draft.allowedTypes.length === 1 && draft.allowedTypes.includes(type.id)" /> {{ type.label }}
          </label></div>
        </fieldset>
        <button class="tl-button tl-danger" type="button" :disabled="editingLocked || dirty || conflictFound || !!waitSeconds"
          @click="openOverlay('delete', $event.currentTarget)">Delete tier list</button>
      </div>
      <div class="tier-editor-controls">
        <div class="tier-actions">
          <button class="tl-button tl-primary" type="button" :disabled="editingLocked || includedKeys.size >= MAX_BOARD_ITEMS"
            @click="openOverlay('picker', $event.currentTarget)"><span aria-hidden="true">+</span> Add media</button>
          <button class="tl-button" type="button" :disabled="editingLocked" @click="openOverlay('tiers', $event.currentTarget)">Configure tiers</button>
          <select class="tier-jump" aria-label="Jump to tier" @change="jump">
            <option value="">Jump to tier</option>
            <option v-for="tier in boardLanes" :key="tier.id" :value="tier.id">{{ tier.name || 'Unnamed tier' }}</option>
          </select>
        </div>
        <div class="tier-save-row">
          <span role="status" :class="{ 'tier-saved': !dirty && savedMessage }">{{ deleting ? 'Deleting…' : saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedMessage || 'No unsaved changes' }}</span>
          <button class="tl-button tl-primary" type="button" :disabled="!dirty || busy || conflictFound || verifyNeeded || unavailable || !!waitSeconds" @click="save">{{ saveError ? 'Retry Save' : 'Save' }}</button>
        </div>
      </div>
      <div v-if="saveError" class="tier-notice">
        <p class="tier-error" role="alert">{{ saveError }}</p>
        <div class="tier-actions">
          <button v-if="pendingSave && !unavailable" class="tl-button" type="button" :disabled="busy" @click="verifySave">Check server version</button>
          <button v-if="remote" class="tl-button" type="button" :disabled="busy" @click="openOverlay('conflict', $event.currentTarget)">Compare versions</button>
        </div>
      </div>
      <p v-if="waitSeconds" class="tier-muted" role="status">Try again in {{ waitSeconds }} seconds.</p>
      <p v-if="includedKeys.size >= MAX_BOARD_ITEMS" class="tier-picker-message">This board has reached its 100-item limit.</p>
      <p v-if="includedKeys.size" class="tier-move-guide"><span class="tier-drag-guide">Drag using the dotted grip. </span>Move shows the full title and placement options.</p>
      <div class="tier-board">
        <section v-for="tier in boardLanes" :key="tier.id" class="tier-lane" :data-color="tier.color" :data-lane="tier.id"
          :class="{ 'tier-unranked': tier.id === UNRANKED, 'tier-lane-target': insertion?.tierId === tier.id && !insertion.key }"
          :aria-labelledby="'tier-' + tier.id" @dragover="targetDrop($event, tier)" @drop="drop">
          <header class="tier-lane-heading">
            <div><h2 :id="'tier-' + tier.id" :class="{ 'tier-name-short': tier.name && tier.name.length <= 4 }" tabindex="-1">{{ tier.name || 'Unnamed tier' }}</h2>
              <p>{{ tier.items.length }} {{ tier.items.length === 1 ? 'item' : 'items' }}</p></div>
            <button v-if="tier.id === UNRANKED && !tier.items.length" type="button" class="tl-button" :disabled="editingLocked || includedKeys.size >= MAX_BOARD_ITEMS"
              @click="openOverlay('picker', $event.currentTarget)">Add media</button>
          </header>
          <p v-if="!tier.items.length" class="tier-lane-empty">{{ tier.id === UNRANKED ? 'New media appears here before you rank it.' : 'Move or drop media here.' }}</p>
          <ul v-else class="tier-card-grid">
            <li v-for="(item, index) in tier.items" :key="getMediaKey(item)"
              :data-insertion="insertion?.tierId === tier.id && insertion.key === getMediaKey(item) ? insertion.side : undefined"
              @dragover.stop="targetDrop($event, tier, item, index)">
              <TierMediaCard :media="item">
                <button :id="focusKey(getMediaKey(item))" class="tl-button tier-item-action" type="button"
                  :aria-label="'Move or remove ' + item.title" aria-haspopup="dialog" :disabled="editingLocked" :draggable="!editingLocked"
                  @dragstart.stop="startDrag($event, tier, item, index)" @dragend="stopDrag"
                  @click="moveAction(tier, item, $event)"><span class="tier-item-grip" aria-hidden="true"></span>Move</button>
              </TierMediaCard>
            </li>
          </ul>
        </section>
      </div>
      <p class="tier-screen-reader" role="status">{{ announcement }}</p>
    </template>

    <section v-else class="tier-state">
      <h1 tabindex="-1">{{ loading ? 'Loading tier list…' : 'Tier list unavailable' }}</h1>
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <button v-if="loadError && !unavailable" class="tl-button" type="button" @click="load()">Retry</button>
      <RouterLink class="tier-back" :to="overview">← Back to Tier Lists</RouterLink>
    </section>

    <TierListPicker v-if="overlay === 'picker' && draft" :allowed-types="draft.allowedTypes" :discover-types="discoverTypes"
      :included-keys="includedKeys" :add-library="addToDraft" :prepare="prepare" :preparing="preparing"
      :prepare-cooldown-until="prepareCooldownUntil" :open-library-enabled="openLibraryEnabled" @close="closeOverlay()" />
    <TierConfiguration v-if="overlay === 'tiers' && draft" :board="draft" :saved-keys="savedKeys" :name-limit="40"
      @announce="announcement = $event" @close="closeOverlay()" />
    <TierMoveDialog v-if="overlay === 'move' && activeItem" :item="activeItem.item" :origin="activeItem.tier" :lanes="boardLanes"
      @move="moveSelected" @remove="removeSelected" @close="closeOverlay()" />
    <TierDialog v-if="overlay === 'leave'" title="Leave with unsaved changes?" @close="confirmDeparture(false)">
      <p>Your draft will be discarded if you leave.</p>
      <template #footer>
        <button class="tl-button" type="button" @click="confirmDeparture(false)">Keep editing</button>
        <button class="tl-button tl-danger" type="button" @click="confirmDeparture(true)">Discard and leave</button>
      </template>
    </TierDialog>
    <TierDialog v-if="overlay === 'delete'" title="Delete this tier list?" @close="closeOverlay()">
      <p>{{ saved.title }} and its rankings will be removed. Your Library stays intact.</p>
      <template #footer>
        <button class="tl-button" type="button" @click="closeOverlay()">Cancel</button>
        <button class="tl-button tl-danger" type="button" @click="confirmDelete">Delete tier list</button>
      </template>
    </TierDialog>
    <TierDialog v-if="overlay === 'conflict' && remote" title="Compare versions" wide @close="closeOverlay()">
      <div class="tier-comparison">
        <section v-for="version in [{ label: 'Your draft', board: draft }, { label: 'On the server', board: remote }]" :key="version.label">
          <h3>{{ version.label }}</h3>
          <p><strong>{{ version.board.title }}</strong> · Revision {{ version.board.revision }}</p>
          <p v-if="version.board.description">{{ version.board.description }}</p>
          <p>{{ version.board.allowedTypes.map(type => labels[type]).join(', ') }}</p>
          <dl><template v-for="tier in lanes(version.board)" :key="tier.id">
            <dt>{{ tier.name }} · {{ tier.color }}</dt>
            <dd><ol v-if="tier.items.length"><li v-for="item in tier.items" :key="getMediaKey(item)">{{ item.title }} · {{ labels[item.mediaType] }}</li></ol><span v-else>Empty</span></dd>
          </template></dl>
        </section>
      </div>
      <template #footer>
        <button class="tl-button" type="button" @click="closeOverlay()">Keep draft</button>
        <button class="tl-button tl-danger" type="button" @click="loadLatest">Discard draft and reload</button>
      </template>
    </TierDialog>
  </div>
</template>

<style scoped>
.tier-summary-types { display: flex; flex-wrap: wrap; align-content: center; align-items: center; gap: 0.65rem 0.85rem; padding: 1rem; }
.tier-summary-types span { display: inline-flex; align-items: center; gap: 0.32rem; font-size: var(--text-sm); }
.tier-summary-types :deep(svg) { width: 1rem; height: 1rem; }
.tier-load-more { margin-top: 1rem; }
.tier-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; overflow-wrap: anywhere; }
.tier-comparison dt { font-weight: 700; }
.tier-comparison dd { margin: 0 0 0.75rem; }
.tier-comparison ol { padding-inline-start: 1.3rem; }
@media (max-width: 600px) { .tier-comparison { grid-template-columns: 1fr; } }
</style>
