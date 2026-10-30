import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { currentUser } from '../src/composables/authState.js'
import { resetLists, useLists } from '../src/composables/useLists.js'
import { advanceAuthEpoch, clearCsrfToken } from '../src/services/apiClient.js'
import { ok, fail } from './support/mediaDetails.js'

const store = useLists()
const originalFetch = globalThis.fetch
const pair = (userMediaId, listId = '1') => ({ listId, userMediaId: String(userMediaId) })
const firstPage = Array.from({ length: 500 }, (_, index) => pair(index + 1))
const page = (memberships = [], nextCursor = null) => ok({ memberships, nextCursor })
const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve
  const promise = new Promise((finish) => { resolve = finish })
  return { promise, resolve }
}
beforeEach(() => {
  currentUser.value = { id: 'A' }
  advanceAuthEpoch()
  resetLists()
  clearCsrfToken()
})
afterEach(() => {
  currentUser.value = null
  advanceAuthEpoch()
  resetLists()
  clearCsrfToken()
  globalThis.fetch = originalFetch
})

test('membership pages publish atomically, deduplicate concurrent consumers and cache confirmed absence', async () => {
  const first = deferred()
  const last = deferred()
  const calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return calls.length === 1 ? first.promise : last.promise
  }
  const pending = Array.from({ length: 40 }, () => store.loadMemberships())
  assert.equal(calls.length, 1)
  first.resolve(page(firstPage, pair(500)))
  await tick()
  assert.equal(store.isMembershipsLoaded.value, false)
  assert.equal(store.isListMember('1', '1'), false)
  assert.equal(calls[1].path, '/api/v1/lists/memberships?afterListId=1&afterEntryId=500')
  last.resolve(page([pair(501), pair('18446744073709551615', '2')]))
  await Promise.all(pending)
  assert.equal(store.isMembershipsLoaded.value, true)
  assert.equal(store.isListMember('1', '501'), true)
  assert.equal(store.isListMember('2', '18446744073709551615'), true)
  assert.equal(store.isListMember('2', '1'), false)
  await store.loadMemberships()
  assert.equal(calls.length, 2)
  assert.ok(calls.every(({ options }) => options.method === 'GET' && options.credentials === 'same-origin' && options.signal))
})

test('failure on a later membership page leaves state unknown and retry starts from the beginning', async () => {
  let calls = 0
  globalThis.fetch = async () => ++calls === 1 ? page(firstPage, pair(500)) : fail(503, 'service_unavailable')
  await assert.rejects(store.loadMemberships())
  assert.equal(store.isMembershipsLoaded.value, false)
  assert.equal(store.isListMember('1', '1'), false)
  await assert.rejects(store.addToList('2', '100', { requireMemberships: true }))
  assert.equal(calls, 2)
  globalThis.fetch = async (path) => {
    assert.equal(path, '/api/v1/lists/memberships')
    return page([pair(1)])
  }
  await store.loadMemberships()
  assert.equal(store.isMembershipsLoaded.value, true)
  assert.equal(store.isListMember('1', '1'), true)
})

for (const payload of [null, {}, { memberships: [], nextCursor: {} },
  { memberships: [pair(0)], nextCursor: null }, { memberships: [{ listId: '1', userMediaId: 1 }], nextCursor: null },
  { memberships: [pair(2), pair(1)], nextCursor: null }, { memberships: [pair(1), pair(1)], nextCursor: null },
  { memberships: firstPage, nextCursor: pair(499) }, { memberships: firstPage, nextCursor: pair(500, '2') },
  { memberships: [...firstPage, pair(501)], nextCursor: null }]) {
  test(`malformed membership page fails closed: ${JSON.stringify(payload)?.slice(0, 90)}`, async () => {
    globalThis.fetch = async () => ok(payload)
    await assert.rejects(store.loadMemberships(), /Invalid membership response/)
    assert.equal(store.isMembershipsLoaded.value, false)
  })
}

test('a non-advancing second page fails without making partial memberships available', async () => {
  let calls = 0
  globalThis.fetch = async () => ++calls === 1 ? page(firstPage, pair(500)) : page([pair(500)])
  await assert.rejects(store.loadMemberships(), /Invalid membership response/)
  assert.equal(store.isMembershipsLoaded.value, false)
  assert.equal(calls, 2)
})

for (const account of [null, 'B']) {
  test(`account reset to ${account} stops pagination and discards late membership results`, async () => {
    const old = deferred()
    let calls = 0
    globalThis.fetch = async () => { calls++; return old.promise }
    const pending = store.loadMemberships()
    currentUser.value = account ? { id: account } : null
    advanceAuthEpoch()
    resetLists()
    if (account) {
      globalThis.fetch = async () => { calls++; return page([pair(900, '2')]) }
      await store.loadMemberships()
    }
    old.resolve(page(firstPage, pair(500)))
    await pending
    assert.equal(calls, account ? 2 : 1)
    assert.equal(store.isListMember('1', '1'), false)
    assert.equal(store.isMembershipsLoaded.value, Boolean(account))
    if (account) assert.equal(store.isListMember('2', '900'), true)
    else await store.loadMemberships()
    assert.equal(calls, account ? 2 : 1)
  })
}

test('concurrent Add consumers share one POST and satisfied repeats submit nothing', async () => {
  const waiting = deferred()
  let posts = 0
  globalThis.fetch = async (path, options) => {
    if (path.endsWith('/memberships')) return page()
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
    assert.equal(options.method, 'POST')
    posts++
    return waiting.promise
  }
  await store.loadMemberships()
  const pending = Array.from({ length: 20 }, () => store.addToList('1', '100', { refreshDetail: false, requireMemberships: true }))
  await tick()
  assert.equal(posts, 1)
  waiting.resolve(ok({ added: true }))
  await Promise.all(pending)
  assert.deepEqual(await store.addToList('1', '100', { refreshDetail: false, requireMemberships: true }), { added: false })
  assert.equal(posts, 1)
})

for (const operation of ['add', 'remove', 'delete']) {
  test(`a local ${operation} during hydration cannot be overwritten by a stale membership page`, async () => {
    const waiting = deferred()
    let reads = 0
    globalThis.fetch = async (path, options) => {
      if (path.endsWith('/memberships')) return ++reads === 1 ? waiting.promise : page(operation === 'add' ? [pair(100)] : [])
      if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
      if (options.method === 'POST') return ok({ added: true })
      if (options.method === 'DELETE') return { ok: true, status: 204 }
      return ok({ list: { id: '1' }, items: [] })
    }
    const pending = store.loadMemberships()
    if (operation === 'add') await store.addToList('1', '100', { refreshDetail: false })
    else if (operation === 'remove') await store.removeFromList('1', '100')
    else await store.deleteCustomList('1')
    waiting.resolve(page(operation === 'add' ? [] : [pair(100)]))
    await pending
    assert.equal(reads, 2)
    assert.equal(store.isMembershipsLoaded.value, true)
    assert.equal(store.isListMember('1', '100'), operation === 'add')
  })
}

test('a pending list detail cannot restore membership removed locally', async () => {
  const oldDetail = deferred()
  let detailReads = 0
  globalThis.fetch = async (path, options) => {
    if (path.endsWith('/memberships')) return page([pair(100)])
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'fixture-csrf' })
    if (options.method === 'DELETE') return { ok: true, status: 204 }
    return ++detailReads === 1 ? oldDetail.promise : ok({ list: { id: '1' }, items: [] })
  }
  await store.loadMemberships()
  const pending = store.loadList('1')
  await store.removeFromList('1', '100')
  oldDetail.resolve(ok({ list: { id: '1' }, items: [{ userMedia: { id: '100' } }] }))
  await pending
  assert.equal(store.isListMember('1', '100'), false)
})
