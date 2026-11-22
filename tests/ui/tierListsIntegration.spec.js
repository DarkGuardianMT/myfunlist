import { test, expect, capture, checkLayout } from './fixtures.js'
import { fullApp, pilotCatalogue } from './fullAppFixture.js'

const enabled = process.env.MYFUNLIST_UI_TEST_TIER_LISTS === 'true'
const root = '/api/v1/tier-lists'
const boardId = '9007199254740993'
const secondId = '42'
const date = '2026-11-22T10:30:00.000000Z'
const ok = data => ({ json: { data } })
const failure = (status, code, headers = {}) => ({ status, headers, json: { error: { code, message: 'Synthetic fixture error.' } } })
const button = (page, name) => page.getByRole('button', { name, exact: true })
const picker = page => page.locator('.tier-editor-controls').getByRole('button', { name: 'Add media' }).click()
const lane = (page, name) => page.getByRole('region', { name, exact: true })
const dialog = page => page.getByRole('dialog')
const toCard = media => ({
  source: media.source, mediaType: media.mediaType, sourceId: media.sourceId,
  title: media.title, artworkImage: media.artworkImage ?? media.posterImage ?? media.coverImage ?? null,
})
const identity = ({ source, mediaType, sourceId }) => ({ source, mediaType, sourceId })
const theme = async (page, value) => {
  const target = page.getByRole('button', { name: 'Switch to ' + value + ' mode' }).filter({ visible: true })
  await target.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', value)
}

function mockBoards(sandbox) {
  const app = fullApp(sandbox)
  delete sandbox.apiResponses['POST /api/v1/library']
  const { records } = app
  const catalogue = Object.values(records).flat().map(toCard)
  const createBoard = (id, title, allowedTypes = ['movie', 'tv', 'book', 'game'], description = null) => ({
    id, title, description, allowedTypes, revision: 1, createdAt: date, updatedAt: date,
    tiers: ['S', 'A', 'B', 'C', 'D'].map((name, i) => ({ key: name.toLowerCase(), name,
      color: ['Lime', 'Amber', 'Coral', 'Teal', 'Violet'][i], items: [] })), unranked: [],
  })
  const saved = createBoard(boardId, 'After Hours', undefined, 'Stories from a fictional catalogue.')
  saved.tiers[0].items = [records.book[4], records.game[1], records.movie[1]].map(toCard)
  saved.tiers[2].items = [toCard(records.tv[5])]
  saved.unranked = [toCard(records.book[1])]
  const state = { ...app, catalogue, boards: new Map([[boardId, saved], [secondId, createBoard(secondId, 'Weekend picks')]]),
    create: [], prepare: [], saves: [], deletes: [], onSave: null, onPrepare: null, onCreate: null, missing: new Set(), cursors: [] }
  const summary = ({ tiers, unranked, ...base }) => ({ ...base, itemCount: unranked.length + tiers.reduce((n, t) => n + t.items.length, 0) })
  function register(id) {
    const path = root + '/' + id
    sandbox.apiResponses['GET ' + path] = () => state.missing.has(id) ? failure(404, 'tier_list_not_found') : ok(state.boards.get(id))
    sandbox.apiResponses['POST ' + path + '/media/prepare'] = request => {
      const body = request.postDataJSON()
      expect(Object.keys(body).sort()).toEqual(['mediaType', 'source', 'sourceId'])
      expect(request.headers()['x-csrf-token']).toBe('synthetic-complete-token')
      state.prepare.push(body)
      if (state.onPrepare) return state.onPrepare(body)
      return ok(state.catalogue.find(media => JSON.stringify(identity(media)) === JSON.stringify(body)))
    }
    sandbox.apiResponses['PUT ' + path] = request => {
      const body = request.postDataJSON()
      for (const item of [...body.unranked, ...body.tiers.flatMap(tier => tier.items), ...body.removedItems || []]) {
        expect(Object.keys(item).sort()).toEqual(['mediaType', 'source', 'sourceId'])
      }
      expect(request.headers()['x-csrf-token']).toBe('synthetic-complete-token')
      state.saves.push(body)
      const previous = state.boards.get(id)
      const resolve = item => state.catalogue.find(media => JSON.stringify(identity(media)) === JSON.stringify(item))
      const next = { ...previous, title: body.title, description: body.description, revision: previous.revision + 1,
        allowedTypes: body.allowedTypes, tiers: body.tiers.map(tier => ({ ...tier, items: tier.items.map(resolve) })),
        unranked: body.unranked.map(resolve) }
      return state.onSave ? state.onSave(previous, next, body) : (state.boards.set(id, next), ok(next))
    }
    sandbox.apiResponses['DELETE ' + path] = request => {
      state.deletes.push(request.postDataJSON())
      state.boards.delete(id)
      return { status: 204, body: '' }
    }
  }
  register(boardId)
  register(secondId)
  sandbox.apiResponses['GET ' + root] = request => {
    const cursor = new URL(request.url()).searchParams.get('beforeId')
    state.cursors.push(cursor)
    if (cursor) return ok({ boards: [summary(state.boards.get(secondId))], nextCursor: null })
    const first = state.boards.get(boardId)
    return ok({ boards: first ? [summary(first)] : [], nextCursor: first ? boardId : null })
  }
  sandbox.apiResponses['POST ' + root] = request => {
    const body = request.postDataJSON()
    const key = request.headers()['idempotency-key']
    expect(request.headers()['x-csrf-token']).toBe('synthetic-complete-token')
    state.create.push({ body, key })
    const id = '43'
    if (!state.boards.has(id)) {
      state.boards.set(id, createBoard(id, body.title, body.allowedTypes, body.description))
      register(id)
    }
    return state.onCreate?.() ?? ok(state.boards.get(id))
  }
  return state
}

test('normal shell leaves Tier Lists navigation and requests disabled', async ({ page, sandbox }) => {
  test.skip(enabled, 'This test uses the ordinary disabled test server.')
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Home', exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tier Lists' })).toHaveCount(0)
  await page.goto('/tier-lists')
  await expect(page.locator('.tier-integration')).toHaveCount(0)
  expect(sandbox.apiCalls.filter(call => call.includes(root))).toEqual([])
})

test.describe('isolated Tier Lists integration', () => {
  test.skip(!enabled, 'Opt in to the browser-only Tier Lists integration flag.')

  test('overview pages and recovers an uncertain create with one key', async ({ page, sandbox }) => {
    const state = mockBoards(sandbox)
    state.onCreate = () => state.create.length === 1 ? failure(503, 'service_unavailable') : null
    await page.goto('/tier-lists')
    await expect(page.getByRole('heading', { name: 'Tier Lists', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open After Hours' })).toBeVisible()
    await button(page, 'Load more tier lists').click()
    await expect(page.getByRole('link', { name: 'Open Weekend picks' })).toBeVisible()
    expect(state.cursors).toEqual([null, boardId])
    if (page.viewportSize().width > 1000) await capture(page, test.info(), '1440-light-overview', null, true)
    await page.getByRole('link', { name: 'Create Tier List' }).click()
    await page.getByLabel('Title', { exact: true }).fill('A new fictional board')
    await page.getByLabel('Description', { exact: false }).fill('An isolated review fixture.')
    await page.getByLabel('Games', { exact: true }).uncheck()
    await button(page, 'Create Tier List').click()
    await expect(page.locator('.tier-integration').getByRole('alert')).toContainText('Creation could not be confirmed')
    await expect(page.getByLabel('Title', { exact: true })).toBeDisabled()
    await button(page, 'Retry creation').click()
    await expect(page.getByRole('heading', { name: 'A new fictional board' })).toBeVisible()
    await expect(page.locator('.tier-lane h2')).toHaveText(['S', 'A', 'B', 'C', 'D', 'Unranked'])
    expect(state.create).toHaveLength(2)
    expect(state.create[0]).toEqual(state.create[1])
    expect(state.create[0].key).toMatch(/^[A-Za-z0-9_-]+$/)
    await button(page, 'Edit details').click()
    await button(page, 'Delete tier list').click()
    await dialog(page).getByRole('button', { name: 'Delete tier list', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Tier Lists', exact: true })).toBeVisible()
    expect(state.deletes).toEqual([{ revision: 1 }])
  })

  test('Library selection is local, Discover is explicit, Move restores focus, and Save reconciles', async ({ page, sandbox }) => {
    const state = mockBoards(sandbox)
    state.onSave = (_old, next) => { state.boards.set(boardId, next); return failure(503, 'service_unavailable') }
    await page.goto('/tier-lists/' + boardId)
    await expect(page.getByRole('heading', { name: 'After Hours' })).toBeVisible()
    await picker(page)
    await page.getByLabel('Search your Library').fill('Lantern')
    await dialog(page).getByRole('combobox', { name: 'Media type', exact: true }).selectOption('book')
    await button(page, 'Add The Lantern Atlas').click()
    await expect(button(page, 'The Lantern Atlas is in this Tier List')).toBeDisabled()
    expect(state.prepare).toEqual([])
    if (page.viewportSize().width === 390) await capture(page, test.info(), '390-light-picker', dialog(page), true)
    await page.getByRole('tab', { name: 'My Library' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Discover' })).toBeFocused()
    await page.getByLabel('Media category').selectOption('movie')
    await page.getByLabel('Search Discover').fill('Lantern')
    await button(page, 'Search').click()
    const choice = button(page, 'Add The Lantern Atlas to Unranked')
    await expect(choice).toBeVisible()
    expect(state.prepare).toEqual([])
    await choice.click()
    await expect(dialog(page).getByRole('status').last()).toContainText('added to Unranked')
    expect(state.prepare).toEqual([{ source: 'tmdb', mediaType: 'movie', sourceId: state.records.movie[0].sourceId }])
    expect(state.saves).toEqual([])
    await page.keyboard.press('Escape')
    await expect(page.locator('.tier-editor-controls').getByRole('button', { name: 'Add media' })).toBeFocused()
    const move = lane(page, 'Unranked').getByRole('button', { name: 'Move or remove The Lantern Atlas' }).first()
    await move.focus()
    await page.keyboard.press('Enter')
    await page.getByLabel('Destination tier').selectOption('a')
    await button(page, 'Move item').click()
    await expect(lane(page, 'A').getByRole('button', { name: 'Move or remove The Lantern Atlas' })).toBeFocused()
    await page.getByRole('link', { name: /Back to Tier Lists/ }).click()
    await expect(dialog(page)).toHaveAccessibleName('Leave with unsaved changes?')
    await button(page, 'Keep editing').click()
    await expect(lane(page, 'A')).toContainText('The Lantern Atlas')
    await button(page, 'Save').click()
    await expect(page.locator('.tier-save-row')).toContainText('Save confirmed')
    expect(state.saves).toHaveLength(1)
    expect(state.saves[0].revision).toBe(1)
    expect(sandbox.apiCalls).not.toContain('POST /api/v1/library')
  })

  test('revision conflict preserves the draft until explicit reload', async ({ page, sandbox }) => {
    const state = mockBoards(sandbox)
    state.onSave = old => {
      state.boards.set(boardId, { ...old, title: 'A newer version', revision: 2 })
      return failure(409, 'revision_conflict')
    }
    await page.goto('/tier-lists/' + boardId)
    await button(page, 'Edit details').click()
    await page.getByLabel('Title', { exact: true }).fill('My draft title')
    await button(page, 'Save').click()
    await expect(page.locator('.tier-integration').getByRole('alert')).toContainText('Your draft is still here')
    await expect(button(page, 'Retry Save')).toBeDisabled()
    await button(page, 'Compare versions').click()
    await expect(dialog(page)).toContainText('My draft title')
    await expect(dialog(page)).toContainText('A newer version')
    await button(page, 'Keep draft').click()
    await expect(page.getByRole('heading', { name: 'My draft title' })).toBeVisible()
    await button(page, 'Compare versions').click()
    await button(page, 'Discard draft and reload').click()
    await expect(page.getByRole('heading', { name: 'A newer version' })).toBeVisible()
    expect(state.saves).toHaveLength(1)
  })

  test('Open Library requires a renewed exact Edition and never retries a preparation automatically', async ({ page, sandbox }) => {
    const state = mockBoards(sandbox)
    pilotCatalogue(sandbox)
    state.onPrepare = body => {
      if (state.prepare.length === 1) return failure(409, 'edition_unavailable')
      if (state.prepare.length === 2) return failure(429, 'rate_limited', { 'Retry-After': '1' })
      return ok({ ...body, title: 'The Lantern Atlas', artworkImage: null })
    }
    await page.goto('/tests/ui/tier-lists.html?board=' + boardId)
    await picker(page)
    await page.getByRole('tab', { name: 'Discover' }).click()
    await page.getByLabel('Media category').selectOption('book')
    await expect(page.getByLabel('Book provider')).toHaveValue('open-library')
    await page.getByLabel('Search Discover').fill('Lantern')
    await button(page, 'Search').click()
    const exact = button(page, 'Add The Lantern Atlas to Unranked')
    await expect(exact).toBeVisible()
    await exact.click()
    await expect(dialog(page).getByRole('alert')).toContainText('Edition could not be verified')
    await expect(exact).toHaveCount(0)
    await dialog(page).getByRole('button', { name: 'Search again' }).click()
    await expect(exact).toBeVisible()
    expect(sandbox.pilotRequests).toBe(2)
    expect(state.prepare).toHaveLength(1)
    await exact.click()
    await expect(dialog(page).getByRole('alert')).toContainText('Too many requests')
    await expect(exact).toBeEnabled()
    expect(state.prepare).toHaveLength(2)
    await exact.click()
    await expect(button(page, 'The Lantern Atlas is in this Tier List')).toBeDisabled()
    expect(state.prepare).toEqual(Array(3).fill({ source: 'open-library', mediaType: 'book', sourceId: 'OL202M' }))
    expect(state.saves).toEqual([])
  })

  test('session expiry during a write clears the private board and draft', async ({ page, sandbox }) => {
    const state = mockBoards(sandbox)
    state.onSave = () => failure(401, 'unauthenticated')
    await page.goto('/tier-lists/' + boardId)
    await button(page, 'Edit details').click()
    await page.getByLabel('Title', { exact: true }).fill('Private unsaved name')
    await button(page, 'Save').click()
    await expect(page.getByText('Log in to open your tier lists.')).toBeVisible()
    await expect(page.getByText('Private unsaved name')).toHaveCount(0)
    await expect(page.locator('.tier-board')).toHaveCount(0)
  })

  test('closing an in-flight picker rejects the late prepared response', async ({ page, sandbox }) => {
    const state = mockBoards(sandbox)
    let release
    state.onPrepare = body => new Promise(resolve => { release = () => resolve(ok({ ...body, title: 'Late pick', artworkImage: null })) })
    await page.goto('/tier-lists/' + boardId)
    await picker(page)
    await page.getByRole('tab', { name: 'Discover' }).click()
    await page.getByLabel('Search Discover').fill('Lantern')
    await button(page, 'Search').click()
    await button(page, 'Add The Lantern Atlas to Unranked').click()
    await expect.poll(() => state.prepare.length).toBe(1)
    await button(page, 'Done').click()
    const result = page.waitForResponse(response => response.url().endsWith('/media/prepare'))
    release()
    await result
    await expect(lane(page, 'Unranked')).not.toContainText('Late pick')
    expect(state.saves).toEqual([])
  })

  test('desktop drag and tier edits preserve ordering through Save', async ({ page, sandbox }, info) => {
    test.skip(info.project.name === 'mobile', 'Desktop drag interaction')
    const state = mockBoards(sandbox)
    const title = state.records.game[1].title
    await page.goto('/tier-lists/' + boardId)
    const move = lane(page, 'S').getByRole('article', { name: title, exact: true })
      .filter({ has: page.locator('.tier-media-type[data-type="game"]') })
      .getByRole('button', { name: 'Move or remove ' + title, exact: true })
    await move.locator('.tier-item-grip').hover()
    await page.mouse.down()
    const target = await lane(page, 'A').locator('.tier-lane-empty').boundingBox()
    await page.mouse.move(target.x + 20, target.y + 15, { steps: 12 })
    await page.mouse.move(target.x + 22, target.y + 17)
    await page.mouse.up()
    await expect(lane(page, 'A').getByRole('article', { name: title })).toBeVisible()
    await button(page, 'Configure tiers').click()
    await page.locator('#name-a').fill('Favorites')
    await dialog(page).locator('#color-a').selectOption('Violet')
    await button(page, 'Move tier Favorites up').click()
    await expect(page.locator('#name-a')).toBeFocused()
    await button(page, 'Remove tier S').click()
    await button(page, 'Remove and move items').click()
    await button(page, 'Done').click()
    await expect(lane(page, 'Unranked').locator('h3')).toHaveText([
      state.records.book[1].title, state.records.book[4].title, state.records.movie[1].title,
    ])
    await button(page, 'Save').click()
    await expect(page.locator('.tier-save-row')).toContainText('All changes saved')
    expect(state.saves[0].tiers[0]).toEqual({ key: 'a', name: 'Favorites', color: 'Violet', items: [identity(state.records.game[1])] })
    expect(state.saves[0].removedItems).toBeUndefined()
  })

  for (const width of [1440, 768, 390, 320]) {
    test('responsive review at ' + width + 'px', async ({ page, sandbox }, info) => {
      const mobile = width < 500
      test.skip(info.project.name !== (mobile ? 'mobile' : 'desktop'), 'Viewport belongs to the other project.')
      await page.setViewportSize({ width, height: width === 320 ? 740 : mobile ? 844 : width === 768 ? 1024 : 900 })
      const state = mockBoards(sandbox)
      await page.goto('/tier-lists/' + boardId)
      await expect(page.getByRole('heading', { name: 'After Hours' })).toBeVisible()
      await checkLayout(page)
      if (mobile) {
        await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link')).toHaveText(['Home', 'Discover', 'Library', 'Lists', 'Tier Lists'])
        await expect(page.getByLabel('Account menu')).toBeVisible()
      }
      const prefix = String(width)
      await capture(page, info, prefix + '-light-editor', null, true)
      await theme(page, 'dark')
      await capture(page, info, prefix + '-dark-editor', null, true)
      const title = state.records.book[4].title
      const move = button(page, 'Move or remove ' + title)
      await move.click()
      await expect(dialog(page)).toContainText(title)
      const box = await dialog(page).boundingBox()
      expect(box.width).toBeLessThanOrEqual(width)
      if (width === 320) await capture(page, info, '320-dark-move', dialog(page), true)
      await page.keyboard.press('Escape')
      await expect(move).toBeFocused()
    })
  }
})
