import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parse, compileScript } from '@vue/compiler-sfc'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'history', 'Document', 'ShadowRoot', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event']) {
  globalThis[name] = name === 'window' ? dom.window : dom.window[name]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const { mount, flushPromises } = await import('@vue/test-utils')
const { nextTick } = await import('vue')
const { createRouter, createMemoryHistory } = await import('vue-router')
const { currentUser, isAuthLoading } = await import('../src/composables/authState.js')
const { clearCsrfToken } = await import('../src/services/apiClient.js')

async function component(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  let code = compileScript(descriptor, { id: path, inlineTemplate: true }).content
  code = code.replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  code = code.replace(/from ['"]vue-router['"]/g, `from '${import.meta.resolve('vue-router')}'`)
  code = code.replace(/from ['"]\.\.\/composables\/useAuth\.js['"]/g,
    `from '${new URL('../src/composables/useAuth.js', import.meta.url).href}'`)
  code = code.replace(/from ['"]\.\.\/composables\/useTheme\.js['"]/g,
    `from '${new URL('../src/composables/useTheme.js', import.meta.url).href}'`)
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default
}

const ProfileView = await component('../src/views/ProfileView.vue')
const AppHeader = await component('../src/components/AppHeader.vue')
const user = { id: '1', email: 'one@example.test', displayName: null, createdAt: '2026-01-02T00:00:00.000Z' }

function router() {
  return createRouter({ history: createMemoryHistory(), routes: [
    ...['/', '/login', '/register', '/discover', '/library', '/lists', '/profile'].map((path) => ({
      path, component: { render: () => null },
    })),
  ] })
}

const data = (value) => ({ ok: true, status: 200, json: async () => ({ data: value }) })
const error = (fields) => ({ ok: false, status: 422, json: async () => ({
  error: { code: 'validation_error', message: 'Check the supplied fields.', fields },
}) })

test('Profile forms show validation, loading, success, and clear password values', async () => {
  clearCsrfToken()
  currentUser.value = { ...user }
  isAuthLoading.value = false
  let resolveName
  let resolvePassword
  let profileMode = 'pending'
  let passwordMode = 'reject'
  const calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    if (path.endsWith('/csrf')) return data({ csrfToken: `csrf-${calls.length}` })
    if (path.endsWith('/profile')) {
      if (profileMode === 'reject') return error({ displayName: 'Invalid display name.' })
      return new Promise((resolve) => { resolveName = resolve })
    }
    if (path.endsWith('/password')) {
      if (passwordMode === 'reject') return error({ currentPassword: 'Current password is incorrect.' })
      return new Promise((resolve) => { resolvePassword = resolve })
    }
    throw new Error(path)
  }
  const view = mount(ProfileView, { global: { plugins: [router()] } })
  const header = mount(AppHeader, { global: { plugins: [router()] } })
  try {
    assert.match(view.text(), /Member since/)
    assert.match(header.text(), /one@example.test/)

    profileMode = 'reject'
    await view.get('#profile-display-name').setValue('Invalid')
    await view.findAll('form')[0].trigger('submit')
    await flushPromises()
    assert.match(view.get('[role="alert"]').text(), /Invalid display name/)

    profileMode = 'pending'
    await view.get('#profile-display-name').setValue(' José ')
    await view.findAll('form')[0].trigger('submit')
    await nextTick()
    assert.equal(view.findAll('button[type="submit"]')[0].attributes('disabled') !== undefined, true)
    assert.match(view.text(), /Saving…/)
    resolveName(data({ user: { ...user, displayName: 'José' } }))
    await flushPromises()
    assert.match(view.text(), /Display name saved/)
    assert.match(header.text(), /José/)
    assert.equal(view.get('#profile-display-name').element.value, 'José')

    await view.get('#profile-current-password').setValue('old-password')
    await view.get('#profile-new-password').setValue('new-password-long')
    await view.get('#profile-confirm-password').setValue('different-password')
    const beforeMismatch = calls.filter((call) => call.path.endsWith('/password')).length
    await view.findAll('form')[1].trigger('submit')
    assert.match(view.text(), /New passwords do not match/)
    assert.equal(calls.filter((call) => call.path.endsWith('/password')).length, beforeMismatch)

    await view.get('#profile-confirm-password').setValue('new-password-long')
    await view.findAll('form')[1].trigger('submit')
    await flushPromises()
    assert.match(view.text(), /Current password is incorrect/)
    assert.equal(view.get('#profile-current-password').element.value, 'old-password')

    passwordMode = 'pending'
    await view.findAll('form')[1].trigger('submit')
    await nextTick()
    assert.equal(view.findAll('button[type="submit"]')[1].attributes('disabled') !== undefined, true)
    assert.match(view.text(), /Changing…/)
    resolvePassword({ ok: true, status: 204 })
    await flushPromises()
    assert.match(view.text(), /Password changed/)
    for (const id of ['#profile-current-password', '#profile-new-password', '#profile-confirm-password']) {
      assert.equal(view.get(id).element.value, '')
    }
  } finally {
    view.unmount()
    header.unmount()
  }
})

test('Anonymous Profile makes no request and account switch clears form state', async () => {
  clearCsrfToken()
  currentUser.value = null
  isAuthLoading.value = false
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected request') }
  const view = mount(ProfileView, { global: { plugins: [router()] } })
  try {
    assert.match(view.text(), /Login or register/)
    assert.equal(requests, 0)
    currentUser.value = { ...user, displayName: 'One' }
    await nextTick()
    await view.get('#profile-display-name').setValue('Unsaved')
    await view.get('#profile-current-password').setValue('private')
    currentUser.value = { ...user, id: '2', email: 'two@example.test', displayName: null }
    await nextTick()
    assert.equal(view.get('#profile-display-name').element.value, '')
    assert.equal(view.get('#profile-current-password').element.value, '')
    assert.match(view.text(), /two@example.test/)
    assert.doesNotMatch(view.text(), /Unsaved/)
    assert.equal(requests, 0)
  } finally {
    view.unmount()
  }
})
