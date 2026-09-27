import test from 'node:test'
import assert from 'node:assert/strict'
import { useAuth } from '../src/composables/useAuth.js'
import { useLibrary } from '../src/composables/useLibrary.js'
import { currentUser } from '../src/composables/authState.js'
import { clearCsrfToken } from '../src/services/apiClient.js'

const data = (value, status = 200) => ({ ok: status >= 200 && status < 300,
  status, json: async () => ({ data: value }) })
const error = (code, status, fields) => ({ ok: false, status, json: async () => ({
  error: { code, message: code, ...(fields ? { fields } : {}) },
}) })

test('startup accepts anonymous 401 and authenticated account', async () => {
  clearCsrfToken()
  let account = null
  globalThis.fetch = async (path) => {
    if (path.endsWith('/me')) return account ? data({ user: account }) : error('unauthenticated', 401)
    if (path.endsWith('/csrf')) return data({ csrfToken: 'csrf' })
    return data([])
  }
  const auth = useAuth()
  await auth.refreshCurrentUser()
  assert.equal(auth.currentUser.value, null)
  assert.equal(auth.authError.value, '')
  account = { id: '1', email: 'one@example.com' }
  await auth.refreshCurrentUser()
  assert.equal(auth.currentUser.value.email, account.email)
  assert.equal(useLibrary().isLibraryLoaded.value, true)
})

test('register/login errors stay on form; successful auth rotates CSRF and logout clears Library', async () => {
  clearCsrfToken()
  const calls = []
  let registrationFailure = true
  let loginFailure = true
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    if (path.endsWith('/csrf')) return data({ csrfToken: `csrf-${calls.length}` })
    if (path.endsWith('/register')) return registrationFailure
      ? error('validation_error', 422, { password: 'Too short.' })
      : data({ user: { id: '2', email: 'two@example.com' } }, 201)
    if (path.endsWith('/login')) return loginFailure
      ? error('invalid_credentials', 401)
      : data({ user: { id: '2', email: 'two@example.com' } })
    if (path.endsWith('/library')) return data([])
    if (path.endsWith('/logout')) return { status: 204, ok: true }
    throw new Error(path)
  }
  const auth = useAuth()
  await assert.rejects(auth.register('two@example.com', 'short'), { code: 'validation_error' })
  registrationFailure = false
  await auth.register('two@example.com', 'long-password')
  assert.equal(auth.currentUser.value.id, '2')
  assert.ok(calls.filter((call) => call.path.endsWith('/csrf')).length >= 2)
  await auth.logout()
  assert.equal(auth.currentUser.value, null)
  assert.deepEqual(useLibrary().libraryItems.value, [])
  await assert.rejects(auth.login('two@example.com', 'wrong'), { code: 'invalid_credentials' })
  assert.equal(auth.currentUser.value, null)
  loginFailure = false
  await auth.login('two@example.com', 'long-password')
  assert.equal(auth.currentUser.value.id, '2')
  globalThis.fetch = async () => error('unauthenticated', 401)
  await assert.rejects(useLibrary().loadLibrary(true))
  assert.equal(currentUser.value, null)
  assert.deepEqual(useLibrary().libraryItems.value, [])
})
