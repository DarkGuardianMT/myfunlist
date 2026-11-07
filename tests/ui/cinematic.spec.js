import { test, expect, checkLayout, capture } from './fixtures.js'

const names = ['The Lantern Atlas', 'Small Hours', 'The Shape of Tomorrow', 'Field Notes from Elsewhere', 'A Very Long Fictional Title About the Worlds We Have Yet to Discover', 'An Unpictured Adventure']
const colors = ['#244953', '#ab674e', '#d6c595', '#303b5a', '#6a5949', '#45634f']

function artwork(title, index, wide = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wide ? 800 : 300}" height="450" viewBox="0 0 ${wide ? 800 : 300} 450"><rect width="100%" height="100%" fill="${colors[index]}"/><circle cx="${wide ? 520 : 150}" cy="235" r="100" fill="none" stroke="#f1ddb0" stroke-width="2"/><path d="M40 340 150 140 260 340Z" fill="#f1ddb0" opacity=".5"/><path d="M30 375h240" stroke="#f1ddb0"/><text x="24" y="38" fill="#f7ebcf" font-family="sans-serif" font-size="10" letter-spacing="2">FICTIONAL QA ARTWORK</text>${title.split(' ').slice(0, 5).map((word, i) => `<text x="24" y="${86 + i * 30}" fill="#fff4da" font-family="Georgia,serif" font-size="27">${word}</text>`).join('')}<text x="24" y="420" fill="#fff4da" font-family="sans-serif" font-size="12">A SYNTHETIC EDITION</text></svg>`
}

function catalogue(sandbox, type) {
  return names.map((title, index) => {
    const image = index === 5 ? null : `https://ui-fixtures.invalid/${type}-${index}.jpg`
    if (image) sandbox.artwork[image] = artwork(title, index, type === 'game')
    return { source: type === 'book' ? 'google-books' : type === 'game' ? 'rawg' : 'tmdb', mediaType: type,
      sourceId: type === 'book' ? `cinematic${index}` : String(100 + index), title,
      coverImage: image, posterImage: image, releaseYear: '2025', firstAirYear: '2025', publishedYear: '2025',
      authors: ['Example Author'], platforms: ['PC', 'Example Console'],
      description: 'A fictional story about finding your way through an unfamiliar world. Synthetic metadata for isolated interface testing.' }
  })
}

function mockCatalogue(sandbox, type) {
  const items = catalogue(sandbox, type)
  if (type === 'book') sandbox.googleItems = items.map(item => ({ id: item.sourceId, volumeInfo: { title: item.title,
    authors: item.authors, language: 'en', publishedDate: '2025', ...(item.coverImage ? { imageLinks: { thumbnail: item.coverImage } } : {}) } }))
  else sandbox.apiResponses[`GET /api/v1/discover/${type}`] = { json: { data: items } }
  return items
}

function account(sandbox, items = []) {
  sandbox.apiResponses['GET /api/v1/auth/me'] = { json: { data: { user: { id: 'synthetic-account', email: 'reader@example.test', displayName: 'Example Reader' } } } }
  sandbox.apiResponses['GET /api/v1/auth/csrf'] = { json: { data: { csrfToken: 'synthetic-test-token' } } }
  sandbox.apiResponses['GET /api/v1/library'] = { json: { data: items } }
  sandbox.apiResponses['POST /api/v1/auth/logout'] = { status: 204, body: '' }
}

function entry(media, index, status = 'reading') {
  return { media, userMedia: { id: `entry-${index}`, mediaKey: `${media.source}:${media.mediaType}:${media.sourceId}`,
    status, rating: index === 0 ? 8.5 : null, addedAt: `2026-10-${String(20 - index).padStart(2, '0')}T12:00:00Z` } }
}

async function screenshot(page, info, name, focus) {
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => {}))))
  await checkLayout(page)
  await capture(page, info, `cinematic-${name}`, focus)
}

for (const mode of ['dark', 'light']) {
  test(`Cinematic ${mode}: Home, search handoff and all four catalogues`, async ({ page, sandbox }, info) => {
    await page.addInitScript(value => localStorage.setItem('myfunlist_theme', value), mode)
    for (const type of ['book', 'movie', 'tv', 'game']) mockCatalogue(sandbox, type)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
    await expect(page.locator('.home-world')).toHaveCount(4)
    await screenshot(page, info, `home-${mode}`)
    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      await checkLayout(page)
    }
    await page.setViewportSize(info.project.use.viewport)
    await page.getByLabel('Title, author, or ISBN', { exact: true }).fill('lantern-fixture')
    await page.getByRole('button', { name: 'Find media', exact: true }).click()
    await expect(page.locator('.book-card')).toHaveCount(6)
    await expect(page.getByLabel('Book catalogue', { exact: true })).toHaveValue('google-books')
    for (const [type, label] of [['book', 'Books'], ['movie', 'Movies'], ['tv', 'TV Shows'], ['game', 'Games']]) {
      await page.getByRole('button', { name: label, exact: true }).click()
      const input = page.locator(`#${type}-query`)
      if (type !== 'book') {
        await input.fill('lantern-fixture')
        await page.getByRole('button', { name: 'Search', exact: true }).click()
      }
      const cards = page.locator('.discovery-search article')
      await expect(cards).toHaveCount(6)
      await expect(cards.last()).toContainText(type === 'book' ? 'No cover' : type === 'game' ? 'No artwork' : 'No poster')
      await expect(cards.first().getByRole('button', { name: /^Log in to add:/ })).toBeEnabled()
      const cardBox = await cards.first().boundingBox()
      const actionBox = await cards.first().getByRole('button', { name: /^Log in to add:/ }).boundingBox()
      expect(actionBox.width).toBeGreaterThanOrEqual(cardBox.width - 2)
      await screenshot(page, info, `discover-${type}-${mode}`, cards.first())
      if (info.project.name === 'mobile') await screenshot(page, info, `search-${type}-${mode}`)
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 900 })
        await checkLayout(page)
        await expect(page.locator('.discover-type-switcher button[aria-pressed="true"]')).toHaveCount(1)
      }
      await page.setViewportSize(info.project.use.viewport)
      await cards.first().getByRole('button', { name: /^Log in to add:/ }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Log in or register' })).toBeVisible()
    }
    expect(sandbox.pilotRequests).toBe(0)
  })
}

test('Cinematic default, persisted light preference and complete anonymous mobile menu', async ({ page }, info) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('cinematic-default-checked')) localStorage.removeItem('myfunlist_theme')
    sessionStorage.setItem('cinematic-default-checked', 'true')
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const theme = page.getByRole('button', { name: 'Switch to light mode', exact: true }).filter({ visible: true })
  await theme.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  if (info.project.name === 'mobile') {
    const menu = page.locator('.mobile-account-menu')
    await menu.locator('summary').click()
    await expect(menu.getByRole('link', { name: 'Create an account' })).toBeVisible()
    await screenshot(page, info, 'anonymous-menu-light')
    await menu.locator('summary').press('Escape')
    await expect(menu).not.toHaveAttribute('open')
    await expect(menu.locator('summary')).toBeFocused()
    await menu.locator('summary').click()
    await menu.getByRole('link', { name: 'Create an account' }).click()
    await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible()
    await expect(menu).not.toHaveAttribute('open')
  }
})

test('Cinematic account Home uses Library artwork and logout clears private shelves', async ({ page, sandbox }, info) => {
  await page.addInitScript(() => localStorage.setItem('myfunlist_theme', 'dark'))
  const books = catalogue(sandbox, 'book')
  const items = books.map((media, index) => entry(media, index, index === 4 ? 'finished' : 'reading'))
  account(sandbox, items)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pick up where you left off.' })).toBeVisible()
  await expect(page.locator('.home-shelf-card')).toHaveCount(5)
  await expect(page.getByText('Your rating: 8.5/10', { exact: true })).toBeVisible()
  await expect(page.locator('.home-shelf-card').last()).toContainText('No artwork available')
  await screenshot(page, info, 'home-account-dark', page.locator('.home-personal'))
  const menu = page.locator(info.project.name === 'mobile' ? '.mobile-account-menu' : '.site-nav .account-menu')
  await menu.locator('summary').click()
  await expect(menu.getByText('Example Reader', { exact: true })).toBeVisible()
  await screenshot(page, info, 'account-menu-dark')
  await menu.locator('summary').press('Escape')
  await expect(menu.locator('summary')).toBeFocused()
  await menu.locator('summary').click()
  await menu.getByRole('button', { name: 'Logout', exact: true }).click()
  await expect(page.locator('.home-personal')).toHaveCount(0)
  expect(sandbox.apiCalls.filter(call => call === 'POST /api/v1/auth/logout')).toHaveLength(1)
})

test('Cinematic Home Library retry and empty state remain useful', async ({ page, sandbox }) => {
  account(sandbox)
  sandbox.apiResponses['GET /api/v1/library'] = { status: 503, json: { error: { code: 'unavailable', message: 'Synthetic failure.' } } }
  await page.goto('/')
  await expect(page.getByText('Your Library could not be loaded.', { exact: true })).toBeVisible()
  sandbox.apiResponses['GET /api/v1/library'] = { json: { data: [] } }
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your next favourite belongs here.' })).toBeVisible()
  await checkLayout(page)
})

test('Cinematic movie, TV and game loading, empty, provider failure and manual retry', async ({ page, sandbox }) => {
  for (const type of ['movie', 'tv', 'game']) {
    let release
    sandbox.apiResponses[`GET /api/v1/discover/${type}`] = async () => {
      await new Promise(resolve => { release = resolve })
      return { json: { data: [] } }
    }
    await page.goto(`/discover?type=${type}`)
    await page.locator(`#${type}-query`).fill('synthetic-empty')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.locator('.catalogue-skeletons')).toBeVisible()
    await expect.poll(() => typeof release).toBe('function')
    release()
    await expect(page.getByText(/No .+ found for/)).toBeVisible()
    sandbox.apiResponses[`GET /api/v1/discover/${type}`] = { status: 503, json: { error: { code: 'provider_unavailable', message: 'Synthetic provider unavailable.' } } }
    await page.locator(`#${type}-query`).fill('synthetic-retry')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'temporarily unavailable' })).toBeVisible()
    mockCatalogue(sandbox, type)
    await page.getByRole('button', { name: 'Retry search', exact: true }).click()
    await expect(page.locator('.discovery-search article')).toHaveCount(6)
    await checkLayout(page)
  }
})

test('Cinematic Discover add, detail return, Library status, rating and removal Undo', async ({ page, sandbox }) => {
  const media = mockCatalogue(sandbox, 'movie')[0]
  const saved = entry(media, 0, 'want-to-watch')
  account(sandbox)
  sandbox.apiResponses['GET /api/v1/media/movie/tmdb/100'] = { json: { data: { ...media, artworkImage: media.posterImage, genres: ['Synthetic adventure'], details: {} } } }
  sandbox.apiResponses['POST /api/v1/library'] = request => {
    expect(request.postDataJSON()).toEqual({ media: { source: 'tmdb', mediaType: 'movie', sourceId: '100' } })
    return { json: { data: { added: true, item: saved } } }
  }
  sandbox.apiResponses['PATCH /api/v1/library/entry-0'] = request => {
    Object.assign(saved.userMedia, request.postDataJSON())
    return { json: { data: saved } }
  }
  await page.goto('/discover?type=movie&q=lantern-fixture')
  const card = page.locator('.discovery-search article').first()
  await card.getByRole('button', { name: /^Add to Library:/ }).click()
  await expect(card.getByRole('button', { name: /^In Library:/ })).toBeDisabled()
  await card.getByRole('link', { name: media.title, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: media.title, exact: true })).toBeVisible()
  await page.locator('.media-detail-back').click()
  await expect(page.locator('#movie-query')).toHaveValue('lantern-fixture')
  await page.getByRole('navigation', { name: /^(Main|Mobile) navigation$/ }).filter({ visible: true }).getByRole('link', { name: 'Library', exact: true }).click()
  const status = page.getByRole('combobox', { name: `Watch status for ${media.title}`, exact: true })
  await status.selectOption('watched')
  await expect(status).toBeEnabled()
  await expect(status).toHaveValue('watched')
  const rating = page.getByRole('combobox', { name: `Personal rating for ${media.title}`, exact: true })
  await rating.selectOption('9')
  await expect(rating).toBeEnabled()
  await expect(rating).toHaveValue('9')
  await page.getByRole('button', { name: `Remove ${media.title} from Library`, exact: true }).click()
  await page.getByRole('button', { name: `Undo removal of ${media.title}`, exact: true }).click()
  await expect(status).toHaveValue('watched')
  await expect(rating).toHaveValue('9')
  expect(sandbox.apiCalls.filter(call => call.startsWith('DELETE'))).toHaveLength(0)
  await checkLayout(page)
})
