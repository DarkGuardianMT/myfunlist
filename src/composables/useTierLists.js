import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { addMedia, cloneBoard, isDirty, lanes } from '../../prototypes/tier-lists/board.js'
import { getMediaKey } from '../domain/mediaIdentity.js'
import { boardSave, boardSettings, isBoardId, MAX_BOARD_ITEMS, saveOutcome } from '../domain/tierLists.js'
import { tierListApi } from '../services/tierListRepository.js'
import { currentUser } from './authState.js'

const creationAttempt = shallowRef(null)
watch(() => currentUser.value?.id, () => { creationAttempt.value = null }, { flush: 'sync' })

const uncertain = error => ['network_error', 'request_timeout', 'invalid_response'].includes(error.code) || error.status >= 500
const missing = error => error.status === 404
const conflict = error => error.status === 409 && error.code === 'revision_conflict'
const cooldown = error => error.retryAfter || (error.status === 429 ? 60 : 0)

export function tierListError(error, fallback) {
  if (error.code === 'unknown_media') return 'Some items are unavailable in the catalogue. Remove or prepare them again before saving.'
  if (error.code === 'invalid_csrf') return 'Your session token changed. Sign in again and retry.'
  if (error.code === 'request_timeout') return 'The request timed out. Please try again.'
  if (error.code === 'network_error') return 'We could not reach MyFunList. Check your connection and try again.'
  if (error.status === 429) return 'Too many requests. Please wait before trying again.'
  if (error.code === 'edition_unavailable') return 'This Edition could not be verified. Search again, then inspect and select the returned Edition.'
  if (error.status === 403) return 'You do not have access to this request.'
  if (error.code === 'media_not_found') return 'The provider could not find this exact item.'
  return fallback
}

export function useTierLists(context, { api = tierListApi, attempt = creationAttempt,
  makeKey = () => globalThis.crypto.randomUUID(), now = Date.now } = {}) {
  const boards = shallowRef([])
  const cursor = ref(null)
  const loading = ref(false)
  const loadError = ref('')
  const unavailable = ref(false)
  const saved = shallowRef(null)
  const draft = ref(null)
  const dirty = computed(() => !!draft.value && !!saved.value && isDirty(draft.value, saved.value))
  const includedKeys = computed(() => new Set(draft.value ? lanes(draft.value).flatMap(tier => tier.items.map(getMediaKey)) : []))
  const creating = ref(false)
  const createError = ref('')
  const pendingCreation = computed(() => attempt.value?.account === context().account ? attempt.value : null)
  const saving = ref(false)
  const saveError = ref('')
  const savedMessage = ref('')
  const pendingSave = shallowRef(null)
  const remote = shallowRef(null)
  const conflictFound = ref(false)
  const verifyNeeded = ref(false)
  const mutationCooldownUntil = ref(0)
  const deleting = ref(false)
  const preparing = ref(false)
  const prepareCooldownUntil = ref(0)
  let generation = 0
  let prepareOperation = null
  let activeAccount

  function operation() {
    const version = generation
    return () => version === generation
  }

  function adopt(board, message = '') {
    saved.value = board
    draft.value = cloneBoard(board)
    pendingSave.value = null
    remote.value = null
    conflictFound.value = false
    verifyNeeded.value = false
    saveError.value = ''
    savedMessage.value = message
    unavailable.value = false
  }

  async function load(more = false) {
    const { account, section, id } = context()
    if (!account || loading.value || (more && !cursor.value)) return
    const isCurrent = operation()
    loadError.value = ''
    loading.value = true
    try {
      if (section === 'tier-lists-board') {
        if (!isBoardId(id)) throw { status: 404 }
        const board = await api.get(id, isCurrent)
        if (isCurrent()) adopt(board)
      } else {
        const page = await api.list(more ? cursor.value : null, isCurrent)
        if (!isCurrent()) return
        boards.value = more ? [...boards.value, ...page.boards] : page.boards
        cursor.value = page.nextCursor
      }
    } catch (error) {
      if (!isCurrent()) return
      unavailable.value = section === 'tier-lists-board' && missing(error)
      loadError.value = unavailable.value ? 'This tier list is unavailable or was deleted.'
        : tierListError(error, section === 'tier-lists-board' ? 'We couldn’t load this tier list.' : 'We couldn’t load your tier lists.')
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  watch([() => context().account, () => context().section, () => context().id], ([account, section]) => {
    generation++
    boards.value = []
    cursor.value = null
    saved.value = null
    draft.value = null
    remote.value = null
    pendingSave.value = null
    loadError.value = ''
    createError.value = ''
    saveError.value = ''
    savedMessage.value = ''
    loading.value = false
    creating.value = false
    saving.value = false
    deleting.value = false
    unavailable.value = false
    conflictFound.value = false
    verifyNeeded.value = false
    mutationCooldownUntil.value = 0
    if (activeAccount !== account) {
      activeAccount = account
      prepareOperation = null
      preparing.value = false
      prepareCooldownUntil.value = 0
    }
    if (account && ['tier-lists', 'tier-lists-board'].includes(section)) void load()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { generation++ })

  async function create(fields) {
    const { account } = context()
    if (!account || creating.value || now() < mutationCooldownUntil.value) return null
    const isCurrent = operation()
    createError.value = ''
    let pending = pendingCreation.value
    try {
      if (!pending) {
        pending = { account, body: boardSettings(fields), key: makeKey() }
        attempt.value = pending
      }
      creating.value = true
      const board = await api.create(pending.body, pending.key, isCurrent)
      if (!isCurrent()) return null
      attempt.value = null
      return board
    } catch (error) {
      if (!isCurrent()) return null
      if (!uncertain(error)) attempt.value = null
      mutationCooldownUntil.value = now() + cooldown(error) * 1000
      createError.value = uncertain(error) ? 'Creation could not be confirmed. Retry with the same settings to recover the board.'
        : tierListError(error, error.message && error.status === undefined ? error.message : 'We couldn’t create this tier list.')
      return null
    } finally {
      if (isCurrent()) creating.value = false
    }
  }

  async function reconcile(isCurrent) {
    const pending = pendingSave.value
    if (!pending || !saved.value || !isCurrent()) return
    try {
      const latest = await api.get(saved.value.id, isCurrent)
      if (!isCurrent()) return
      const outcome = pending.body ? saveOutcome(latest, saved.value, pending.body) : 'conflict'
      if (outcome === 'saved' && !pending.conflict) {
        adopt(latest, 'Save confirmed')
      } else if (outcome === 'unchanged' && !pending.conflict) {
        verifyNeeded.value = false
        saveError.value = 'The server still has your previous revision. You can retry Save or check again.'
      } else {
        verifyNeeded.value = false
        conflictFound.value = true
        remote.value = latest
        saveError.value = 'This tier list changed on the server. Your draft is still here. Compare the latest version before reloading.'
      }
    } catch (error) {
      if (!isCurrent()) return
      unavailable.value = missing(error)
      verifyNeeded.value = !unavailable.value
      saveError.value = unavailable.value ? 'This tier list is unavailable or was deleted. Your draft is still here.'
        : 'We couldn’t check the server version. Your draft is still here.'
    }
  }

  async function verifySave() {
    if (!pendingSave.value || saving.value || unavailable.value) return
    const isCurrent = operation()
    saving.value = true
    try { await reconcile(isCurrent) } finally { if (isCurrent()) saving.value = false }
  }

  async function save() {
    if (!dirty.value || saving.value || deleting.value || conflictFound.value || unavailable.value
      || verifyNeeded.value || now() < mutationCooldownUntil.value) return
    const isCurrent = operation()
    const baseline = saved.value
    let body
    saveError.value = ''
    savedMessage.value = ''
    try { body = boardSave(draft.value, baseline) } catch (error) { saveError.value = error.message; return }
    saving.value = true
    pendingSave.value = null
    try {
      const result = await api.save(baseline.id, body, isCurrent)
      if (!isCurrent()) return
      if (saveOutcome(result, baseline, body) !== 'saved') {
        pendingSave.value = { body, conflict: false }
        await reconcile(isCurrent)
      } else adopt(result, 'All changes saved')
    } catch (error) {
      if (!isCurrent()) return
      if (conflict(error) || uncertain(error)) {
        conflictFound.value = conflict(error)
        pendingSave.value = { body, conflict: conflictFound.value }
        await reconcile(isCurrent)
      } else {
        unavailable.value = missing(error)
        mutationCooldownUntil.value = now() + cooldown(error) * 1000
        saveError.value = unavailable.value ? 'This tier list is unavailable or was deleted. Your draft is still here.'
          : tierListError(error, 'We couldn’t save this tier list. Your draft is still here.')
      }
    } finally {
      if (isCurrent()) saving.value = false
    }
  }

  function reloadLatest() {
    if (remote.value) adopt(remote.value, 'Latest version loaded')
  }

  async function deleteBoard() {
    if (!saved.value || saving.value || deleting.value || dirty.value || verifyNeeded.value || conflictFound.value
      || unavailable.value || now() < mutationCooldownUntil.value) return false
    const id = saved.value.id
    const isCurrent = operation()
    deleting.value = true
    saveError.value = ''
    try {
      await api.remove(id, saved.value.revision, isCurrent)
      return isCurrent()
    } catch (error) {
      if (!isCurrent()) return false
      if (missing(error)) return true
      if (conflict(error) || uncertain(error)) {
        pendingSave.value = { conflict: true }
        await reconcile(isCurrent)
        if (isCurrent() && unavailable.value) return true
      } else {
        mutationCooldownUntil.value = now() + cooldown(error) * 1000
        saveError.value = tierListError(error, 'We couldn’t delete the tier list.')
      }
      return false
    } finally {
      if (isCurrent()) deleting.value = false
    }
  }

  function addToDraft(media) {
    if (!draft.value || unavailable.value || saving.value || deleting.value || verifyNeeded.value
      || (pendingSave.value && !conflictFound.value) || includedKeys.value.size >= MAX_BOARD_ITEMS) return false
    const added = addMedia(draft.value, media)
    if (added) savedMessage.value = ''
    return added
  }

  async function prepare(media, pickerIsCurrent = () => true) {
    if (!draft.value || !saved.value || preparationBlocked() || includedKeys.value.has(getMediaKey(media))
      || !draft.value.allowedTypes.includes(media?.mediaType) || includedKeys.value.size >= MAX_BOARD_ITEMS) return false
    const boardIsCurrent = operation()
    const isCurrent = () => boardIsCurrent() && pickerIsCurrent()
    const account = context().account
    const token = {}
    prepareOperation = token
    preparing.value = true
    try {
      const card = await api.prepare(saved.value.id, media, isCurrent)
      return isCurrent() && addToDraft(card)
    } catch (error) {
      if (prepareOperation === token && context().account === account && (error.status === 429 || error.retryAfter)) {
        prepareCooldownUntil.value = now() + cooldown(error) * 1000
      }
      if (boardIsCurrent() && error.code === 'tier_list_not_found') {
        unavailable.value = true
        saveError.value = 'This tier list is unavailable or was deleted. Your draft is still here.'
      }
      if (isCurrent()) throw error
      return false
    } finally {
      if (prepareOperation === token) {
        prepareOperation = null
        preparing.value = false
      }
    }
  }

  function preparationBlocked() {
    const { account } = context()
    return !account || unavailable.value || saving.value || deleting.value || preparing.value || verifyNeeded.value
      || (pendingSave.value && !conflictFound.value) || now() < prepareCooldownUntil.value
  }

  return { boards, cursor, loading, loadError, unavailable, saved, draft, dirty, includedKeys, load,
    creating, createError, pendingCreation, create, saving, saveError, savedMessage, pendingSave,
    remote, conflictFound, verifyNeeded, mutationCooldownUntil, save, verifySave, reloadLatest,
    deleting, deleteBoard, addToDraft, preparing, prepare, prepareCooldownUntil }
}
