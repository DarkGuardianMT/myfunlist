import { test, expect, checkLayout, capture } from './fixtures.js'
import { fullApp } from './fullAppFixture.js'

const baseline = process.env.QA_UX_BASELINE === 'true'
async function screenshot(page, info, name, focus, viewportOnly = false) {
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => {
    image.loading = 'eager'
    return image.decode().catch(() => {})
  })))
  await checkLayout(page)
  await capture(page, info, `ux-${baseline ? 'before' : 'after'}-${name}`, focus, viewportOnly)
}

for (const theme of ['dark', 'light']) test(`UX refinement visuals ${theme}`, async ({ page, sandbox }, info) => {
  test.setTimeout(60000)
  const { state } = fullApp(sandbox)
  state.library.find(item => item.userMedia.id === '103').userMedia.rating = 8.5
  await page.addInitScript(value => localStorage.setItem('myfunlist_theme', value), theme)
  await page.goto('/library')
  await expect(page.locator('.library-grid > article')).toHaveCount(12)
  if (!baseline) expect((await page.locator('.collection-controls').first().boundingBox()).height).toBeLessThanOrEqual(100)
  for (const mode of ['Comfortable', 'Compact', 'List']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    await screenshot(page, info, `mixed-${mode.toLowerCase()}-${theme}`,
      info.project.name === 'mobile' ? page.locator('.library-grid > article[data-type="game"]').first() : undefined)
  }
  await page.getByRole('button', { name: 'Comfortable', exact: true }).click()
  if (baseline) await page.locator('#library-media-filter').selectOption('tv')
  else await page.getByRole('group', { name: 'Library media type', exact: true }).getByRole('button', { name: 'TV Shows', exact: true }).click()
  await screenshot(page, info, `tv-card-${theme}`, page.locator('.library-grid > article .library-item-controls').first())
  if (!baseline) {
    const card = page.locator('.library-grid > article').first()
    await card.getByLabel(/^Edit personal rating for/).click()
    await expect(card.locator('.collection-rating')).toHaveAttribute('open', '')
    await screenshot(page, info, `rating-editor-${theme}`, card.locator('.collection-rating'), true)
    await expect(card.locator('.collection-rating')).toHaveAttribute('open', '')
    await card.getByLabel(/^Edit personal rating for/).press('Escape')
    await card.getByLabel(/^Manage /).click()
    await expect(card.locator('.collection-manage')).toHaveAttribute('open', '')
    await screenshot(page, info, `management-menu-${theme}`, card.locator('.collection-manage'), true)
    await expect(card.locator('.collection-manage')).toHaveAttribute('open', '')
    await card.getByLabel(/^Manage /).press('Escape')
  }
  for (const type of ['movie', 'tv', 'game', 'book']) {
    await page.goto(`/discover?type=${type}&q=lantern`)
    await expect(page.locator('.discovery-search article')).toHaveCount(6)
    await screenshot(page, info, `discover-${type}-${theme}`, info.project.name === 'mobile' ? page.locator('.discovery-search-panel') : undefined)
  }
})

test('UX compact cards preserve rating, status, lazy list membership and removal Undo', async ({ page, sandbox }, info) => {
  const { state } = fullApp(sandbox)
  await page.goto('/library')
  await expect(page.locator('.library-grid > article')).toHaveCount(12)
  for (const type of ['movie', 'tv', 'game', 'book']) {
    const card = page.locator(`.library-grid > article[data-type="${type}"]`).first()
    const rate = card.getByLabel(/^Edit personal rating for/)
    await rate.scrollIntoViewIfNeeded()
    await rate.press('Enter')
    await expect(card.locator('.collection-rating')).toHaveAttribute('open', '')
    const field = card.getByRole('combobox', { name: /^Personal rating for/ })
    for (const value of ['0.5', '8.5', '10', '']) {
      await field.selectOption(value)
      await expect(field).toBeEnabled()
      await expect(field).toHaveValue(value)
      await expect(rate).toContainText(value ? `${value} / 10` : 'Rate')
    }
    await field.press('Escape')
    await expect(rate).toBeFocused()
    await expect(card.locator('.collection-rating')).not.toHaveAttribute('open')
    const status = card.getByRole('combobox', { name: /status for/ })
    const selected = { movie: 'watched', tv: 'completed', game: 'completed', book: 'finished' }[type]
    await status.selectOption(selected)
    await expect(status).toBeEnabled()
    await expect(status).toHaveValue(selected)
  }
  expect(sandbox.apiCalls.filter(call => call === 'GET /api/v1/lists')).toHaveLength(0)
  const tv = page.locator('.library-grid > article[data-type="tv"]').first()
  const manage = tv.getByLabel(/^Manage /)
  await manage.click()
  await expect(tv.locator('.collection-manage .card-popover__panel')).toBeVisible()
  await checkLayout(page)
  await manage.press('Escape')
  await expect(manage).toBeFocused()
  await manage.click()
  await page.getByLabel('Search your Library').focus()
  await expect(tv.locator('.collection-manage')).not.toHaveAttribute('open')
  await manage.click()
  await tv.getByRole('button', { name: 'Add to Custom List', exact: true }).click()
  await tv.getByLabel('Custom List', { exact: true }).selectOption('1')
  await tv.getByRole('button', { name: 'Add to list', exact: true }).click()
  await expect.poll(() => state.members['1'].includes('103')).toBe(true)
  await tv.getByRole('button', { name: /^Remove .+ from Library$/ }).click()
  await expect(page.locator('.library-grid > article')).toHaveCount(11)
  await page.getByRole('button', { name: /^Undo removal of/ }).click()
  await expect(page.locator('.library-grid > article')).toHaveCount(12)
  await expect(tv.getByRole('button', { name: /^Remove .+ from Library$/ })).toBeFocused()
  expect(state.members['1']).toContain('103')
  expect(sandbox.apiCalls.filter(call => call.startsWith('DELETE'))).toHaveLength(0)
  await checkLayout(page)
})

test('UX returned-result filters preserve provider requests, URL context and cached detail return', async ({ page, sandbox }) => {
  const { records } = fullApp(sandbox)
  await page.clock.install()
  for (const type of ['movie', 'tv', 'game']) {
    const items = records[type]
    for (const [index, item] of items.entries()) {
      item.releaseYear = item.firstAirYear = index === 0 ? '2020' : index === 3 ? null : '2021'
      item.originalLanguage = index === 0 ? 'en' : 'nl'
      item.platforms = index === 0 ? ['PC'] : ['Example Console']
    }
    let calls = 0
    sandbox.apiResponses[`GET /api/v1/discover/${type}`] = request => {
      calls++
      expect([...new URL(request.url()).searchParams.keys()]).toEqual(['q'])
      return { json: { data: items } }
    }
    await page.goto(`/discover?type=${type}&q=local-fixture`)
    await expect(page.locator('.discovery-search article')).toHaveCount(6)
    await page.clock.fastForward(6 * 60 * 1000)
    await page.locator(`#${type}-result-year`).selectOption('2020')
    await expect(page.locator('.discovery-search article')).toHaveCount(1)
    await expect(page).toHaveURL(/resultYear=2020/)
    const secondary = page.locator(`#${type}-result-${type === 'game' ? 'platform' : 'language'}`)
    await secondary.selectOption(type === 'game' ? 'PC' : 'en')
    await expect(page.locator('.discovery-search article')).toHaveCount(1)
    expect(calls).toBe(1)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect.poll(() => calls).toBe(2)
    await expect(page.locator('.discovery-search article')).toHaveCount(1)
    await page.locator('.discovery-search article h3 a').click()
    await expect(page.locator('.media-detail-hero')).toBeVisible()
    await page.locator('.media-detail-back').click()
    await expect(page).toHaveURL(/resultYear=2020/)
    await expect(page.locator('.discovery-search article')).toHaveCount(1)
    expect(calls).toBe(2)
    await secondary.selectOption(type === 'game' ? 'Example Console' : 'nl')
    await expect(page.getByText('No returned results match these filters. Clear them or try a different search.')).toBeVisible()
    await page.getByRole('button', { name: 'Show all returned results', exact: true }).click()
    await expect(page.locator('.discovery-search article')).toHaveCount(6)
    expect(calls).toBe(2)
    await page.locator(`#${type}-result-year`).selectOption('unknown')
    await expect(page.locator('.discovery-search article')).toHaveCount(1)
    await page.locator(`#${type}-query`).fill('new-fixture')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.locator('.discovery-search article')).toHaveCount(6)
    await expect(page).not.toHaveURL(/resultYear/)
  }
  await page.goto('/discover')
  await expect(page.getByLabel('Book catalogue')).toHaveValue('google-books')
  expect(sandbox.pilotRequests).toBe(0)
})

test('UX keyboard categories and proportional game art remain usable at 320px and 768px', async ({ page, sandbox }, info) => {
  test.setTimeout(60000)
  fullApp(sandbox)
  sandbox.artwork['https://ui-fixtures.invalid/complete-game-0.jpg'] = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#264f61"/><path d="M0 0h960v540H0Z" fill="none" stroke="#cfef8a" stroke-width="12"/><text x="60" y="280" fill="white" font-size="48">FICTIONAL LANDSCAPE • FULL FRAME</text></svg>'
  for (const width of [320, 768]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/library')
    await expect(page.locator('.library-grid > article')).toHaveCount(12)
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} mode`, exact: true }).click()
    const group = page.getByRole('group', { name: 'Library media type', exact: true })
    await expect(group.getByRole('button')).toHaveText(['All', 'Movies', 'TV Shows', 'Games', 'Books'])
    await group.getByRole('button', { name: 'All', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('button', { name: 'Movies', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('End')
    await expect(group.getByRole('button', { name: 'Books', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Home')
    const image = page.locator('.library-grid > article[data-type="game"] .media-artwork__image').first()
    await image.evaluate(async element => { element.loading = 'eager'; await element.decode() })
    expect(await image.evaluate(element => Math.abs(element.getBoundingClientRect().width / element.getBoundingClientRect().height - 16 / 9))).toBeLessThan(0.02)
    await screenshot(page, info, `mixed-${width}-${theme}`, image)
    for (const mode of ['Compact', 'List', 'Comfortable']) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      await checkLayout(page)
    }
    await group.getByRole('button', { name: 'Games', exact: true }).click()
    await expect(page.locator('.library-grid .media-artwork--landscape')).toHaveCount(3)
    await checkLayout(page)
    await screenshot(page, info, `games-${width}-${theme}`, page.locator('.library-grid > article').first())
  }
})
