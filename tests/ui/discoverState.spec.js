import { test, expect, checkLayout, capture, openLibraryResult, openLibraryWork } from './fixtures.js'
import { fullApp } from './fullAppFixture.js'

const navigation = (page, info) => page.getByRole('navigation', { name: info.project.name === 'mobile' ? 'Mobile navigation' : 'Main navigation', exact: true })
const enable = sandbox => {
  sandbox.openLibraryHarness = true
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult() } })
}
const count = (sandbox, type) => type === 'open-library' ? sandbox.pilotRequests : type === 'book' ? sandbox.googleRequests
  : sandbox.apiCalls.filter(call => call === `GET /api/v1/discover/${type}`).length

test('Discover defaults follow the frontend gate and explicit providers never switch on errors', async ({ page, sandbox }) => {
  fullApp(sandbox)
  enable(sandbox)
  await page.goto('/tests/ui/open-library.html?type=book')
  await expect(page.getByLabel('Book catalogue')).toHaveValue('open-library')
  await expect(page.locator('#open-library-query')).toBeEmpty()
  expect(sandbox.pilotRequests).toBe(0)
  sandbox.pilotRespond = async () => ({ status: 503, headers: { 'Retry-After': '60' }, json: { error: { code: 'provider_unavailable' } } })
  await page.locator('#open-library-query').fill('outage')
  await page.locator('button[type=submit]').click()
  await expect(page.locator('.open-library-discover').getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.getByLabel('Book catalogue')).toHaveValue('open-library')
  expect(sandbox.googleRequests).toBe(0)
  await page.getByLabel('Book catalogue').selectOption('google-books')
  await expect(page.locator('.book-grid article')).toHaveCount(6)
  await expect(page).toHaveURL(/provider=google-books/)
  await page.goto('/discover?type=book')
  await expect(page.getByLabel('Book catalogue')).toHaveValue('google-books')
  await page.goto('/discover?type=book&provider=open-library')
  await expect(page.getByLabel('Book catalogue')).toHaveValue('open-library')
  await expect(page.locator('#open-library-query')).toBeDisabled()
  expect(sandbox.pilotRequests).toBe(1)
})

for (const type of ['open-library', 'book', 'movie', 'tv', 'game']) {
  test(`Discover ${type}: expired-cache return, input clearing, history and new/direct searches`, async ({ page, sandbox }, info) => {
    fullApp(sandbox)
    enable(sandbox)
    const started = Date.now()
    await page.clock.setFixedTime(started)
    const openLibrary = type === 'open-library'
    const query = type === 'tv' ? 'x' : 'lantern'
    const target = openLibrary ? `/tests/ui/open-library.html?type=book&q=${query}`
      : `/discover?type=${type}&q=${query}${type === 'book' ? '&provider=google-books&lang=nl' : ''}`
    await page.goto(target)
    const input = page.locator(openLibrary ? '#open-library-query' : `#${type}-query`)
    const cards = page.locator(openLibrary ? '.open-library-work' : '.discovery-search article')
    const expected = openLibrary ? 1 : 6
    await expect(cards).toHaveCount(expected)
    await navigation(page, info).getByRole('link', { name: 'Home', exact: true }).click()
    await page.clock.setFixedTime(started + 6 * 60 * 1000)
    await page.goBack()
    await expect(input).toHaveValue(query)
    await expect(cards).toHaveCount(expected)
    expect(count(sandbox, type)).toBe(1)
    const draft = type === 'tv' ? 'y' : 'Unsubmitted draft'
    await input.fill(draft)
    await navigation(page, info).getByRole('link', { name: 'Home', exact: true }).click()
    await page.goBack()
    await expect(input).toHaveValue(draft)
    await expect(cards).toHaveCount(expected)
    expect(count(sandbox, type)).toBe(1)
    await input.focus()
    if (type === 'book') {
      const box = await input.boundingBox()
      const padding = await input.evaluate(element => parseFloat(getComputedStyle(element).paddingRight))
      // Klik uitsluitend de native zoekveld-X in deze verse browsercontext.
      await input.click({ position: { x: box.width - padding - 6, y: box.height / 2 } })
    } else if (type === 'tv') {
      await input.press('End')
      await input.press('Backspace')
    } else {
      await input.press('ControlOrMeta+A')
      await input.press(type === 'movie' ? 'Backspace' : 'Delete')
    }
    await expect(input).toBeEmpty()
    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false)
    await expect(cards).toHaveCount(expected)
    expect(count(sandbox, type)).toBe(1)
    if (openLibrary) {
      await capture(page, info, 'cleared-open-library-results', input)
      if (info.project.name === 'mobile') await capture(page, info, 'cleared-open-library-visible-card', cards.first())
    }
    await navigation(page, info).getByRole('link', { name: 'Home', exact: true }).click()
    await page.goBack()
    await expect(input).toBeEmpty()
    await expect(cards).toHaveCount(0)
    await expect(page.locator('.catalogue-summary')).toContainText('Enter a title')
    expect(count(sandbox, type)).toBe(1)
    if (openLibrary) {
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).filter({ visible: true }).click()
      await capture(page, info, 'cleared-open-library-return-idle', input)
      if (info.project.name === 'mobile') await capture(page, info, 'cleared-open-library-idle-message', page.locator('.catalogue-summary'))
    }
    await page.goForward()
    await expect(page).toHaveURL(/\/$/)
    await page.goBack()
    await expect(input).toBeEmpty()
    await expect(cards).toHaveCount(0)
    await input.fill('replacement')
    await page.locator('button[type=submit]').click()
    await expect(cards).toHaveCount(expected)
    await expect(page.locator('.catalogue-summary')).toContainText('replacement')
    expect(count(sandbox, type)).toBe(2)
    await checkLayout(page)
    await page.goto(target)
    await expect(input).toHaveValue(query)
    await expect(cards).toHaveCount(expected)
    expect(count(sandbox, type)).toBe(3)
  })
}

test('Discover provider snapshots remain isolated when clearing the same Google query', async ({ page, sandbox }) => {
  fullApp(sandbox)
  enable(sandbox)
  await page.goto('/tests/ui/open-library.html?type=book&q=lantern')
  await expect(page.locator('.open-library-work')).toHaveCount(1)
  await page.getByLabel('Book catalogue').selectOption('google-books')
  await expect(page.locator('.book-grid article')).toHaveCount(6)
  await page.locator('#book-query').fill('')
  await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false)
  await expect(page.locator('.book-grid article')).toHaveCount(6)
  await page.goBack()
  await expect(page.getByLabel('Book catalogue')).toHaveValue('open-library')
  await expect(page.locator('.open-library-work')).toHaveCount(1)
  expect(sandbox.pilotRequests).toBe(1)
  expect(sandbox.googleRequests).toBe(1)
  await page.goForward()
  await expect(page.getByLabel('Book catalogue')).toHaveValue('google-books')
  await expect(page.locator('#book-query')).toBeEmpty()
  await expect(page.locator('.book-grid article')).toHaveCount(0)
  expect(sandbox.googleRequests).toBe(1)
})

test('Discover clearing blocks late pending Open Library and movie responses', async ({ page, sandbox }) => {
  const { records } = fullApp(sandbox)
  enable(sandbox)
  for (const type of ['open-library', 'movie']) {
    let finish
    const reply = async query => {
      if (query === 'pending') await new Promise(resolve => { finish = resolve })
      return { json: { data: type === 'movie' ? [{ ...records.movie[0], title: query === 'pending' ? 'Stale movie' : 'Current movie' }]
        : openLibraryResult([{ ...openLibraryWork, workTitle: query === 'pending' ? 'Stale Work' : 'Current Work' }]) } }
    }
    sandbox.pilotRespond = url => reply(url.searchParams.get('q'))
    sandbox.apiResponses['GET /api/v1/discover/movie'] = request => reply(new URL(request.url()).searchParams.get('q'))
    await page.goto(type === 'movie' ? '/discover?type=movie&q=pending' : '/tests/ui/open-library.html?type=book&q=pending')
    await expect.poll(() => typeof finish).toBe('function')
    const input = page.locator(type === 'movie' ? '#movie-query' : '#open-library-query')
    await input.fill('')
    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false)
    await input.fill('current')
    await page.locator('button[type=submit]').click()
    await expect(page.locator('.discovery-search article')).toHaveCount(1)
    const oldResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('q') === 'pending')
    finish()
    await (await oldResponse).finished()
    await expect(page.locator('.discovery-search article h3')).toContainText('Current')
    await expect(page.getByText(/Stale (movie|Work)/)).toHaveCount(0)
  }
})
