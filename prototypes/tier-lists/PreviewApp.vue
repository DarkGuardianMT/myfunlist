<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MediaArtwork from '../../src/components/MediaArtwork.vue'
import { getMediaKey } from '../../src/domain/mediaIdentity.js'
import { MEDIA_CATEGORIES } from '../../src/domain/mediaPresentation.js'
import { addMedia, cloneBoard, isDirty, lanes, makeBoard, MEDIA_TYPES, moveMedia, removeMedia, simulateSave, UNRANKED } from './board.js'
import { sampleBoards } from './fixtures.js'
import PreviewHeader from './PreviewHeader.vue'
import TierConfiguration from './TierConfiguration.vue'
import TierDialog from './TierDialog.vue'
import TierMediaCard from './TierMediaCard.vue'
import TierMediaPicker from './TierMediaPicker.vue'
import TierMoveDialog from './TierMoveDialog.vue'

const route = useRoute()
const router = useRouter()
const theme = ref('dark')
const boards = ref(sampleBoards())
const draft = ref(null)
const overviewState = ref('boards')
const createFields = ref({ title: '', description: '', allowedTypes: [...MEDIA_TYPES] })
const createError = ref('')
const detailsOpen = ref(false)
const saving = ref(false)
const saveError = ref('')
const saveMessage = ref('')
const failNextSave = ref(false)
const announcement = ref('')
const overlay = ref('')
const activeItem = ref(null)
const dragged = ref(null)
const insertion = ref(null)
let nextBoard = 1
let resolveDeparture
let overlayTrigger

const saved = computed(() => boards.value.find(board => board.id === route.params.id))
const dirty = computed(() => !!draft.value && !!saved.value && isDirty(draft.value, saved.value))
const boardLanes = computed(() => draft.value ? lanes(draft.value) : [])
const includedKeys = computed(() => new Set(boardLanes.value.flatMap(tier => tier.items.map(getMediaKey))))
const sectionNames = { home: 'Home', discover: 'Discover', library: 'Library', lists: 'Lists', profile: 'Profile', login: 'Log in' }

function focusPage() {
  nextTick(() => document.querySelector('main h1')?.focus({ preventScroll: true }))
}

watch(() => route.fullPath, () => {
  draft.value = route.name === 'editor' && saved.value ? cloneBoard(saved.value) : null
  if (route.name === 'create') createFields.value = { title: '', description: '', allowedTypes: [...MEDIA_TYPES] }
  createError.value = ''
  if (route.name === 'overview') overviewState.value = 'boards'
  overlay.value = ''
  activeItem.value = null
  detailsOpen.value = false
  saveError.value = ''
  saveMessage.value = ''
  failNextSave.value = false
  announcement.value = ''
  focusPage()
}, { immediate: true })

const unguard = router.beforeEach(to => {
  if (to.fullPath === route.fullPath) return true
  if (saving.value || resolveDeparture) return false
  if (!dirty.value) return true
  openOverlay('leave', document.activeElement)
  return new Promise(resolve => { resolveDeparture = resolve })
})
onUnmounted(unguard)

watch(theme, value => { document.documentElement.dataset.theme = value })

function openOverlay(name, trigger) {
  overlayTrigger = trigger
  overlay.value = name
}

function closeOverlay(focus = overlayTrigger) {
  overlay.value = ''
  overlayTrigger = null
  nextTick(() => {
    const element = typeof focus === 'string' ? document.getElementById(focus) : focus
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'nearest' })
  })
}

function confirmDeparture(leave) {
  const resolve = resolveDeparture
  resolveDeparture = null
  closeOverlay(leave ? null : overlayTrigger)
  resolve?.(leave)
}

function previewArt(board) {
  return board.tiers.flatMap(tier => tier.items).filter(item => item.artworkImage).slice(0, 3)
}

function itemCount(board) {
  return board.unranked.length + board.tiers.reduce((count, tier) => count + tier.items.length, 0)
}

function createBoard() {
  const board = makeBoard(`sample-${nextBoard}`, createFields.value)
  if (!board) {
    createError.value = 'Enter a title and choose at least one media type.'
    document.getElementById('new-board-title').focus()
    return
  }
  nextBoard++
  boards.value.unshift(board)
  router.push({ name: 'editor', params: { id: board.id } })
}

async function save() {
  if (!dirty.value || saving.value) return
  saving.value = true
  saveError.value = ''
  saveMessage.value = ''
  const fail = failNextSave.value
  failNextSave.value = false
  try {
    const snapshot = await simulateSave(draft.value, { fail })
    boards.value[boards.value.findIndex(board => board.id === snapshot.id)] = snapshot
    draft.value = cloneBoard(snapshot)
    saveMessage.value = 'All changes saved'
  } catch (error) {
    saveError.value = error.message
  } finally {
    saving.value = false
  }
}

function jump(event) {
  const heading = document.getElementById(`tier-${event.target.value}`)
  if (heading) {
    heading.focus({ preventScroll: true })
    heading.scrollIntoView({ block: 'start' })
  }
  event.target.value = ''
}

function focusKey(mediaKey) {
  return `move-${mediaKey}`
}

function pickMedia(media) {
  if (addMedia(draft.value, media)) saveMessage.value = ''
}

function moveAction(tier, item, event) {
  activeItem.value = { tier, item }
  openOverlay('move', event.currentTarget)
}

function move(key, destination, position) {
  if (!moveMedia(draft.value, key, destination, position)) return
  const tier = boardLanes.value.find(tier => tier.id === destination)
  announcement.value = `${tier.items[position].title} moved to ${tier.name}, position ${position + 1} of ${tier.items.length}.`
  saveMessage.value = ''
}

function moveSelected(destination, position) {
  const key = getMediaKey(activeItem.value.item)
  move(key, destination, position)
  closeOverlay(focusKey(key))
}

function removeSelected() {
  const { item, tier } = activeItem.value
  if (removeMedia(draft.value, getMediaKey(item))) {
    announcement.value = `${item.title} removed from the board.`
    saveMessage.value = ''
  }
  closeOverlay(`tier-${tier.id}`)
}

function startDrag(event, tier, item, index) {
  if (saving.value) return event.preventDefault()
  dragged.value = { key: getMediaKey(item), tierId: tier.id, index }
  event.dataTransfer.setData('text/plain', dragged.value.key)
  event.dataTransfer.effectAllowed = 'move'
}

function targetDrop(event, tier, item, index = tier.items.length) {
  if (!dragged.value) return
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
  <a class="skip-link" href="#tier-preview-content" @click.prevent="focusPage">Skip to content</a>
  <PreviewHeader :theme="theme" @theme="theme = theme === 'light' ? 'dark' : 'light'" />
  <main id="tier-preview-content" class="page-content tier-preview">
    <p class="tier-preview-note">Tier Lists preview <span aria-hidden="true">·</span> Sample data</p>

    <template v-if="route.name === 'overview'">
      <header class="tier-hero">
        <div>
          <h1 tabindex="-1">Tier Lists</h1>
          <p>Rank your favorite movies, shows, books and games in your own tier lists.</p>
        </div>
        <RouterLink class="tl-button tl-primary" :to="{ name: 'create' }"><span aria-hidden="true">+</span> Create Tier List</RouterLink>
      </header>
      <div v-if="overviewState === 'boards'" class="tier-board-grid">
        <article v-for="board in boards" :key="board.id" class="tier-board-card">
          <div v-if="previewArt(board).length" class="tier-board-art" aria-hidden="true">
            <MediaArtwork v-for="item in previewArt(board)" :key="getMediaKey(item)" :media="item" :linked="false" />
          </div>
          <div v-else class="tier-board-art tier-board-art-empty">No ranked media</div>
          <div class="tier-board-summary">
            <h2>{{ board.title }}</h2>
            <p>{{ itemCount(board) }} {{ itemCount(board) === 1 ? 'item' : 'items' }} · {{ board.unranked.length }} unranked</p>
            <RouterLink class="tl-button" :to="{ name: 'editor', params: { id: board.id } }" :aria-label="`Open ${board.title}`">Open tier list <span aria-hidden="true">→</span></RouterLink>
          </div>
        </article>
      </div>
      <section v-else-if="overviewState === 'empty'" class="tier-state">
        <h2>No tier lists yet</h2>
        <p>Create a list and add the media you want to rank.</p>
        <RouterLink class="tl-button tl-primary" :to="{ name: 'create' }">Create Tier List</RouterLink>
      </section>
      <section v-else-if="overviewState === 'loading'" class="tier-state" role="status">
        <h2>Loading tier lists…</h2>
        <div class="tier-skeleton" aria-hidden="true"></div>
      </section>
      <section v-else class="tier-state">
        <div role="alert"><h2>We couldn’t load tier lists</h2><p>This preview is showing a simulated loading error.</p></div>
        <button class="tl-button" type="button" @click="overviewState = 'boards'">Retry</button>
      </section>
      <label class="tier-scenario">Preview overview state
        <select v-model="overviewState">
          <option value="boards">Sample tier lists</option><option value="empty">Empty</option>
          <option value="loading">Loading</option><option value="error">Load error</option>
        </select>
      </label>
    </template>

    <template v-else-if="route.name === 'create'">
      <RouterLink class="tier-back" :to="{ name: 'overview' }">← Back to Tier Lists</RouterLink>
      <header class="tier-heading"><h1 tabindex="-1">Create Tier List</h1><p>Start with five tiers. You can customize them in the editor.</p></header>
      <form class="tier-form tier-create-form" @submit.prevent="createBoard">
        <label>Title<input id="new-board-title" v-model="createFields.title" maxlength="120" placeholder="Give your tier list a name" required /></label>
        <label>Description <span class="tier-muted">(optional)</span><textarea v-model="createFields.description" maxlength="1000" rows="3" placeholder="What are you ranking?" /></label>
        <fieldset class="tier-type-options">
          <legend>Allowed media types</legend>
          <p class="tier-muted">Keep at least one type selected.</p>
          <div>
            <label v-for="type in MEDIA_CATEGORIES" :key="type.id">
              <input v-model="createFields.allowedTypes" type="checkbox" :value="type.id"
                :disabled="createFields.allowedTypes.length === 1 && createFields.allowedTypes.includes(type.id)" />
              {{ type.label }}
            </label>
          </div>
        </fieldset>
        <p v-if="createError" class="tier-error" role="alert">{{ createError }}</p>
        <div class="tier-actions">
          <RouterLink class="tl-button" :to="{ name: 'overview' }">Cancel</RouterLink>
          <button class="tl-button tl-primary" type="submit">Create Tier List</button>
        </div>
      </form>
    </template>

    <template v-else-if="route.name === 'editor' && draft">
      <RouterLink class="tier-back" :to="{ name: 'overview' }">← Back to Tier Lists</RouterLink>
      <header class="tier-heading tier-editor-heading">
        <div>
          <h1 tabindex="-1">{{ draft.title || 'Untitled tier list' }}</h1>
          <p v-if="draft.description">{{ draft.description }}</p>
        </div>
        <button class="tl-button" type="button" :aria-expanded="detailsOpen" aria-controls="tier-board-details" :disabled="saving"
          @click="detailsOpen = !detailsOpen">Edit details</button>
      </header>
      <div v-show="detailsOpen" id="tier-board-details" class="tier-form tier-inline-form">
        <label>Title<input v-model="draft.title" maxlength="120" :disabled="saving" required /></label>
        <label>Description<textarea v-model="draft.description" maxlength="1000" rows="2" :disabled="saving" /></label>
      </div>
      <div class="tier-editor-controls">
        <div class="tier-actions">
          <button class="tl-button tl-primary" type="button" :disabled="saving" @click="openOverlay('picker', $event.currentTarget)"><span aria-hidden="true">+</span> Add media</button>
          <button class="tl-button" type="button" :disabled="saving" @click="openOverlay('tiers', $event.currentTarget)">Configure tiers</button>
          <select class="tier-jump" aria-label="Jump to tier" @change="jump">
            <option value="">Jump to tier</option>
            <option v-for="tier in boardLanes" :key="tier.id" :value="tier.id">{{ tier.name || 'Unnamed tier' }}</option>
          </select>
        </div>
        <div class="tier-save-row">
          <span role="status" :class="{ 'tier-saved': !dirty && saveMessage }">{{ saving ? 'Saving…' : dirty ? 'Unsaved changes' : saveMessage || 'No unsaved changes' }}</span>
          <button class="tl-button tl-primary" type="button" :disabled="!dirty || saving" @click="save">{{ saveError ? 'Retry save' : 'Save' }}</button>
        </div>
      </div>
      <p v-if="saveError" class="tier-notice tier-error" role="alert">{{ saveError }}</p>
      <div class="tier-board">
        <section v-for="tier in boardLanes" :key="tier.id" class="tier-lane"
          :data-color="tier.color" :data-lane="tier.id" :class="{ 'tier-unranked': tier.id === UNRANKED,
            'tier-lane-target': insertion?.tierId === tier.id && !insertion.key }"
          :aria-labelledby="`tier-${tier.id}`" @dragover="targetDrop($event, tier)" @drop="drop">
          <header class="tier-lane-heading">
            <div><h2 :id="`tier-${tier.id}`" tabindex="-1">{{ tier.name || 'Unnamed tier' }}</h2>
              <p>{{ tier.items.length }} {{ tier.items.length === 1 ? 'item' : 'items' }}</p>
            </div>
            <button v-if="tier.id === UNRANKED && !tier.items.length" type="button" class="tl-button" :disabled="saving"
              @click="openOverlay('picker', $event.currentTarget)">Add media</button>
          </header>
          <p v-if="!tier.items.length" class="tier-lane-empty">{{ tier.id === UNRANKED ? 'New media appears here before you rank it.' : 'Move or drop media here.' }}</p>
          <ul v-else class="tier-card-grid">
            <li v-for="(item, index) in tier.items" :key="getMediaKey(item)"
              :data-insertion="insertion?.tierId === tier.id && insertion.key === getMediaKey(item) ? insertion.side : undefined"
              @dragover.stop="targetDrop($event, tier, item, index)">
              <TierMediaCard :media="item">
                <button :id="focusKey(getMediaKey(item))" class="tl-button tier-item-action" type="button"
                  :aria-label="`Move or remove ${item.title}`" :disabled="saving" draggable="true"
                  @dragstart.stop="startDrag($event, tier, item, index)" @dragend="stopDrag"
                  @click="moveAction(tier, item, $event)"><span aria-hidden="true">⠿</span> Move</button>
              </TierMediaCard>
            </li>
          </ul>
        </section>
      </div>
      <label class="tier-scenario tier-checkbox"><input v-model="failNextSave" type="checkbox" :disabled="saving" /> Simulate the next save failing</label>
      <p class="tier-screen-reader" role="status">{{ announcement }}</p>
    </template>

    <section v-else class="tier-heading">
      <h1 tabindex="-1">{{ sectionNames[route.params.section] || 'Tier list unavailable' }}</h1>
      <p>{{ route.name === 'section' ? 'This destination is shown for navigation review. The preview only contains Tier Lists.' : 'Open a sample tier list from the overview.' }}</p>
      <RouterLink class="tl-button tl-primary" :to="{ name: 'overview' }">Go to Tier Lists</RouterLink>
    </section>
  </main>

  <TierMediaPicker v-if="overlay === 'picker'" :allowed-types="draft.allowedTypes" :included-keys="includedKeys"
    @add="pickMedia" @close="closeOverlay()" />
  <TierConfiguration v-if="overlay === 'tiers'" :board="draft" @announce="announcement = $event" @close="closeOverlay()" />
  <TierMoveDialog v-if="overlay === 'move'" :item="activeItem.item" :origin="activeItem.tier" :lanes="boardLanes"
    @move="moveSelected" @remove="removeSelected" @close="closeOverlay()" />
  <TierDialog v-if="overlay === 'leave'" title="Leave with unsaved changes?" @close="confirmDeparture(false)">
    <p>Your last saved version will still be available in this preview.</p>
    <template #footer>
      <button class="tl-button" type="button" @click="confirmDeparture(false)">Keep editing</button>
      <button class="tl-button tl-danger" type="button" @click="confirmDeparture(true)">Discard and leave</button>
    </template>
  </TierDialog>
</template>
