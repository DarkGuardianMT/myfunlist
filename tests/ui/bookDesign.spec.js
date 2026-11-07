import { writeFileSync, mkdirSync } from 'node:fs'
import { test, expect, checkLayout, capture, openLibraryWork, openLibraryResult } from './fixtures.js'

const titles = ['The Lantern Atlas', 'Small Hours', 'The Shape of Tomorrow', 'Field Notes from Elsewhere', 'The Art of Looking', 'A Very Long Fictional Title About All the Places We Have Yet to Discover']
const authors = ['Rowan Ellis', 'Mira North', 'Alex Rivers', 'Jules Arden', 'Robin Vale', 'The Imaginary Research Collective and Example Contributors']
const palettes = [['#203d43', '#efce8b'], ['#c76a4d', '#fff0cf'], ['#d8cda9', '#34483d'], ['#35394f', '#dfb9a8'], ['#ded7c7', '#355c63']]

function jacket(title, index) {
  const [paper, ink] = palettes[index]
  const words = title.split(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="${paper}"/><path d="M10 0v450" stroke="${ink}" opacity=".25" stroke-width="3"/><circle cx="150" cy="245" r="74" fill="none" stroke="${ink}" stroke-width="2"/><path d="M60 310 150 170 240 310Z" fill="${ink}" opacity=".7"/><path d="M50 335h200" stroke="${ink}"/><text x="26" y="38" fill="${ink}" font-family="sans-serif" font-size="10" letter-spacing="3">FICTIONAL QA EDITION</text>${words.map((word, i) => `<text x="26" y="${83 + i * 31}" fill="${ink}" font-family="Georgia,serif" font-size="28">${word}</text>`).join('')}<text x="26" y="412" fill="${ink}" font-family="sans-serif" font-size="14">${authors[index]}</text></svg>`
}

async function books(page, sandbox) {
  sandbox.openLibraryHarness = true
  // Rasterfixtures geven de fictieve omslagen een vast, provideronafhankelijk beeldformaat.
  const covers = await page.evaluate(async sources => Promise.all(sources.map(async source => {
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 450
    canvas.getContext('2d').drawImage(image, 0, 0)
    return canvas.toDataURL('image/png').split(',')[1]
  })), titles.slice(0, 5).map(jacket))
  const works = titles.map((title, i) => {
    const url = `https://covers.openlibrary.org/b/id/${100 + i}-M.jpg?default=false`
    if (i < 5) sandbox.artwork[url] = { contentType: 'image/png', body: Buffer.from(covers[i], 'base64') }
    return { ...openLibraryWork, workId: `OL${101 + i}W`, workTitle: title, authors: [authors[i]],
      firstPublicationYear: i === 5 ? null : 2020 + i, editionCount: i + 1,
      cover: i < 5 ? { id: 100 + i, url } : null,
      selectedEdition: i === 5 ? null : { ...openLibraryWork.selectedEdition, editionId: `OL${202 + i}M`, title,
        languages: i === 2 ? ['eng'] : ['dut'], languageStatus: i === 2 ? 'unverified' : 'match' } }
  })
  sandbox.pilotRespond = async () => ({ json: { data: openLibraryResult(works) } })
  sandbox.googleItems = works.map((work, i) => ({ id: `qa-design-${i}`, volumeInfo: {
    title: work.workTitle, authors: work.authors, language: i === 2 ? 'en' : 'nl',
    ...(work.firstPublicationYear ? { publishedDate: String(work.firstPublicationYear) } : {}),
    ...(work.cover ? { imageLinks: { thumbnail: work.cover.url } } : {}),
  } }))
}

async function shot(page, testInfo, name, focus) {
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode() })))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  if (testInfo.project.name === 'mobile' && focus) {
    await focus.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 24))
  }
  await capture(page, testInfo, name, focus)
}

for (const mode of ['light', 'dark']) {
  test(`Books design: ${mode} catalogues, disclosures and responsive cover layout`, async ({ page, sandbox }, testInfo) => {
    await books(page, sandbox)
    const baseline = process.env.QA_DESIGN_BASELINE === 'true'
    test.skip(baseline && mode === 'dark', 'The original baseline captures light mode only.')
    await page.addInitScript(value => localStorage.setItem('myfunlist_theme', value), mode)
    const prefix = baseline ? 'before-' : 'books-'
    await page.goto('/tests/ui/open-library.html?q=lantern')
    expect(await page.locator('html').getAttribute('data-theme') || 'light').toBe(mode)
    await expect(page.locator('#book-provider')).toHaveValue('google-books')
    await expect(page.locator('.book-card')).toHaveCount(6)
    expect(sandbox.pilotRequests).toBe(0)
    const measurements = {}
    for (const provider of ['google-books', 'open-library']) {
      await page.locator('#book-provider').selectOption(provider)
      const cards = page.locator(provider === 'google-books' ? '.book-card' : '.open-library-work')
      await expect(cards).toHaveCount(6)
      measurements[provider] = await cards.first().evaluate(element => {
        const { width, height } = element.getBoundingClientRect()
        const cover = element.querySelector('img').getBoundingClientRect()
        return { width: Math.round(width), height: Math.round(height), coverWidth: Math.round(cover.width), coverHeight: Math.round(cover.height) }
      })
      if (!baseline) {
        expect(measurements[provider].coverWidth).toBeGreaterThanOrEqual(testInfo.project.name === 'mobile' ? 96 : 120)
        // Beide catalogi gebruiken nu echte omslagkaarten in plaats van kleine horizontale rijen.
        expect(measurements[provider].coverHeight).toBeGreaterThan(measurements[provider].coverWidth)
        expect(measurements[provider].coverWidth / measurements[provider].width).toBeGreaterThan(0.9)
      }
      await checkLayout(page)
      await shot(page, testInfo, `${prefix}${provider}-${mode}`, cards.first())
      if (!baseline && testInfo.project.name === 'mobile' && provider === 'google-books') {
        await page.evaluate(() => window.scrollTo(0, 0))
        await capture(page, testInfo, `books-search-${mode}`)
      }
      if (!baseline && provider === 'open-library') {
        const disclosure = cards.first().locator('summary')
        await disclosure.focus()
        await page.keyboard.press('Enter')
        await expect(cards.first().getByText('Edition: OL202M', { exact: true })).toBeVisible()
        await shot(page, testInfo, `books-edition-details-${mode}`, disclosure)
        await disclosure.press('Enter')
      }
    }
    if (!baseline) {
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 900 })
        for (const provider of ['google-books', 'open-library']) {
          await page.locator('#book-provider').selectOption(provider)
          const cards = page.locator(provider === 'google-books' ? '.book-card' : '.open-library-work')
          await expect(cards).toHaveCount(6)
          await checkLayout(page)
          await cards.first().locator('summary').click()
          await checkLayout(page)
          await cards.first().locator('summary').click()
        }
      }
    }
    mkdirSync('test-results', { recursive: true })
    writeFileSync(`test-results/${prefix}book-design-${testInfo.project.name}.json`, JSON.stringify(measurements, null, 2))
  })
}
