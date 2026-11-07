import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { currentUser } from '../src/composables/authState.js'
import { rememberDetailOrigin, useDetailBack } from '../src/router/browsingContext.js'

const detail = { name: 'media-detail', path: '/media/tv/tmdb/42', fullPath: '/media/tv/tmdb/42' }
const from = path => ({ path, fullPath: path, query: {}, hash: '' })
afterEach(() => { currentUser.value = null; rememberDetailOrigin(detail, from('/')) })

test('detail Back uses only the actual internal Discover, Library or specific List origin', () => {
  currentUser.value = { id: '1' }
  for (const [path, label] of [['/discover', 'Back to Discover'], ['/library', 'Back to Library'], ['/lists/42', 'Back to List']]) {
    rememberDetailOrigin(detail, { ...from(path), query: { q: 'Title & more', type: 'book', lang: 'nl' }, hash: '#results' })
    const back = useDetailBack(detail).value
    assert.equal(back.label, label)
    assert.deepEqual(back.location, { path, query: { q: 'Title & more', type: 'book', lang: 'nl' }, hash: '#results' })
  }
})

test('direct entry, refresh, unrelated and external origins use the safe internal fallback', () => {
  for (const path of [undefined, '/', '/profile', '/lists/../profile', '//outside.invalid', 'https://outside.invalid/library']) {
    rememberDetailOrigin(detail, from(path))
    assert.deepEqual(useDetailBack(detail).value, { location: { path: '/discover' }, label: 'Back to Discover' })
  }
  rememberDetailOrigin(detail, from('/discover'))
  assert.deepEqual(useDetailBack({ ...detail, fullPath: '/media/tv/tmdb/43' }).value.location, { path: '/discover' })
})

test('private return context clears on logout/account change and cannot reappear on relogin', () => {
  for (const path of ['/library', '/lists/42']) {
    currentUser.value = { id: '1' }
    rememberDetailOrigin(detail, from(path))
    assert.equal(useDetailBack(detail).value.location.path, path)
    currentUser.value = null
    currentUser.value = { id: '1' }
    assert.equal(useDetailBack(detail).value.location.path, '/discover')
    rememberDetailOrigin(detail, from(path))
    currentUser.value = { id: '2' }
    assert.equal(useDetailBack(detail).value.location.path, '/discover')
  }
})

test('adjacent details retain a valid origin and public Discover context contains no account data', () => {
  rememberDetailOrigin(detail, from('/discover'))
  const next = { ...detail, fullPath: '/media/tv/tmdb/43' }
  rememberDetailOrigin(next, detail)
  currentUser.value = { id: '2' }
  assert.equal(useDetailBack(next).value.location.path, '/discover')
  assert.equal(useDetailBack(next).value.accountId, null)
})
