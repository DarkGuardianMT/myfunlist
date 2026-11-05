import { test, expect, bookTitle, openLibraryWork, openLibraryResult, checkLayout, capture } from './fixtures.js'

function enable(sandbox) {
  sandbox.openLibraryHarness = true
  sandbox.pilotRespond = async url => {
    const language = { en: 'eng', nl: 'dut', tr: 'tur' }[url.searchParams.get('language')] || 'dut'
    return { json: { data: openLibraryResult([{ ...openLibraryWork,
      selectedEdition: { ...openLibraryWork.selectedEdition, languages: [language] } }]) } }
  }
}
const search = page => page.locator('.open-library-discover button[type=submit]')
const retry = page => page.getByRole('button', { name: /Retry search|Please wait before retrying/ })

test('Open Library Work/Edition preview, keyboard access, themes and narrow layout', async ({ page, sandbox }, testInfo) => {
  enable(sandbox)
  await page.goto('/tests/ui/open-library.html?provider=open-library&q=lantern&lang=nl&mode=strict')
  const card = page.getByRole('article')
  await expect(card.getByRole('heading', { name: bookTitle })).toBeVisible()
  await expect(card.getByText('First publication (Work): 2024')).toBeVisible()
  await expect(card.getByRole('link', { name: 'View Work on Open Library', exact: true })).toHaveAttribute('href', 'https://openlibrary.org/works/OL101W')
  await card.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(card.getByText('Edition publication: 2025-03')).toBeVisible()
  await expect(card.getByRole('link', { name: 'View edition on Open Library', exact: true })).toHaveAttribute('href', 'https://openlibrary.org/books/OL202M')
  const choose = card.getByRole('button', { name: 'Use this edition for preview' })
  await choose.focus()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('status')).toContainText('OL101W / OL202M')
  await expect(card.getByRole('button', { name: 'Edition selected for preview' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Add to Library/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open Library', exact: true })).toBeVisible()
  expect(sandbox.pilotRequests).toBe(1)
  expect(sandbox.googleRequests).toBe(0)
  await checkLayout(page)
  await capture(page, testInfo, 'open-library-light', card)
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).filter({ visible: true }).click()
  await checkLayout(page)
  await capture(page, testInfo, 'open-library-dark', card.getByRole('status'))
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await checkLayout(page)
    for (const control of await card.locator('summary, button, a').all()) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }
  }
})

test('Open Library fields, languages, strict mode, cache, history and separate Google search', async ({ page, sandbox }) => {
  enable(sandbox)
  await page.goto('/tests/ui/open-library.html?provider=open-library')
  const input = page.locator('#open-library-query')
  await input.fill('lantern')
  expect(sandbox.pilotRequests).toBe(0)
  await search(page).click()
  await expect(page.getByRole('article')).toBeVisible()
  for (const field of ['title', 'author', 'general']) {
    const before = sandbox.pilotRequests
    await page.getByLabel('Search in', { exact: true }).selectOption(field)
    await expect(page.getByRole('article')).toBeVisible()
    await expect(page.getByLabel('Search in', { exact: true })).toHaveValue(field)
    if (field === 'general') expect(sandbox.pilotRequests).toBe(before)
    else expect(sandbox.pilotSearches.at(-1).field).toBe(field)
  }
  expect(sandbox.pilotRequests).toBe(3)
  for (const language of ['en', 'nl', 'tr']) {
    await page.getByLabel('Edition language preference').selectOption(language)
    await expect(page.getByRole('article')).toBeVisible()
    expect(sandbox.pilotSearches.at(-1).language).toBe(language)
    await page.getByLabel('Language matching', { exact: true }).selectOption('strict')
    await expect(page.getByRole('article')).toBeVisible()
    expect(sandbox.pilotSearches.at(-1).languageMode).toBe('strict')
    await page.getByLabel('Language matching', { exact: true }).selectOption('preferred')
    await expect(page.getByRole('article')).toBeVisible()
  }
  const beforeBack = sandbox.pilotRequests
  await page.goBack()
  await expect(page.getByLabel('Language matching', { exact: true })).toHaveValue('strict')
  await expect(page.getByRole('article')).toBeVisible()
  expect(sandbox.pilotRequests).toBe(beforeBack)
  await page.getByLabel('Search in', { exact: true }).selectOption('isbn')
  await expect(page.locator('.open-library-discover').getByRole('alert')).toContainText('valid ISBN')
  expect(sandbox.pilotRequests).toBe(beforeBack)
  await input.fill('978-0-261-10334-4')
  await search(page).click()
  await expect(page.getByRole('article')).toBeVisible()
  expect(sandbox.pilotSearches.at(-1)).toMatchObject({ q: '9780261103344', field: 'isbn', language: 'tr', languageMode: 'strict', limit: '10' })
  await page.getByLabel('Book catalogue', { exact: true }).selectOption('google-books')
  await expect(page.locator('.google-attribution')).toBeVisible()
  await expect(page.getByRole('article')).toBeVisible()
  expect(sandbox.googleRequests).toBe(1)
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('any')
  await expect(page.getByLabel('Search in', { exact: true })).toHaveValue('all')
  await expect(page.locator('.open-library-work')).toHaveCount(0)
  const beforeSwitch = sandbox.pilotRequests
  await page.getByLabel('Book catalogue', { exact: true }).selectOption('open-library')
  await expect(page.locator('.open-library-work')).toBeVisible()
  expect(sandbox.pilotRequests).toBe(beforeSwitch + 1)
  expect(sandbox.googleRequests).toBe(1)
  await expect(page.locator('.google-attribution')).toHaveCount(0)
})

test('Open Library busy, 429 and 503 cooldowns survive catalogue switching and require manual retry', async ({ page, sandbox }) => {
  enable(sandbox)
  const clockTime = new Date('2026-11-05T12:00:00Z')
  await page.clock.install({ time: clockTime })
  await page.clock.pauseAt(clockTime)
  for (const [status, code, seconds, message] of [
    [503, 'provider_busy', 2, 'shared provider budget'],
    [429, 'rate_limited', 90, 'Too many searches'],
    [503, 'provider_unavailable', 60, 'temporarily unavailable'],
  ]) {
    sandbox.pilotRespond = async () => ({ status, headers: { 'Retry-After': String(seconds) }, json: { error: { code } } })
    await page.goto(`/tests/ui/open-library.html?provider=open-library&q=${code}`)
    await expect(page.locator('.open-library-discover').getByRole('alert')).toContainText(message)
    const before = sandbox.pilotRequests
    await expect(retry(page)).toBeDisabled()
    await expect(search(page)).toBeDisabled()
    await page.getByLabel('Book catalogue', { exact: true }).selectOption('google-books')
    await expect(page.locator('.google-attribution')).toBeVisible()
    await page.getByLabel('Book catalogue', { exact: true }).selectOption('open-library')
    await expect(page.locator('.open-library-discover').getByRole('alert')).toContainText(message)
    expect(sandbox.pilotRequests).toBe(before)
    await page.clock.fastForward(seconds * 1000 - 1)
    await expect(retry(page)).toBeDisabled()
    await page.clock.fastForward(1)
    await expect(retry(page)).toBeEnabled()
    expect(sandbox.pilotRequests).toBe(before)
    enable(sandbox)
    await retry(page).click()
    await expect(page.getByRole('article')).toBeVisible()
    expect(sandbox.pilotRequests).toBe(before + 1)
  }
})

test('Open Library loading, stale responses, empty, malformed and unactivated states stay distinct', async ({ page, sandbox }) => {
  enable(sandbox)
  let release
  sandbox.pilotRespond = () => new Promise(resolve => { release = resolve })
  await page.goto('/tests/ui/open-library.html?provider=open-library&q=lantern')
  await expect(page.getByRole('status').filter({ hasText: 'Searching Open Library' })).toBeVisible()
  await expect(search(page)).toBeDisabled()
  enable(sandbox)
  await page.getByLabel('Edition language preference').selectOption('tr')
  await expect(page.getByRole('article')).toBeVisible()
  release({ json: { data: openLibraryResult([{ ...openLibraryWork, workTitle: 'Stale synthetic title' }]) } })
  await expect(page.getByRole('heading', { name: bookTitle })).toBeVisible()
  await expect(page.getByText('Stale synthetic title', { exact: true })).toHaveCount(0)
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult([]) } })
  await page.locator('#open-library-query').fill('empty-fixture')
  await search(page).click()
  await expect(page.getByText(/No supported Works found/)).toBeVisible()
  const before = sandbox.pilotRequests
  await search(page).click()
  await expect(page.getByText(/No supported Works found/)).toBeVisible()
  expect(sandbox.pilotRequests).toBe(before)
  sandbox.pilotRespond = async () => ({ json: { data: {} } })
  await page.locator('#open-library-query').fill('malformed-fixture')
  await search(page).click()
  await expect(page.locator('.open-library-discover').getByRole('alert')).toContainText('unsupported data')
  await expect(retry(page)).toBeEnabled()
  sandbox.pilotRespond = async () => ({ status: 404, json: { error: { code: 'not_found' } } })
  await retry(page).click()
  await expect(page.locator('.open-library-discover').getByRole('alert')).toContainText('has not been activated')
  expect(sandbox.googleRequests).toBe(0)
  await checkLayout(page)
})
