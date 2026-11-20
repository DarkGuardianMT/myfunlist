import { test, expect } from './fixtures.js'

const entry = '/prototypes/tier-lists/'
const longTitle = 'The Cartographer’s Guide to Rivers That Remember the Sea'
const navLabels = ['Home', 'Discover', 'Library', 'Lists', 'Tier Lists']
const editor = page => page.getByRole('link', { name: 'Open After Hours' }).click()
const lane = (page, name) => page.getByRole('region', { name, exact: true })
const action = (page, name) => page.getByRole('button', { name, exact: true })
const dialog = page => page.getByRole('dialog')
const openPicker = page => page.locator('.tier-editor-controls').getByRole('button', { name: 'Add media' }).click()

async function chooseBookSearch(page) {
  await page.getByRole('tab', { name: 'Discover' }).click()
  await page.getByLabel('Media category').selectOption('book')
  await page.getByLabel('Search sample titles').fill('Lantern')
  await action(page, 'Search').click()
}

function noTraffic(sandbox) {
  expect(sandbox.authChecks).toBe(0)
  expect(sandbox.googleRequests).toBe(0)
  expect(sandbox.pilotRequests).toBe(0)
  expect(sandbox.apiCalls).toEqual([])
}

test('tier prototype creates a restricted board and protects dirty navigation', async ({ page, sandbox }) => {
  await page.goto(entry)
  const state = page.getByLabel('Preview overview state')
  await state.selectOption('loading')
  await expect(page.getByRole('status')).toContainText('Loading tier lists')
  await state.selectOption('error')
  await expect(page.getByRole('alert')).toContainText('couldn’t load')
  await action(page, 'Retry').click()
  await state.selectOption('empty')
  await expect(page.getByRole('heading', { name: 'No tier lists yet' })).toBeVisible()
  await page.getByRole('link', { name: 'Create Tier List' }).first().click()
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(4)
  await page.getByLabel('Title', { exact: true }).fill('Weekend fiction')
  await page.getByLabel('Description', { exact: false }).fill('For rainy evenings')
  for (const label of ['Movies', 'TV Shows', 'Games']) await page.getByLabel(label, { exact: true }).uncheck()
  await expect(page.getByLabel('Books', { exact: true })).toBeDisabled()
  await action(page, 'Create Tier List').click()
  await expect(page.getByRole('heading', { name: 'Weekend fiction' })).toBeVisible()
  await expect(page.locator('.tier-lane h2')).toHaveText(['S', 'A', 'B', 'C', 'D', 'Unranked'])
  await expect(lane(page, 'Unranked')).toContainText('New media appears here')
  await openPicker(page)
  await expect(page.getByLabel('Media type').locator('option')).toHaveText(['All types', 'Books'])
  await page.getByLabel('Search your Library').fill('Cartographer')
  await action(page, `Add ${longTitle}`).click()
  await expect(action(page, `${longTitle} is in this Tier List`)).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.locator('.tier-editor-controls').getByRole('button', { name: 'Add media' })).toBeFocused()
  await expect(lane(page, 'Unranked')).toContainText(longTitle)
  await page.getByRole('link', { name: 'Back to Tier Lists' }).click()
  await expect(dialog(page)).toHaveAccessibleName('Leave with unsaved changes?')
  await action(page, 'Keep editing').click()
  await expect(lane(page, 'Unranked')).toContainText(longTitle)
  await page.getByRole('link', { name: 'Back to Tier Lists' }).click()
  await action(page, 'Discard and leave').click()
  await page.getByRole('link', { name: 'Open Weekend fiction' }).click()
  await expect(lane(page, 'Unranked')).toContainText('0 items')
  noTraffic(sandbox)
})

test('tier prototype configures, moves, removes and retries a failed save', async ({ page, sandbox }) => {
  await page.goto(entry)
  await editor(page)
  await action(page, 'Configure tiers').click()
  await page.locator('#name-s').fill('Favorites')
  await dialog(page).getByLabel('Color', { exact: true }).first().selectOption('Violet')
  await action(page, 'Move tier Favorites down').click()
  await expect(page.locator('#name-s')).toBeFocused()
  await action(page, 'Add tier').click()
  await expect(page.locator('#name-new-tier-1')).toBeFocused()
  await page.locator('#name-new-tier-1').fill('Worth a revisit')
  await action(page, 'Remove tier Favorites').click()
  await expect(dialog(page).getByText('Its 3 items', { exact: false })).toBeVisible()
  await expect(action(page, 'Keep tier')).toBeFocused()
  await action(page, 'Remove and move items').click()
  await action(page, 'Done').click()
  await expect(lane(page, 'Unranked').locator('h3')).toHaveText([
    'Glass Harbor', longTitle, 'Ghostlight Grove', 'The Quiet Signal', 'Field Notes from the Far Green', 'Lantern Coast',
  ])
  await action(page, 'Move or remove The Quiet Signal').focus()
  await page.keyboard.press('Enter')
  await expect(action(page, 'Close dialog')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Destination tier')).toBeFocused()
  expect(await page.getByLabel('Destination tier').evaluate(element => getComputedStyle(element).outlineWidth)).toBe('2px')
  await page.getByLabel('Destination tier').selectOption('a')
  await page.getByLabel('Placement').selectOption({ label: 'First' })
  await action(page, 'Move item').click()
  await expect(lane(page, 'A').locator('h3').first()).toHaveText('The Quiet Signal')
  await expect(lane(page, 'A').getByRole('button', { name: 'Move or remove The Quiet Signal' })).toBeFocused()
  await action(page, 'Move or remove The Quiet Signal').click()
  await page.getByLabel('Placement').selectOption({ label: 'Last' })
  await action(page, 'Move item').click()
  await expect(lane(page, 'A').locator('h3').last()).toHaveText('The Quiet Signal')
  await action(page, 'Move or remove The Quiet Signal').click()
  await page.getByLabel('Destination tier').selectOption('unranked')
  await action(page, 'Move item').click()
  await expect(lane(page, 'Unranked').locator('h3').last()).toHaveText('The Quiet Signal')
  await action(page, 'Move or remove The Quiet Signal').click()
  await action(page, 'Remove from board').click()
  await expect(page.getByRole('article', { name: 'The Quiet Signal' })).toHaveCount(0)
  await action(page, 'Edit details').click()
  await page.getByLabel('Title', { exact: true }).fill('Late Nights')
  await page.getByLabel('Description', { exact: true }).fill('Updated for the evening.')
  await page.getByLabel('Simulate the next save failing').check()
  await action(page, 'Save').click()
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Saving…' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Your changes are still here')
  await action(page, 'Retry save').click()
  await expect(page.getByText('All changes saved')).toBeVisible()
  await page.getByRole('link', { name: 'Back to Tier Lists' }).click()
  await page.getByRole('link', { name: 'Open Late Nights' }).click()
  await expect(page.getByRole('heading', { name: 'Worth a revisit' })).toBeVisible()
  await expect(page.getByText('Updated for the evening.', { exact: true })).toBeVisible()
  noTraffic(sandbox)
})

test('tier prototype adds the exact sample Edition with keyboard tab navigation and keeps My Library separate', async ({ page, sandbox }) => {
  await page.goto(entry)
  await editor(page)
  await openPicker(page)
  const libraryTab = page.getByRole('tab', { name: 'My Library' })
  await libraryTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Discover' })).toBeFocused()
  await chooseBookSearch(page)
  await expect(dialog(page).getByText('Exact Edition OL920004M')).toBeVisible()
  await expect(action(page, 'Add Lanterns of the Inland Sea')).toHaveCount(0)
  await action(page, 'Search again').click()
  await expect(action(page, 'Add Lanterns of the Inland Sea')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(action(page, 'Lanterns of the Inland Sea is in this Tier List')).toBeDisabled()
  await libraryTab.click()
  await page.getByLabel('Search your Library').fill('Lanterns of the Inland Sea')
  await expect(dialog(page).getByText('No Library items match')).toBeVisible()
  await action(page, 'Done').click()
  await expect(lane(page, 'Unranked')).toContainText('Lanterns of the Inland Sea')
  noTraffic(sandbox)
})

test('tier prototype handles desktop drag and drop using the same draft', async ({ page, sandbox }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Desktop pointer interaction')
  await page.goto(entry)
  await editor(page)
  const source = action(page, 'Move or remove The Quiet Signal')
  const target = lane(page, 'A').getByRole('article', { name: 'Salt Meridian' })
  await source.hover()
  await page.mouse.down()
  const bounds = await target.boundingBox()
  await page.mouse.move(bounds.x + 20, bounds.y + 20, { steps: 12 })
  await page.mouse.move(bounds.x + 22, bounds.y + 22)
  await page.mouse.up()
  await expect(lane(page, 'S').locator('h3')).toHaveText(['Field Notes from the Far Green', 'Lantern Coast'])
  await expect(lane(page, 'A').getByRole('article', { name: 'The Quiet Signal' })).toBeVisible()
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
  noTraffic(sandbox)
})

const dimensions = {
  desktop: [[1440, 900], [768, 1024]],
  mobile: [[390, 844], [320, 740]],
}

async function checkViewport(page) {
  const geometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    undersized: [...document.querySelectorAll('.tier-preview :is(.tl-button, .tier-back, select, input:not([type="checkbox"])), .tier-dialog :is(button, select, input), .tier-shell :is(a, button, summary), .mobile-nav a')]
      .filter(element => element.getClientRects().length && !element.closest('dialog:not([open])'))
      .filter(element => element.getBoundingClientRect().height < 44)
      .map(element => element.textContent.trim()),
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.undersized).toEqual([])
}

async function capture(page, testInfo, name) {
  await checkViewport(page)
  await page.evaluate(async () => {
    await document.fonts.ready
    const images = [...document.querySelectorAll('img')].filter(image => {
      const bounds = image.getBoundingClientRect()
      return bounds.width && bounds.bottom > 0 && bounds.top < window.innerHeight
    })
    await Promise.all(images.map(image => image.decode()))
  })
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' })
}

for (const project of Object.keys(dimensions)) {
  for (const [width, height] of dimensions[project]) {
    for (const theme of ['light', 'dark']) {
      test(`tier prototype visual review ${width}×${height} ${theme}`, async ({ page, sandbox }, testInfo) => {
        test.skip(testInfo.project.name !== project, 'Matching viewport and input project only')
        test.setTimeout(90000)
        await page.setViewportSize({ width, height })
        await page.goto(entry)
        if (theme === 'light') await action(page, 'Switch to light mode').click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        const links = page.getByRole('navigation', { name: width <= 640 ? 'Mobile navigation' : 'Main navigation' }).getByRole('link')
        await expect(links).toHaveText(width <= 640 ? navLabels : [...navLabels, 'Profile'])
        await page.getByLabel('Account menu', { exact: true }).click()
        await expect(page.getByRole('link', { name: 'Account settings' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByLabel('Account menu', { exact: true })).toBeFocused()

        const shot = name => capture(page, testInfo, `${project}-${width}-${theme}-${name}`)
        await shot('overview')
        await page.getByRole('link', { name: 'Create Tier List' }).click()
        if (width === 320) {
          const submit = action(page, 'Create Tier List')
          await submit.evaluate(button => button.scrollIntoView({ block: 'center' }))
          const button = await submit.boundingBox()
          const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
          expect(button.y + button.height).toBeLessThanOrEqual(nav.y)
        }
        await shot('create')
        await page.getByRole('link', { name: 'Back to Tier Lists' }).click()
        await editor(page)
        await expect(page.getByRole('heading', { name: 'After Hours' })).toBeFocused()
        const artwork = lane(page, 'S').getByRole('article', { name: 'Lantern Coast' })
        await expect(artwork.locator('.media-artwork')).toHaveCSS('aspect-ratio', '2 / 3')
        await expect(artwork.getByRole('img')).toHaveCSS('object-fit', 'contain')
        if (width >= 768) {
          const add = await page.locator('.tier-editor-controls').getByRole('button', { name: 'Add media' }).boundingBox()
          const jump = await page.getByLabel('Jump to tier').boundingBox()
          expect(Math.abs(add.y - jump.y)).toBeLessThanOrEqual(1)
        }
        await shot('editor')
        await action(page, 'Configure tiers').click()
        await shot('configure')
        await action(page, 'Done').click()
        await openPicker(page)
        await shot('library')
        await chooseBookSearch(page)
        if (width <= 390) await action(page, 'Search again').scrollIntoViewIfNeeded()
        await shot('discover')
        await action(page, 'Done').click()
        await page.getByLabel('Jump to tier').selectOption('unranked')
        await expect(page.getByRole('heading', { name: 'Unranked' })).toBeFocused()
        await expect(lane(page, 'Unranked').getByText('No cover', { exact: true })).toBeVisible()
        await expect(lane(page, 'Unranked').getByRole('heading', { name: longTitle })).toBeVisible()
        await shot('unranked')
        await action(page, `Move or remove ${longTitle}`).click()
        await page.getByLabel('Destination tier').selectOption('a')
        await page.getByLabel('Placement').selectOption({ label: 'First' })
        await shot('move')
        await page.keyboard.press('Escape')
        await page.getByRole('link', { name: 'Back to Tier Lists' }).click()
        await page.getByRole('link', { name: 'Open Centennial Marathon' }).click()
        await expect(page.locator('.tier-board .tier-media-card')).toHaveCount(100)
        await expect(lane(page, 'S').locator('.tier-media-card')).toHaveCount(82)
        await page.getByLabel('Jump to tier').selectOption('unranked')
        await checkViewport(page)
        const moveButton = lane(page, 'Unranked').getByRole('button', { name: /Move or remove/ }).last()
        await moveButton.scrollIntoViewIfNeeded()
        if (width <= 640) {
          const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
          const box = await moveButton.boundingBox()
          expect(box.y + box.height).toBeLessThanOrEqual(nav.y)
        }
        await moveButton.click()
        await expect(dialog(page)).toHaveAccessibleName('Move item')
        noTraffic(sandbox)
      })
    }
  }
}
