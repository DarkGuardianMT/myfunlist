import { test, expect, openLibraryWork, openLibraryResult, checkLayout, capture } from './fixtures.js'
import { fullApp } from './fullAppFixture.js'

function editionApp(sandbox, authenticated = true) {
  const { state } = fullApp(sandbox, authenticated)
  state.library = []
  state.members = { '1': [], '2': [] }
  sandbox.openLibraryHarness = true
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult() } })
  const media = { source: 'open-library', mediaType: 'book', sourceId: 'OL202M',
    title: openLibraryWork.selectedEdition.title, workId: 'OL101W', workTitle: openLibraryWork.workTitle,
    authors: openLibraryWork.authors, authorSource: 'work', publishedYear: '2025',
    coverImage: openLibraryWork.cover.url }
  const entry = { media, userMedia: { id: '701', mediaKey: 'open-library:book:OL202M',
    status: 'want-to-read', rating: null, addedAt: '2026-11-17T12:00:00Z' } }
  let writes = 0
  let failure = null
  sandbox.apiResponses['POST /api/v1/library'] = request => {
    writes++
    expect(request.postDataJSON()).toEqual({ media: { source: 'open-library', mediaType: 'book', sourceId: 'OL202M' } })
    if (failure) return failure
    const existing = state.library.find(item => item.userMedia.mediaKey === entry.userMedia.mediaKey)
    if (!existing) state.library.push(entry)
    return { json: { data: { added: !existing, item: existing || entry } } }
  }
  sandbox.apiResponses['PATCH /api/v1/library/701'] = request => {
    Object.assign(entry.userMedia, request.postDataJSON())
    return { json: { data: entry } }
  }
  sandbox.apiResponses['DELETE /api/v1/library/701'] = () => {
    state.library = state.library.filter(item => item.userMedia.id !== '701')
    for (const id in state.members) state.members[id] = state.members[id].filter(key => key !== '701')
    return { status: 204, body: '' }
  }
  sandbox.apiResponses['GET /api/v1/media/book/open-library/OL202M'] = { json: { data: {
    source: media.source, mediaType: 'book', sourceId: media.sourceId, title: media.title,
    artworkImage: media.coverImage, metadataSource: 'persisted-search',
    details: { editionId: 'OL202M', workId: 'OL101W', workTitle: media.workTitle, workAuthors: media.authors,
      workFirstPublicationYear: 2024, publicationDates: ['2025-03'], languages: ['dut'], isbns: ['9780261103344'] },
  } } }
  return { state, entry, writes: () => writes, fail: response => { failure = response } }
}

const discover = '/tests/ui/open-library.html?type=book&provider=open-library&q=lantern&lang=nl&mode=strict'

test('Open Library quick-add stays visible with optional details and explains unavailable Editions', async ({ page, sandbox }, info) => {
  const app = editionApp(sandbox)
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult([
    openLibraryWork,
    { ...openLibraryWork, workId: 'OL102W', workTitle: 'A Work without a selected Edition', selectedEdition: null },
    { ...openLibraryWork, workId: 'OL103W', workTitle: 'A Work with an untitled Edition',
      selectedEdition: { ...openLibraryWork.selectedEdition, editionId: 'OL203M', title: null } },
    { ...openLibraryWork, workId: 'OL104W', workTitle: 'A Work with ambiguous Edition languages',
      selectedEdition: { ...openLibraryWork.selectedEdition, editionId: 'OL204M', languages: ['dut', 'eng'], languageStatus: 'ambiguous' } },
  ]) } })
  await page.goto('/tests/ui/open-library.html?type=book&provider=open-library&q=lantern')
  const cards = page.locator('.open-library-work')
  await expect(cards).toHaveCount(4)
  await expect(cards.locator('.edition-details[open]')).toHaveCount(0)
  const add = cards.first().getByRole('button', { name: /^Add to Library:/ })
  await expect(add).toBeVisible()
  await expect(add).toBeEnabled()
  await expect(cards.first().locator('.open-library-work__save')).toContainText('Edition language: Dutch')
  await expect(cards.nth(1).locator('.open-library-work__unavailable')).toBeVisible()
  await expect(cards.nth(1).locator('.open-library-work__unavailable')).toContainText('No supported edition was supplied')
  for (const index of [2, 3]) {
    await expect(cards.nth(index).locator('.open-library-work__unavailable')).toContainText('cannot be saved')
    await expect(cards.nth(index).locator('.edition-save')).toHaveCount(0)
  }
  await expect(cards.locator('.edition-save')).toHaveCount(1)
  await cards.first().locator('summary').click()
  await expect(cards.locator('.edition-details .edition-save')).toHaveCount(0)
  await expect(add).toHaveCount(1)
  await cards.first().locator('summary').click()
  await checkLayout(page)
  await capture(page, info, 'quick-add-light', cards.first().locator('.open-library-work__save'))
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).filter({ visible: true }).click()
  await capture(page, info, 'quick-add-dark', cards.first().locator('.open-library-work__save'))
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await checkLayout(page)
    await expect(add).toBeVisible()
    expect((await add.boundingBox()).height).toBeGreaterThanOrEqual(44)
  }
  expect(app.writes()).toBe(0)
  expect(sandbox.pilotRequests).toBe(1)
})

test('Open Library Library integration: save exact Edition, tracking, layouts, Lists, reload and contextual detail', async ({ page, sandbox }, info) => {
  test.setTimeout(60000)
  const app = editionApp(sandbox)
  await page.goto(discover)
  const work = page.locator('.open-library-work')
  const add = work.getByRole('button', { name: /^Add to Library:/ })
  await expect(work.locator('.edition-details')).not.toHaveAttribute('open', '')
  await expect(add).toBeVisible()
  await expect(add).toBeEnabled()
  await expect(work.locator('.open-library-work__save')).toContainText('Edition language: Dutch')
  await work.locator('summary').click()
  await expect(work.locator('.edition-details .edition-save')).toHaveCount(0)
  await expect(work.getByRole('button', { name: /^Add to Library:/ })).toHaveCount(1)
  await work.locator('summary').click()
  await capture(page, info, 'after-open-library-save-light', add)
  await add.dblclick()
  await expect(work.getByRole('button', { name: /^In Library:/ })).toBeDisabled()
  await expect(work.getByText('Selected edition added to Library.', { exact: true })).toBeVisible()
  expect(app.writes()).toBe(1)
  expect(sandbox.googleRequests).toBe(0)
  await page.goto('/library')
  let card = page.locator('.library-grid > article').first()
  await expect(card).toContainText(openLibraryWork.selectedEdition.title)
  for (const mode of ['Compact', 'List', 'Comfortable']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    await checkLayout(page)
  }
  for (const status of ['reading', 'finished', 'want-to-read']) {
    await card.getByRole('combobox', { name: /status for/ }).selectOption(status)
    await expect(card.getByRole('combobox', { name: /status for/ })).toBeEnabled()
  }
  await card.getByLabel(/^Edit personal rating for/).click()
  for (const rating of ['0.5', '10', '8.5']) {
    await card.getByRole('combobox', { name: /^Personal rating for/ }).selectOption(rating)
    await expect(card.getByRole('combobox', { name: /^Personal rating for/ })).toBeEnabled()
  }
  await page.reload()
  card = page.locator('.library-grid > article').first()
  await expect(card).toContainText('8.5')
  await page.getByLabel('Search your Library').fill('no matching title')
  await expect(page.locator('.library-grid > article')).toHaveCount(0)
  await page.getByLabel('Search your Library').fill('Lantern')
  await expect(card).toBeVisible()
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).filter({ visible: true }).click()
  await capture(page, info, 'after-open-library-library-controls-dark', card.getByRole('combobox', { name: /status for/ }))
  await card.getByRole('link', { name: openLibraryWork.selectedEdition.title, exact: true }).click()
  await expect(page.getByRole('link', { name: '← Back to Library', exact: true })).toBeVisible()
  await expect(page.getByText('Edition ID', { exact: true })).toBeVisible()
  await expect(page.getByText('Work ID', { exact: true })).toBeVisible()
  await expect(page.getByText(/Saved catalogue snapshot/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Library · Edition OL202M', exact: true })).toHaveAttribute('href', 'https://openlibrary.org/books/OL202M')
  await expect(page.getByRole('link', { name: 'Work OL101W', exact: true })).toHaveAttribute('href', 'https://openlibrary.org/works/OL101W')
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).filter({ visible: true }).click()
  await capture(page, info, 'after-open-library-detail-metadata-light', page.locator('.media-detail-metadata'))
  await page.getByRole('link', { name: '← Back to Library', exact: true }).click()
  await card.getByLabel(/^Manage /).click()
  await card.getByRole('button', { name: /^Remove .+ from Library$/ }).click()
  await expect(page.locator('.library-grid > article')).toHaveCount(0)
  await page.getByRole('button', { name: /^Undo removal of/ }).click()
  await expect(page.locator('.library-grid > article')).toHaveCount(1)
  expect(sandbox.apiCalls.filter(call => call === 'DELETE /api/v1/library/701')).toHaveLength(0)
  await page.goto('/lists/1')
  await page.getByText('Add from Library', { exact: true }).click()
  await page.getByLabel('Library item', { exact: true }).selectOption('701')
  await page.getByRole('button', { name: 'Add to list', exact: true }).click()
  const listCard = page.locator('.list-collection-grid > article').first()
  await expect(listCard).toBeVisible()
  expect(app.state.members['1']).toContain('701')
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).filter({ visible: true }).click()
  await capture(page, info, 'after-open-library-list-dark', listCard)
  await listCard.getByRole('link', { name: openLibraryWork.selectedEdition.title, exact: true }).click()
  await expect(page.getByRole('link', { name: '← Back to List', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '← Back to List', exact: true }).click()
  await page.reload()
  await expect(page.locator('.list-collection-grid > article')).toHaveCount(1)
  expect(app.writes()).toBe(1)
  expect(sandbox.pilotRequests).toBe(1)
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await checkLayout(page)
  }
})

test('Open Library saving: anonymous login, expired trust, manual retry and outage cooldown', async ({ page, sandbox }) => {
  const app = editionApp(sandbox, false)
  await page.goto(discover)
  await page.getByRole('link', { name: /^Log in to add:/ }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(app.writes()).toBe(0)
  await page.getByLabel('Email', { exact: true }).fill('reader@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/library$/)
  await page.goto(discover)
  app.fail({ status: 409, json: { error: { code: 'edition_unavailable' } } })
  await page.getByRole('button', { name: /^Add to Library:/ }).click()
  await expect(page.locator('.edition-save').getByRole('alert')).toContainText('Submit the search again')
  expect(app.state.library).toHaveLength(0)
  const searches = sandbox.pilotRequests
  await page.locator('.open-library-discover button[type=submit]').click()
  await expect(page.locator('.open-library-work')).toBeVisible()
  expect(sandbox.pilotRequests).toBe(searches + 1)
  app.fail({ status: 503, headers: { 'Retry-After': '60' }, json: { error: { code: 'provider_unavailable' } } })
  await page.getByRole('button', { name: /^Add to Library:/ }).click()
  await expect(page.locator('.edition-save').getByRole('alert')).toContainText('wait')
  await expect(page.getByRole('button', { name: /^Add to Library:/ })).toBeDisabled()
  expect(app.writes()).toBe(2)
  await checkLayout(page)
})
