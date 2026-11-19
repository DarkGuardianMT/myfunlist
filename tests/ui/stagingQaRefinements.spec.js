import { test, expect, checkLayout, capture, openLibraryResult, openLibraryWork } from './fixtures.js'
import { fullApp } from './fullAppFixture.js'

const navigation = (page, info) => page.getByRole('navigation', { name: info.project.name === 'mobile' ? 'Mobile navigation' : 'Main navigation', exact: true })
const count = (sandbox, type) => type === 'open-library' ? sandbox.pilotRequests : type === 'book' ? sandbox.googleRequests
  : sandbox.apiCalls.filter(call => call === `GET /api/v1/discover/${type}`).length

for (const type of ['movie', 'tv', 'game', 'book', 'open-library']) {
  test(`Home submission ${type}: replaces old draft, reuses snapshot and preserves contextual history`, async ({ page, sandbox }, info) => {
    fullApp(sandbox)
    sandbox.openLibraryHarness = type === 'open-library'
    sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult() } })
    const category = type === 'open-library' ? 'book' : type
    const target = `${type === 'open-library' ? '/tests/ui/open-library.html' : '/discover'}?type=${category}&q=Inception`
    await page.goto(target)
    const input = page.locator(type === 'open-library' ? '#open-library-query' : `#${type}-query`)
    const cards = page.locator('.discovery-search article')
    await expect(cards).toHaveCount(type === 'open-library' ? 1 : 6)
    await input.fill('Inception unsent edit')
    if (type !== 'open-library') {
      await cards.first().locator('h3 a').click()
      await page.getByRole('link', { name: '← Back to Discover', exact: true }).click()
      await expect(input).toHaveValue('Inception unsent edit')
    }
    await navigation(page, info).getByRole('link', { name: 'Home', exact: true }).click()
    await page.getByRole('group', { name: 'Search media type' }).getByRole('button', { name: { movie: 'Movies', tv: 'TV Shows', game: 'Games', book: 'Books' }[category], exact: true }).click()
    await page.locator('#home-query').fill('Inception')
    await page.getByRole('button', { name: 'Find media', exact: true }).click()
    await expect(input).toHaveValue('Inception')
    await expect(cards).toHaveCount(type === 'open-library' ? 1 : 6)
    expect(new URL(page.url()).searchParams.get('q')).toBe('Inception')
    expect(count(sandbox, type)).toBe(1)
    await checkLayout(page)
    if (type === 'movie') await capture(page, info, 'home-submission-fixed-light', input)
    await input.fill('New contextual draft')
    await navigation(page, info).getByRole('link', { name: 'Home', exact: true }).click()
    await page.goBack()
    await expect(input).toHaveValue('New contextual draft')
    expect(count(sandbox, type)).toBe(1)
    await page.goForward()
    await page.getByRole('group', { name: 'Search media type' }).getByRole('button', { name: { movie: 'Movies', tv: 'TV Shows', game: 'Games', book: 'Books' }[category], exact: true }).click()
    await page.locator('#home-query').fill('Different query')
    await page.getByRole('button', { name: 'Find media', exact: true }).click()
    await expect(input).toHaveValue('Different query')
    await expect(cards).toHaveCount(type === 'open-library' ? 1 : 6)
    expect(count(sandbox, type)).toBe(2)
  })
}

function recoveryApp(sandbox) {
  const { state } = fullApp(sandbox)
  state.library = []
  state.members = { '1': [], '2': [] }
  sandbox.openLibraryHarness = true
  let writes = 0
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult() } })
  sandbox.apiResponses['POST /api/v1/library'] = request => {
    writes++
    expect(request.headers()['x-csrf-token']).toBe('synthetic-complete-token')
    expect(request.postDataJSON()).toEqual({ media: { source: 'open-library', mediaType: 'book', sourceId: 'OL202M' } })
    return { status: 409, json: { error: { code: 'edition_unavailable' } } }
  }
  return { writes: () => writes }
}

test('Open Library recovery renews retained results and options without submitting drafts or saving', async ({ page, sandbox }, info) => {
  const app = recoveryApp(sandbox)
  await page.clock.setFixedTime(Date.now())
  await page.goto('/tests/ui/open-library.html?type=book&q=lantern&field=title&lang=nl&mode=strict')
  const input = page.locator('#open-library-query')
  await expect(page.locator('.open-library-work')).toHaveCount(1)
  await input.fill('Unrelated unsent draft')
  await navigation(page, info).getByRole('link', { name: 'Home', exact: true }).click()
  await page.clock.setFixedTime(Date.now() + 6 * 60 * 1000)
  await page.goBack()
  await expect(input).toHaveValue('Unrelated unsent draft')
  expect(sandbox.pilotRequests).toBe(1)
  await page.getByRole('button', { name: /^Add to Library:/ }).click()
  const renew = page.getByRole('button', { name: 'Search again', exact: true })
  await expect(renew).toBeVisible()
  const rejectedAdd = page.getByRole('button', { name: /^Add to Library:/ })
  await expect(rejectedAdd).toBeDisabled()
  await rejectedAdd.evaluate(button => {
    for (let attempt = 0; attempt < 3; attempt++) button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect(app.writes()).toBe(1)
  const originalViewport = page.viewportSize()
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await checkLayout(page)
    expect((await renew.boundingBox()).height).toBeGreaterThanOrEqual(44)
  }
  await page.setViewportSize(originalViewport)
  await checkLayout(page)
  expect((await renew.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await capture(page, info, 'stale-edition-recovery-light', renew)
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).filter({ visible: true }).click()
  await renew.focus()
  await renew.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(renew).toBeFocused()
  expect(await renew.evaluate(button => getComputedStyle(button).outlineWidth)).toBe('2px')
  await capture(page, info, 'stale-edition-recovery-dark', renew)
  let finish
  sandbox.pilotRespond = async () => {
    await new Promise(resolve => { finish = resolve })
    return { json: { data: openLibraryResult() } }
  }
  await renew.evaluate(button => { button.click(); button.click() })
  await expect(page.locator('.catalogue-skeletons')).toBeVisible()
  await expect(page.locator('.open-library-discover button[type=submit]')).toBeDisabled()
  expect(sandbox.pilotRequests).toBe(2)
  expect(sandbox.pilotSearches[1]).toEqual(sandbox.pilotSearches[0])
  finish()
  await expect(page.locator('.open-library-work')).toHaveCount(1)
  await expect(input).toHaveValue('Unrelated unsent draft')
  await expect(renew).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Add to Library:/ })).toBeEnabled()
  expect(app.writes()).toBe(1)
  await capture(page, info, 'edition-renewed-dark', page.locator('.edition-save'))
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).filter({ visible: true }).click()
  await capture(page, info, 'edition-renewed-light', page.locator('.edition-save'))
  // Ook binnen de client-TTL moet een nieuwe afwijzing werkelijk opnieuw zoeken.
  await page.getByRole('button', { name: /^Add to Library:/ }).click()
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult([{ ...openLibraryWork,
    selectedEdition: { ...openLibraryWork.selectedEdition, editionId: 'OL303M', title: 'A newly returned edition' } }]) } })
  await renew.click()
  await expect(page.getByRole('button', { name: 'Add to Library: A newly returned edition', exact: true })).toBeEnabled()
  expect(sandbox.pilotRequests).toBe(3)
  expect(app.writes()).toBe(2)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await checkLayout(page)
  }
})

test('Edition eligibility feedback stays readable at 320, 390 and 768px in both themes', async ({ page, sandbox }, info) => {
  recoveryApp(sandbox)
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult([
    { ...openLibraryWork, selectedEdition: { ...openLibraryWork.selectedEdition, title: null } },
    { ...openLibraryWork, workId: 'OL102W', selectedEdition: { ...openLibraryWork.selectedEdition, languageStatus: 'inconsistent' } },
    { ...openLibraryWork, workId: 'OL103W', selectedEdition: { ...openLibraryWork.selectedEdition, languageStatus: 'ambiguous' } },
    { ...openLibraryWork, workId: 'OL104W', selectedEdition: null },
  ]) } })
  await page.goto('/tests/ui/open-library.html?type=book&q=lantern')
  await expect(page.locator('.open-library-work__unavailable')).toHaveCount(4)
  await expect(page.locator('.open-library-work__unavailable').first()).toHaveText('This edition cannot be saved: its title is missing.')
  await expect(page.locator('.edition-save')).toHaveCount(0)
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).filter({ visible: true }).click()
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 })
      await checkLayout(page)
      if (width === 320 && info.project.name === 'mobile') await capture(page, info, `eligibility-320-${theme}`, page.locator('.open-library-work__unavailable').first(), true)
    }
  }
})

test('Renewal error observes cooldown and manual retry without automatically saving', async ({ page, sandbox }) => {
  const app = recoveryApp(sandbox)
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await page.goto('/tests/ui/open-library.html?type=book&q=lantern')
  await page.getByRole('button', { name: /^Add to Library:/ }).click()
  sandbox.pilotRespond = async () => ({ status: 503, headers: { 'Retry-After': '2' }, json: { error: { code: 'provider_busy' } } })
  await page.getByRole('button', { name: 'Search again', exact: true }).click()
  await expect(page.locator('.open-library-discover').getByRole('alert')).toContainText('shared provider budget')
  await expect(page.getByRole('button', { name: /^Add to Library:/ })).toHaveCount(0)
  const retry = page.getByRole('button', { name: 'Please wait before retrying', exact: true })
  await expect(retry).toBeDisabled()
  expect(sandbox.pilotRequests).toBe(2)
  await page.waitForTimeout(2100)
  await page.clock.setFixedTime(now + 3000)
  const ready = page.getByRole('button', { name: 'Retry search', exact: true })
  await expect(ready).toBeEnabled()
  await expect(page.getByRole('button', { name: /^Add to Library:/ })).toHaveCount(0)
  expect(sandbox.pilotRequests).toBe(2)
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult([]) } })
  await ready.click()
  await expect(page.getByText(/No supported Works found/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add to Library:/ })).toHaveCount(0)
  expect(sandbox.pilotRequests).toBe(3)
  expect(app.writes()).toBe(1)
})

test('Navigation during renewal cannot show a late Edition in another provider', async ({ page, sandbox }, info) => {
  const app = recoveryApp(sandbox)
  await page.goto('/tests/ui/open-library.html?type=book&q=lantern')
  await page.getByRole('button', { name: /^Add to Library:/ }).click()
  let finish
  sandbox.pilotRespond = async () => {
    await new Promise(resolve => { finish = resolve })
    return { json: { data: openLibraryResult([{ ...openLibraryWork, workTitle: 'Late renewed Work' }]) } }
  }
  await page.getByRole('button', { name: 'Search again', exact: true }).click()
  await expect(page.locator('.catalogue-skeletons')).toBeVisible()
  await navigation(page, info).getByRole('link', { name: 'Home', exact: true }).click()
  await page.goBack()
  await expect(page.locator('.catalogue-skeletons')).toBeVisible()
  expect(sandbox.pilotRequests).toBe(2)
  await page.getByLabel('Book catalogue').selectOption('google-books')
  await expect(page.locator('.book-grid article')).toHaveCount(6)
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/pilot/open-library/search')
  finish()
  await (await response).finished()
  await expect(page.getByText('Late renewed Work', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Book catalogue')).toHaveValue('google-books')
  expect(app.writes()).toBe(1)
  expect(sandbox.pilotRequests).toBe(2)
})
