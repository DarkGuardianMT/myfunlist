import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

test('mobile navigation keeps five routes and follows account and active-route state', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: AppHeader } = await server.ssrLoadModule('/src/components/AppHeader.vue')
    const state = await server.ssrLoadModule('/src/composables/authState.js')
    state.isAuthLoading.value = false

    async function render(path, user) {
      state.currentUser.value = user
      const router = createRouter({ history: createMemoryHistory(), routes:
        ['/', '/discover', '/library', '/lists', '/lists/:id', '/profile', '/login', '/register']
          .map((route) => ({ path: route, component: { render: () => null } })),
      })
      await router.push(path)
      await router.isReady()
      const app = createSSRApp({ render: () => h(AppHeader) })
      app.use(router)
      return new JSDOM(await renderToString(app)).window.document
    }

    const anonymous = await render('/login', null)
    const desktop = anonymous.querySelector('nav.site-nav')
    const mobile = anonymous.querySelector('nav.mobile-nav')
    assert.ok(desktop && mobile)
    assert.equal(desktop.getAttribute('aria-label'), 'Main navigation')
    assert.equal(mobile.getAttribute('aria-label'), 'Mobile navigation')
    assert.deepEqual([...desktop.querySelectorAll('a')].slice(0, 5).map((link) => link.textContent),
      ['Home', 'Discover', 'Library', 'Lists', 'Profile'])
    assert.deepEqual([...mobile.querySelectorAll('a')].map((link) =>
      [link.textContent.trim(), link.getAttribute('href')]), [
      ['Home', '/'], ['Discover', '/discover'], ['Library', '/library'],
      ['Lists', '/lists'], ['Login', '/login'],
    ])
    assert.equal(mobile.querySelectorAll('[aria-current="page"]').length, 1)
    assert.equal(mobile.querySelector('[aria-current="page"]').textContent.trim(), 'Login')
    assert.equal(mobile.querySelectorAll('svg[aria-hidden="true"]').length, 5)
    assert.match(anonymous.querySelector('.mobile-theme-toggle').getAttribute('aria-label'), /Switch to .* mode/)

    const registered = await render('/register', null)
    assert.equal(registered.querySelector('.mobile-nav a:last-child').textContent.trim(), 'Login')
    assert.equal(registered.querySelector('.mobile-nav [aria-current="page"]'), null)

    const user = { id: '1', email: 'one@example.test', displayName: null }
    const profile = await render('/profile', user)
    assert.equal(profile.querySelector('.mobile-nav a:last-child').getAttribute('href'), '/profile')
    assert.equal(profile.querySelector('.mobile-nav [aria-current="page"]').textContent.trim(), 'Profile')
    assert.ok(profile.querySelector('.site-nav .account-email'))
    assert.ok(profile.querySelector('.site-nav button.text-button'))

    const listDetail = await render('/lists/123', user)
    assert.equal(listDetail.querySelector('.mobile-nav [aria-current="page"]').textContent.trim(), 'Lists')
    assert.equal(listDetail.querySelectorAll('.mobile-nav [aria-current="page"]').length, 1)
    const discover = await render('/discover', user)
    assert.equal(discover.querySelector('.mobile-nav [aria-current="page"]').textContent.trim(), 'Discover')
    for (const [path, label] of [['/', 'Home'], ['/library', 'Library'], ['/lists', 'Lists']]) {
      const page = await render(path, user)
      assert.equal(page.querySelector('.mobile-nav [aria-current="page"]').textContent.trim(), label)
      assert.equal(page.querySelectorAll('.mobile-nav [aria-current="page"]').length, 1)
    }
  } finally {
    await server.close()
  }
})
