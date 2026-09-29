import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createServer } from 'vite'

test('theme defaults to light, switches both ways, and persists on reload', async () => {
  const firstPage = new JSDOM('', { url: 'http://localhost/' })
  globalThis.window = firstPage.window
  globalThis.document = firstPage.window.document

  try {
    const { useTheme } = await import('../src/composables/useTheme.js?theme-interaction')
    const { theme, toggleTheme } = useTheme()
    assert.equal(theme.value, 'light')
    assert.notEqual(document.documentElement.dataset.theme, 'dark')

    toggleTheme()
    assert.equal(theme.value, 'dark')
    assert.equal(document.documentElement.dataset.theme, 'dark')
    assert.equal(localStorageValue(), 'dark')

    toggleTheme()
    assert.equal(theme.value, 'light')
    assert.equal(document.documentElement.dataset.theme, 'light')
    assert.equal(localStorageValue(), 'light')

    toggleTheme()
    const savedPreference = localStorageValue()
    const reloadedPage = new JSDOM('', { url: 'http://localhost/' })
    reloadedPage.window.localStorage.setItem('myfunlist_theme', savedPreference)
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
    const earlyScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    assert.ok(earlyScript)
    runInNewContext(earlyScript, {
      document: reloadedPage.window.document,
      localStorage: reloadedPage.window.localStorage,
    })
    assert.equal(reloadedPage.window.document.documentElement.dataset.theme, 'dark')

    globalThis.window = reloadedPage.window
    globalThis.document = reloadedPage.window.document
    const restored = await import('../src/composables/useTheme.js?theme-restored')
    assert.equal(restored.useTheme().theme.value, 'dark')
    reloadedPage.window.close()
  } finally {
    firstPage.window.close()
    delete globalThis.window
    delete globalThis.document
  }
})

test('header toggle exposes the next action and pressed state', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: AppHeader } = await server.ssrLoadModule('/src/components/AppHeader.vue')
    const { useTheme } = await server.ssrLoadModule('/src/composables/useTheme.js')
    const renderHeader = async () => {
      const app = createSSRApp({ render: () => h(AppHeader) })
      app.use(createRouter({ history: createMemoryHistory(), routes:
        ['/', '/discover', '/library', '/lists', '/profile', '/login', '/register'].map((path) => ({
          path, component: { render: () => null },
        })),
      }))
      return renderToString(app)
    }

    const lightHeader = await renderHeader()
    assert.match(lightHeader, /aria-label="Switch to dark mode"/)
    assert.match(lightHeader, /aria-pressed="false"/)
    assert.match(lightHeader, />\s*Theme: Light<\/button>/)

    useTheme().toggleTheme()
    const darkHeader = await renderHeader()
    assert.match(darkHeader, /aria-label="Switch to light mode"/)
    assert.match(darkHeader, /aria-pressed="true"/)
    assert.match(darkHeader, />\s*Theme: Dark<\/button>/)
  } finally {
    await server.close()
  }
})

function localStorageValue() {
  return window.localStorage.getItem('myfunlist_theme')
}
