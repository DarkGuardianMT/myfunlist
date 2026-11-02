import { test as base, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const origin = 'http://127.0.0.1:4179'
export const bookTitle = 'The Lantern Atlas: A Synthetic Journey Across Imaginary Worlds'
const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="340" viewBox="0 0 240 340"><rect width="240" height="340" fill="#26375c"/><circle cx="120" cy="125" r="55" fill="#f3c975"/><path d="M45 255L120 180L195 255" fill="none" stroke="#f3c975" stroke-width="8"/><text x="120" y="300" text-anchor="middle" fill="white" font-family="sans-serif" font-size="16">SYNTHETIC COVER</text></svg>'
const attribution = '<svg xmlns="http://www.w3.org/2000/svg" width="170" height="30"><rect width="170" height="30" fill="white"/><text x="6" y="20" fill="#444" font-family="sans-serif" font-size="12">Attribution image (mock)</text></svg>'

const detail = {
  source: 'google-books', mediaType: 'book', sourceId: 'qa-volume-1', title: bookTitle,
  artworkImage: 'https://ui-fixtures.invalid/cover.svg',
  description: 'A fictional book created solely for isolated MyFunList interface testing. No real account or provider data is used.',
  genres: ['Synthetic fiction'],
  details: { authors: ['Example Author', 'Imaginary Research Collective'],
    publishedDate: '2025-03', publisher: 'Example Press', language: 'en', pageCount: 320 },
}

export const test = base.extend({
  sandbox: [async ({ context, page }, use) => {
    const events = { unexpectedRequests: 0, failedRequests: 0, badResponses: 0, consoleErrors: 0, pageErrors: 0 }
    const state = { offline: false, expectedFailures: 0, authChecks: 0, googleRequests: 0, pilotRequests: 0 }
    const expectedNetworkFailures = new Set()
    page.on('pageerror', () => events.pageErrors++)
    page.on('console', message => {
      if (message.type() !== 'error') return
      if (state.expectedFailures && message.text() === 'Failed to load resource: net::ERR_FAILED') return
      if (state.authChecks && /^Failed to load resource: the server responded with a status of 401 \([^)]*\)$/.test(message.text())) return
      events.consoleErrors++
    })
    page.on('requestfailed', request => {
      if (!expectedNetworkFailures.has(request)) events.failedRequests++
    })
    page.on('response', response => {
      // De anonieme sessiecontrole krijgt bewust een synthetische 401.
      if (response.status() >= 400 && !(response.url() === `${origin}/api/v1/auth/me` && response.status() === 401)) events.badResponses++
    })
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() !== 'GET') {
        events.unexpectedRequests++
        return route.abort('blockedbyclient')
      }
      if (url.origin === origin) {
        if (url.pathname === '/api/v1/auth/me') {
          state.authChecks++
          return route.fulfill({ status: 401, json: { error: { code: 'unauthenticated', message: 'Login required.' } } })
        }
        if (url.pathname === '/api/v1/media/book/google-books/qa-volume-1') return route.fulfill({ json: { data: detail } })
        if (url.pathname.startsWith('/api/')) {
          if (url.pathname.includes('/pilot/')) state.pilotRequests++
          events.unexpectedRequests++
          return route.abort('blockedbyclient')
        }
        return route.continue()
      }
      if (url.origin === 'https://www.googleapis.com' && url.pathname === '/books/v1/volumes') {
        state.googleRequests++
        if (state.offline) {
          state.expectedFailures++
          expectedNetworkFailures.add(request)
          return route.abort('failed')
        }
        return route.fulfill({ json: { items: url.searchParams.get('q') === 'empty-fixture' ? [] : [{
          id: 'qa-volume-1', volumeInfo: { title: bookTitle, authors: detail.details.authors,
            language: 'en', publishedDate: '2025-03', imageLinks: { thumbnail: detail.artworkImage } },
        }] } })
      }
      if (url.href === 'https://ui-fixtures.invalid/cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body: cover })
      if (url.href === 'https://books.google.com/googlebooks/images/poweredby.png') return route.fulfill({ contentType: 'image/svg+xml', body: attribution })
      // Onbekend verkeer wordt geblokkeerd; ruwe URL's en foutteksten worden niet opgeslagen.
      events.unexpectedRequests++
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket(/.*/, socket => {
      if (new URL(socket.url()).origin === 'ws://127.0.0.1:4179') {
        socket.connectToServer()
        return
      }
      events.unexpectedRequests++
      socket.close()
    })
    await use(state)
    expect(events, 'Unexpected browser/network events (counts only)').toEqual({
      unexpectedRequests: 0, failedRequests: 0, badResponses: 0, consoleErrors: 0, pageErrors: 0,
    })
    expect(state.pilotRequests, 'Open Library remains disabled').toBe(0)
  }, { auto: true }],
})
export { expect }

export async function checkLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const control of await page.locator('main input:visible, main select:visible, main button:visible').all()) {
    const box = await control.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1)
  }
}

export async function capture(page, testInfo, name, focus) {
  await page.evaluate(() => document.fonts.ready)
  const mobile = testInfo.project.name === 'mobile'
  if (mobile && focus) await focus.scrollIntoViewIfNeeded()
  else await page.evaluate(() => window.scrollTo(0, 0))
  // Mobiele viewportbeelden voorkomen dat vaste navigatie over een lange paginacapture valt.
  const image = await page.screenshot({ fullPage: !mobile, animations: 'disabled' })
  const task = process.env.QA_REVIEW_TASK
  if (task && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task)) throw new Error('QA_REVIEW_TASK must be a lowercase task slug.')
  const directory = task ? resolve('qa/reviews', task) : testInfo.outputPath('screenshots')
  mkdirSync(directory, { recursive: true })
  // Bestaand bewijsmateriaal mag nooit stilzwijgend worden overschreven.
  writeFileSync(resolve(directory, `${testInfo.project.name}-${name}.png`), image, { flag: 'wx' })
}
