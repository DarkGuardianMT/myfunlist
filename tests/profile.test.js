import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createServer } from 'vite'
import { useAuth } from '../src/composables/useAuth.js'
import { currentUser } from '../src/composables/authState.js'
import { clearCsrfToken } from '../src/services/apiClient.js'

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => ({ data }),
})
const errorResponse = (fields) => ({ ok: false, status: 422, json: async () => ({
  error: { code: 'validation_error', message: 'Check the supplied fields.', fields },
}) })

test('Profile and header render account fields, fallback, and anonymous prompt', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: ProfileView } = await server.ssrLoadModule('/src/views/ProfileView.vue')
    const { default: AppHeader } = await server.ssrLoadModule('/src/components/AppHeader.vue')
    const state = await server.ssrLoadModule('/src/composables/authState.js')
    const render = async (component) => {
      const app = createSSRApp({ render: () => h(component) })
      app.use(createRouter({ history: createMemoryHistory(), routes: [
        ...['/', '/login', '/register', '/discover', '/library', '/profile'].map((path) => ({
          path, component: { render: () => null },
        })),
      ] }))
      return renderToString(app)
    }
    state.isAuthLoading.value = false
    state.currentUser.value = null
    const anonymous = await render(ProfileView)
    assert.match(anonymous, /href="\/login"/)
    assert.match(anonymous, /href="\/register"/)
    assert.doesNotMatch(anonymous, /Change password/)

    state.currentUser.value = {
      id: '1', email: 'one@example.test', displayName: null,
      createdAt: '2026-01-02T00:00:00.000Z',
    }
    const profile = await render(ProfileView)
    assert.match(profile, /one@example.test/)
    assert.match(profile, /Not set/)
    assert.match(profile, /Member since/)
    assert.match(profile, /Current password/)
    assert.match(profile, /Confirm new password/)
    assert.match(await render(AppHeader), /one@example.test/)

    state.currentUser.value = { ...state.currentUser.value, displayName: 'José 李' }
    assert.match(await render(AppHeader), /José 李/)
    assert.doesNotMatch(await render(AppHeader), /one@example.test/)
    state.currentUser.value = {
      id: '2', email: 'two@example.test', displayName: null,
      createdAt: '2026-02-03T00:00:00.000Z',
    }
    assert.match(await render(AppHeader), /two@example.test/)
    assert.doesNotMatch(await render(AppHeader), /José 李/)
  } finally {
    await server.close()
  }
})

test('Profile mutations update shared identity, preserve errors, rotate CSRF, and ignore stale account responses', async () => {
  clearCsrfToken()
  const auth = useAuth()
  currentUser.value = { id: '1', email: 'one@example.test', displayName: null }
  const calls = []
  let nameResponse = null
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    if (path.endsWith('/csrf')) return response({ csrfToken: `token-${calls.length}` })
    if (path.endsWith('/profile')) return nameResponse || response({ user: {
      id: '1', email: 'one@example.test', displayName: 'José', createdAt: '2026-01-02T00:00:00.000Z',
    } })
    if (path.endsWith('/password')) return { ok: true, status: 204 }
    throw new Error(path)
  }
  await auth.updateDisplayName('José')
  assert.equal(auth.currentUser.value.displayName, 'José')
  assert.equal(calls.find((call) => call.path.endsWith('/profile')).options.headers['X-CSRF-Token'], 'token-1')

  nameResponse = errorResponse({ displayName: 'Invalid display name.' })
  await assert.rejects(auth.updateDisplayName('bad'), { status: 422,
    fields: { displayName: 'Invalid display name.' } })
  assert.equal(auth.currentUser.value.displayName, 'José')
  nameResponse = null

  await auth.changePassword('old-password', 'new-password-long')
  assert.equal(calls.find((call) => call.path.endsWith('/password')).options.method, 'POST')
  assert.equal(calls.filter((call) => call.path.endsWith('/csrf')).length, 2)

  globalThis.fetch = async (path) => path.endsWith('/password')
    ? errorResponse({ currentPassword: 'Current password is incorrect.' })
    : response({ csrfToken: 'unused' })
  await assert.rejects(auth.changePassword('wrong', 'new-password-long'), { status: 422,
    fields: { currentPassword: 'Current password is incorrect.' } })

  let resolveProfile
  globalThis.fetch = async (path) => {
    if (path.endsWith('/profile')) return new Promise((resolve) => { resolveProfile = resolve })
    throw new Error(path)
  }
  const pending = auth.updateDisplayName('Old account')
  await Promise.resolve()
  currentUser.value = { id: '2', email: 'two@example.test', displayName: null }
  resolveProfile(response({ user: { id: '1', email: 'one@example.test', displayName: 'Old account' } }))
  await pending
  assert.equal(auth.currentUser.value.email, 'two@example.test')
  assert.equal(auth.currentUser.value.displayName, null)
})
