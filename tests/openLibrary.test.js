import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { clearOpenLibraryCache, normalizeOpenLibraryOptions, searchOpenLibrary, openLibraryError, validIsbn } from '../src/services/openLibrary.js'
import { resolveBookProvider } from '../src/domain/bookProviders.js'
import { getMediaDetailRoute } from '../src/domain/mediaIdentity.js'

const originalFetch = globalThis.fetch
const work = { provider: 'open-library', workId: 'OL1W', workTitle: 'A modern book', authors: [],
  firstPublicationYear: 2024, editionCount: 2, cover: null,
  selectedEdition: { editionId: 'OL2M', title: 'Een modern boek', languages: ['dut'], languageStatus: 'match',
    publicationDates: ['2025-03'], isbns: ['9780261103344'] } }
const result = (items = [work]) => ({ provider: 'open-library', items, providerTotal: items.length,
  omitted: { invalid: 0, duplicateWork: 0, language: 0, isbn: 0 } })
const ok = (data) => ({ ok: true, json: async () => ({ data }) })
beforeEach(clearOpenLibraryCache)
afterEach(() => { globalThis.fetch = originalFetch })

test('activation changes only the implicit default; explicit Google and Open Library remain isolated', () => {
  assert.equal(resolveBookProvider(undefined, false), 'google-books')
  assert.equal(resolveBookProvider(undefined, true), 'open-library')
  assert.equal(resolveBookProvider('google-books', true), 'google-books')
  assert.equal(resolveBookProvider('open-library', false), 'open-library')
  assert.equal(resolveBookProvider(['google-books'], false), 'google-books')
  assert.equal(getMediaDetailRoute({ source: 'open-library', mediaType: 'book', sourceId: 'OL2M' }), null)
})

test('all search fields use one same-origin pilot request; language modes are explicit', async () => {
  for (const field of ['general', 'title', 'author', 'isbn']) {
    for (const language of ['any', 'en', 'nl', 'tr']) {
      const q = field === 'isbn' ? '978-0-261-10334-4' : 'İstanbul & modern books'
      globalThis.fetch = async (path, options) => {
        assert.ok(path.startsWith('/api/v1/pilot/open-library/search?'))
        const params = new URL(path, 'http://localhost').searchParams
        assert.equal(params.get('q'), field === 'isbn' ? '9780261103344' : q)
        assert.equal(params.get('field'), field)
        assert.equal(params.get('language'), language === 'any' ? null : language)
        assert.equal(params.get('languageMode'), language === 'any' ? 'preferred' : 'strict')
        assert.equal(params.get('limit'), '10')
        assert.equal(options.method, 'GET')
        assert.equal(options.body, undefined)
        return ok(result([{ ...work, selectedEdition: { ...work.selectedEdition,
          languages: [{ en: 'eng', nl: 'dut', tr: 'tur', any: 'dut' }[language]] } }]))
      }
      const response = await searchOpenLibrary(q, { field, language, languageMode: 'strict' })
      assert.equal(response.items[0].workId, 'OL1W')
      assert.equal(response.items[0].selectedEdition.editionId, 'OL2M')
    }
  }
  assert.deepEqual(normalizeOpenLibraryOptions({ field: ['title'], language: 'de', languageMode: 'strict' }),
    { field: 'general', language: 'any', languageMode: 'preferred' })
})

test('ISBN validation rejects invalid checksums locally and accepts ISBN-10 X', async () => {
  globalThis.fetch = () => assert.fail('Invalid input must not use provider budget')
  for (const q of ['', '9780261103345', 'OL1W', '1234', 'a'.repeat(201), 'a\n']) {
    await assert.rejects(searchOpenLibrary(q, { field: 'isbn' }), error => error.status === 422)
  }
  assert.equal(validIsbn('0261103342'), true)
  assert.equal(validIsbn('080442957X'), true)
  assert.equal(validIsbn('9780261103344'), true)
})

test('empty successes cache, concurrent identical searches deduplicate, and filters isolate caches', async () => {
  let finish
  let calls = 0
  globalThis.fetch = () => { calls++; return new Promise(resolve => { finish = resolve }) }
  const first = searchOpenLibrary('none')
  const second = searchOpenLibrary('none')
  finish(ok(result([])))
  assert.deepEqual(await first, await second)
  await searchOpenLibrary('none')
  assert.equal(calls, 1)
  globalThis.fetch = async () => { calls++; return ok(result([])) }
  await searchOpenLibrary('none', { language: 'nl' })
  await searchOpenLibrary('none', { language: 'nl', languageMode: 'strict' })
  assert.equal(calls, 3)
})

test('invalid edition kinds, ISBNs, URLs, duplicated Works and malformed responses fail closed', async () => {
  for (const data of [{}, result([{ ...work, workId: 'OL2M' }]), result([work, work]),
    result([{ ...work, selectedEdition: { ...work.selectedEdition, editionId: 'OL1W' } }]),
    result([{ ...work, selectedEdition: { ...work.selectedEdition, isbns: ['9780261103345'] } }]),
    result([{ ...work, cover: { id: 1, url: 'https://evil.example/cover' } }])]) {
    globalThis.fetch = async () => ok(data)
    await assert.rejects(searchOpenLibrary('book'), error => error.code === 'invalid_response')
  }
  globalThis.fetch = async () => ok(result([{ ...work, selectedEdition: null }]))
  assert.equal((await searchOpenLibrary('book')).items[0].selectedEdition, null)
})

test('errors remain distinct, uncached, and never trigger fallback or automatic retries', async () => {
  let calls = 0
  for (const [status, code, state, seconds = 2] of [[404, 'not_found', 'unavailable'], [422, 'validation_error', 'invalid'],
    [429, 'rate_limited', 'rate-limited'], [503, 'provider_busy', 'busy'], [503, 'provider_unavailable', 'unavailable', 60], [502, 'provider_error', 'error']]) {
    globalThis.fetch = async path => {
      calls++
      assert.ok(path.startsWith('/api/v1/pilot/open-library/search?'))
      return { ok: false, status, headers: new Headers({ 'Retry-After': String(seconds) }), json: async () => ({ error: { code } }) }
    }
    const before = calls
    for (let i = 0; i < 2; i++) {
      await assert.rejects(searchOpenLibrary('same query'), error => {
        assert.equal(error.retryAfter, seconds)
        assert.equal(error.status, status)
        assert.equal(error.code, code)
        return openLibraryError(error).state === state
      })
    }
    assert.equal(calls, before + 2)
  }
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(searchOpenLibrary('book'), error => openLibraryError(error).state === 'error')
})

test('strict language and ISBN responses must actually support the requested selection', async () => {
  globalThis.fetch = async () => ok(result())
  await assert.rejects(searchOpenLibrary('book', { language: 'en', languageMode: 'strict' }), error => error.code === 'invalid_response')
  await assert.rejects(searchOpenLibrary('0261103342', { field: 'isbn' }), error => error.code === 'invalid_response')
  globalThis.fetch = async () => ok(result([{ ...work, selectedEdition: { ...work.selectedEdition, languages: [] } }]))
  await assert.rejects(searchOpenLibrary('book', { language: 'nl', languageMode: 'strict' }), error => error.code === 'invalid_response')
})

test('cache expires after five minutes and evicts the oldest beyond twenty entries', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 })
  let calls = 0
  globalThis.fetch = async () => { calls++; return ok(result([])) }
  for (let i = 0; i <= 20; i++) await searchOpenLibrary(`book ${i}`)
  await searchOpenLibrary('book 20')
  assert.equal(calls, 21)
  await searchOpenLibrary('book 0')
  assert.equal(calls, 22)
  t.mock.timers.tick(300001)
  await searchOpenLibrary('book 20')
  assert.equal(calls, 23)
})
