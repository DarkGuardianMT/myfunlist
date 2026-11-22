import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref, shallowRef } from 'vue'
import { addTier, moveMedia, removeMedia, removeTier } from '../prototypes/tier-lists/board.js'
import { useTierLists } from '../src/composables/useTierLists.js'
import { getMediaKey } from '../src/domain/mediaIdentity.js'
import { boardContent, boardSave, decodeBoard, isBoardId, saveOutcome } from '../src/domain/tierLists.js'
import { ApiError, clearCsrfToken, request } from '../src/services/apiClient.js'
import { clearOpenLibraryCache, searchOpenLibrary } from '../src/services/openLibrary.js'
import { tierListRepository } from '../src/services/tierListRepository.js'

const time = '2026-11-22T12:34:56.123456Z'
const media = (source, mediaType, sourceId, title = 'Fixture') => ({ source, mediaType, sourceId, title, artworkImage: null })
const movie = media('tmdb', 'movie', '123')
const tv = media('tmdb', 'tv', '123')
const edition = media('open-library', 'book', 'OL123M', 'Exact Edition')
const fixture = (changes = {}) => ({
  id: '9007199254740993', title: 'Original', description: null, allowedTypes: ['movie', 'tv', 'book', 'game'],
  revision: 1, createdAt: time, updatedAt: time, tiers: [
    { key: 's', name: 'S', color: 'Lime', items: [movie, tv] },
    { key: 'a', name: 'A', color: 'Amber', items: [] },
  ], unranked: [], ...changes,
})
const board = changes => decodeBoard(fixture(changes))
const summary = changes => ({ ...fixture(changes), itemCount: 2 })
const turn = () => new Promise(resolve => setImmediate(resolve))
const timeout = () => new ApiError('timeout', 0, 'request_timeout')
const conflict = () => new ApiError('conflict', 409, 'revision_conflict')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function workspace(t, api = {}, section = 'tier-lists-board') {
  const context = ref({ account: '10', section, id: fixture().id })
  const scope = effectScope()
  const state = scope.run(() => useTierLists(() => context.value, {
    api: { get: async () => board(), ...api }, attempt: shallowRef(null), makeKey: () => 'fixed-uuid', now: () => 1000,
  }))
  t.after(() => scope.stop())
  return { context, state }
}

test('board IDs stay within the unsigned string contract', () => {
  for (const id of ['1', '9007199254740993', '18446744073709551615']) assert.equal(isBoardId(id), true)
  for (const id of [1, '0', '01', '1\n', '1/2', '18446744073709551616']) assert.equal(isBoardId(id), false)
})

test('board responses reject malformed, duplicate, out-of-scope and untrusted media', () => {
  const data = fixture()
  assert.deepEqual(board().tiers.map(tier => tier.id), ['s', 'a'])
  assert.notEqual(getMediaKey(movie), getMediaKey(tv))
  const bad = [
    { id: Number(data.id) }, { revision: '1' }, { createdAt: 'yesterday' }, { allowedTypes: ['book'] },
    { allowedTypes: ['movie', 'movie'] }, { tiers: [] },
    { tiers: [...data.tiers, { ...data.tiers[0] }] }, { tiers: [{ ...data.tiers[0], key: 'unranked' }] },
    { tiers: [{ ...data.tiers[0], key: 's\n' }] }, { unranked: [movie] },
    { unranked: [{ ...edition, sourceId: 'OL123W' }] }, { unranked: [{ ...edition, artworkImage: 'http://example.test/a' }] },
    { unranked: [{ ...edition, artworkImage: 'https://private@example.test/a' }] }, { unranked: [{ ...edition, artworkImage: undefined }] },
    { unranked: Array.from({ length: 100 }, (_, i) => media('tmdb', 'movie', String(1000 + i))) },
  ]
  for (const changes of bad) assert.equal(board(changes), null, JSON.stringify(changes))
})

test('PUT uses only exact identities and preserves order and explicit removals from a dropped tier', () => {
  const saved = board()
  const draft = board()
  draft.title = ' Draft '
  assert.equal(removeTier(draft, 's'), true)
  assert.equal(addTier(draft, 'new-tier-1'), true)
  assert.equal(moveMedia(draft, getMediaKey(tv), 'new-tier-1', 0), true)
  assert.equal(removeMedia(draft, getMediaKey(movie)), true)
  draft.unranked.push(edition)
  assert.deepEqual(boardSave(draft, saved), {
    title: 'Draft', description: null, allowedTypes: saved.allowedTypes, revision: 1,
    tiers: [
      { key: 'a', name: 'A', color: 'Amber', items: [] },
      { key: 'new-tier-1', name: 'New tier', color: 'Slate', items: [{ source: 'tmdb', mediaType: 'tv', sourceId: '123' }] },
    ],
    unranked: [{ source: 'open-library', mediaType: 'book', sourceId: 'OL123M' }],
    removedItems: [{ source: 'tmdb', mediaType: 'movie', sourceId: '123' }],
  })
  draft.allowedTypes = ['game']
  assert.throws(() => boardContent(draft), /allowed media types/)
})

test('repository validates cursor monotonicity, response identities and all request shapes', async () => {
  const calls = []
  let result
  const api = tierListRepository(async (path, options) => { calls.push([path, options]); return result })
  const id = fixture().id
  result = { boards: [summary()], nextCursor: id }
  assert.equal((await api.list(null)).nextCursor, id)
  result = { boards: [summary({ id: '42' })], nextCursor: null }
  assert.equal((await api.list(id)).boards[0].id, '42')
  assert.equal(calls.at(-1)[0], '/api/v1/tier-lists?beforeId=' + id)
  result = { boards: [summary(), summary()], nextCursor: id }
  await assert.rejects(api.list(null), { code: 'invalid_response' })
  result = fixture()
  const current = () => true
  const settings = { title: 'Original', description: null, allowedTypes: result.allowedTypes }
  await api.create(settings, 'retry-same', current)
  assert.deepEqual(calls.at(-1), ['/api/v1/tier-lists', { timeoutMs: 12000, method: 'POST', body: settings, idempotencyKey: 'retry-same', isCurrent: current }])
  await api.get(id, current)
  assert.equal(calls.at(-1)[0], '/api/v1/tier-lists/' + id)
  assert.throws(() => api.get('1\n'), /Invalid tier list ID/)
  result = fixture({ id: '42' })
  await assert.rejects(api.get(id), { code: 'invalid_response' })
  result = fixture({ revision: 2 })
  await api.save(id, { revision: 1 }, current)
  assert.equal(calls.at(-1)[1].method, 'PUT')
  result = null
  await api.remove(id, 2, current)
  assert.deepEqual(calls.at(-1)[1].body, { revision: 2 })
  result = edition
  assert.deepEqual(await api.prepare(id, edition, current), edition)
  assert.deepEqual(calls.at(-1), ['/api/v1/tier-lists/' + id + '/media/prepare', {
    timeoutMs: 12000, method: 'POST', body: { source: 'open-library', mediaType: 'book', sourceId: 'OL123M' }, isCurrent: current,
  }])
  result = { ...edition, sourceId: 'OL456M' }
  await assert.rejects(api.prepare(id, edition), { code: 'invalid_response' })
  await assert.rejects(api.prepare(id, { ...edition, sourceId: 'OL123W' }), /exact media identity/)
})

test('the shared client sends idempotency with CSRF and preserves Retry-After', async t => {
  clearCsrfToken()
  const fetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (path, options) => {
    requests.push([path, options])
    return path.endsWith('/csrf') ? Response.json({ data: { csrfToken: 'synthetic' } })
      : Response.json({ error: { code: 'rate_limited' } }, { status: 429, headers: { 'Retry-After': '11' } })
  }
  t.after(() => { globalThis.fetch = fetch; clearCsrfToken() })
  await assert.rejects(request('/api/v1/tier-lists', { method: 'POST', body: {}, idempotencyKey: 'reuse-this' }),
    error => error.code === 'rate_limited' && error.retryAfter === 11)
  assert.equal(requests[1][1].headers['Idempotency-Key'], 'reuse-this')
  assert.equal(requests[1][1].headers['X-CSRF-Token'], 'synthetic')
  assert.equal(requests[1][1].credentials, 'same-origin')
})

test('isolated Open Library selections recheck authorization instead of reusing another session’s result', async t => {
  clearOpenLibraryCache()
  const fetch = globalThis.fetch
  const data = { provider: 'open-library', providerTotal: 0, items: [],
    omitted: { invalid: 0, duplicateWork: 0, language: 0, isbn: 0 } }
  t.after(() => { globalThis.fetch = fetch; clearOpenLibraryCache() })
  let requests = 0
  globalThis.fetch = async () => ++requests === 1 ? Response.json({ data })
    : Response.json({ error: { code: 'forbidden' } }, { status: 403 })
  assert.deepEqual(await searchOpenLibrary('Synthetic'), data)
  assert.deepEqual(await searchOpenLibrary('Synthetic'), data)
  assert.equal(requests, 1)
  await assert.rejects(searchOpenLibrary('Synthetic', {}, { reuse: false }), { status: 403 })
  assert.equal(requests, 2)
})

test('the overview loads, pages and drops a stale response on account change', async t => {
  const oldPage = deferred()
  const calls = []
  const { state, context } = workspace(t, {
    async list(cursor) {
      calls.push(cursor)
      if (calls.length === 1) return { boards: [summary()], nextCursor: fixture().id }
      if (calls.length === 2) return oldPage.promise
      return { boards: [], nextCursor: null }
    },
  }, 'tier-lists')
  await turn()
  assert.equal(state.boards.value.length, 1)
  const more = state.load(true)
  assert.equal(state.loading.value, true)
  context.value = { ...context.value, account: '20' }
  oldPage.resolve({ boards: [summary({ id: '42' })], nextCursor: null })
  await more
  await turn()
  assert.deepEqual(calls, [null, fixture().id, null])
  assert.deepEqual(state.boards.value, [])
  assert.equal(state.loading.value, false)
})

test('uncertain creation retries the same payload and idempotency key', async t => {
  const first = deferred()
  const calls = []
  const { state } = workspace(t, {
    create(body, key) {
      calls.push({ body, key })
      return calls.length === 1 ? first.promise : Promise.resolve(board())
    },
  }, 'tier-lists-create')
  const fields = { title: ' Initial ', description: '', allowedTypes: ['game', 'movie'] }
  const creating = state.create(fields)
  assert.equal(await state.create(fields), null)
  first.reject(timeout())
  assert.equal(await creating, null)
  assert.match(state.createError.value, /could not be confirmed/)
  assert.equal((await state.create({ ...fields, title: 'Changed' })).id, fixture().id)
  assert.deepEqual(calls, Array(2).fill({ body: { title: 'Initial', description: null, allowedTypes: ['movie', 'game'] }, key: 'fixed-uuid' }))
  assert.equal(state.pendingCreation.value, null)
})

test('Library modifies only the draft; explicit preparation is scoped, serialized and rate-limited', async t => {
  const pending = deferred()
  const calls = []
  const { state } = workspace(t, { prepare: async (_id, item) => { calls.push(item); return pending.promise } })
  await turn()
  assert.equal(state.addToDraft(media('google-books', 'book', 'CaseSensitive')), true)
  assert.equal(state.addToDraft(media('google-books', 'book', 'CaseSensitive')), false)
  assert.deepEqual(calls, [])
  const prepare = state.prepare(edition)
  assert.equal(await state.prepare(edition), false)
  assert.equal(state.draft.value.unranked.length, 1)
  const limited = new ApiError('limited', 429, 'rate_limited')
  limited.retryAfter = 11
  pending.reject(limited)
  await assert.rejects(prepare, { code: 'rate_limited' })
  assert.equal(state.prepareCooldownUntil.value, 12000)
  assert.equal(await state.prepare(edition), false)
  assert.equal(state.saved.value.unranked.length, 0)
})

test('a prepared response is ignored after the picker closes or board changes', async t => {
  const pending = deferred()
  let open = true
  const { context, state } = workspace(t, { prepare: () => pending.promise })
  await turn()
  const prepare = state.prepare(edition, () => open)
  open = false
  context.value = { ...context.value, id: '42' }
  pending.resolve(edition)
  assert.equal(await prepare, false)
  assert.deepEqual(state.draft.value.unranked, [])
})

test('successful Save accepts the authoritative revision and blocks duplicate clicks', async t => {
  const pending = deferred()
  let calls = 0
  const { state } = workspace(t, { save: () => { calls++; return pending.promise } })
  await turn()
  state.draft.value.title = 'New'
  const save = state.save()
  await state.save()
  assert.equal(calls, 1)
  pending.resolve(board({ revision: 2, title: 'New' }))
  await save
  assert.equal(state.saved.value.revision, 2)
  assert.equal(state.dirty.value, false)
})

test('timeout reconciles an exactly matching write without issuing another PUT', async t => {
  let writes = 0
  let reads = 0
  const { state } = workspace(t, {
    get: async () => reads++ ? board({ title: 'New', revision: 2 }) : board(),
    save: async () => { writes++; throw timeout() },
  })
  await turn()
  state.draft.value.title = 'New'
  await state.save()
  assert.equal(writes, 1)
  assert.equal(reads, 2)
  assert.equal(state.savedMessage.value, 'Save confirmed')
  assert.equal(state.dirty.value, false)
})

test('unchanged and unconfirmed writes keep the draft and require a manual action', async t => {
  let checks = 0
  let writes = 0
  const { state } = workspace(t, {
    get: async () => { if (checks++ === 1) throw timeout(); return board() },
    save: async () => { writes++; throw timeout() },
  })
  await turn()
  state.draft.value.title = 'Unsent'
  await state.save()
  await state.save()
  assert.equal(writes, 1)
  assert.equal(state.verifyNeeded.value, true)
  await state.verifySave()
  assert.equal(state.verifyNeeded.value, false)
  assert.match(state.saveError.value, /previous revision/)
  assert.equal(state.draft.value.title, 'Unsent')
  assert.equal(state.dirty.value, true)
})

test('revision conflicts preserve the draft until an explicit reload, and unknown media is recoverable', async t => {
  let calls = 0
  let reads = 0
  const { state } = workspace(t, {
    get: async () => reads++ ? board({ revision: 3, title: 'Remote' }) : board(),
    save: async () => { if (calls++ === 0) throw new ApiError('private', 422, 'unknown_media'); throw conflict() },
  })
  await turn()
  state.draft.value.title = 'Draft'
  await state.save()
  assert.match(state.saveError.value, /unavailable in the catalogue/)
  assert.equal(state.dirty.value, true)
  await state.save()
  assert.equal(state.draft.value.title, 'Draft')
  assert.equal(state.conflictFound.value, true)
  await state.save()
  assert.equal(calls, 2)
  state.reloadLatest()
  assert.equal(state.draft.value.title, 'Remote')
  assert.equal(state.dirty.value, false)
})

test('a late save and session expiry never repopulate private state', async t => {
  const pending = deferred()
  const { state, context } = workspace(t, { save: () => pending.promise })
  await turn()
  state.draft.value.title = 'Old account draft'
  const save = state.save()
  context.value = { ...context.value, account: null }
  pending.resolve(board({ revision: 2, title: 'Old account draft' }))
  await save
  assert.equal(state.draft.value, null)
  assert.equal(state.saved.value, null)
  assert.equal(state.dirty.value, false)
  assert.equal(state.saving.value, false)
})

test('reconciliation distinguishes unrelated revisions and permits ordered exact recovery', () => {
  const original = board()
  const submitted = boardSave({ ...original, title: 'Expected' }, original)
  assert.equal(saveOutcome(board({ revision: 2, title: 'Expected' }), original, submitted), 'saved')
  assert.equal(saveOutcome(board({ revision: 3, title: 'Expected' }), original, submitted), 'conflict')
  assert.equal(saveOutcome(board({ revision: 2, title: 'Other' }), original, submitted), 'conflict')
  assert.equal(saveOutcome(original, original, submitted), 'unchanged')
})
