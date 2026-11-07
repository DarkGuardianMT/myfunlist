import { test, expect, checkLayout, capture } from './fixtures.js'
import { fullApp, pilotCatalogue } from './fullAppFixture.js'

const baseline = process.env.QA_COMPLETE_BASELINE === 'true'
async function shot(page, info, name) {
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>{ image.loading='eager'; return image.decode().catch(()=>{}) })))
  await checkLayout(page)
  await capture(page,info,`${baseline?'before':'after'}-complete-${name}`)
  if (!baseline && info.project.name === 'mobile') {
    const content = page.locator('.library-grid > article, .discovery-search article, .home-shelf-card, .media-detail-hero__synopsis, .profile-card form').first()
    if (await content.count()) await capture(page, info, `after-complete-${name}-content`, content)
  }
}
for(const theme of ['dark','light']) test(`Complete visual review ${theme}: every major screen`,async({page,sandbox},info)=>{
  test.skip(baseline && theme==='light','Baseline compares the current Cinematic dark composition.')
  test.setTimeout(90000)
  const {state,records}=fullApp(sandbox)
  await page.addInitScript(value=>localStorage.setItem('myfunlist_theme',value),theme)
  await page.goto('/')
  await expect(page.locator('.home-shelf-card')).toHaveCount(6)
  await shot(page,info,`home-account-${theme}`)
  for(const type of ['book','movie','tv','game']) {
    await page.goto(`/discover?type=${type}&q=lantern`)
    await expect(page.locator('.discovery-search article')).toHaveCount(6)
    await shot(page,info,`discover-${type}-${theme}`)
  }
  await page.goto('/library')
  await expect(page.locator('.library-grid > article')).toHaveCount(12)
  await shot(page,info,`library-comfortable-${theme}`)
  if(!baseline) {
    await page.getByRole('button',{name:'Compact',exact:true}).click()
    await shot(page,info,`library-compact-${theme}`)
    await page.getByRole('button',{name:'List',exact:true}).click()
    await shot(page,info,`library-list-${theme}`)
    await page.getByRole('button',{name:'Comfortable',exact:true}).click()
  }
  await page.goto('/lists')
  await expect(page.locator('.list-summary-card')).toHaveCount(2)
  await shot(page,info,`lists-${theme}`)
  await page.locator('.list-summary-card').first().getByRole('link').first().click()
  await expect(page.getByRole('heading',{level:1,name:'For a rainy Sunday'})).toBeVisible()
  await shot(page,info,`list-detail-${theme}`)
  for(const type of ['book','movie','tv','game']) {
    const media=records[type][0]
    await page.goto(`/media/${type}/${media.source}/${media.sourceId}`)
    await expect(page.getByRole('heading',{level:1,name:media.title,exact:true})).toBeVisible()
    await shot(page,info,`detail-${type}-${theme}`)
  }
  await page.goto('/profile')
  await expect(page.getByLabel('Current password',{exact:true})).toBeVisible()
  await shot(page,info,`profile-${theme}`)
  state.authenticated=false
  for(const route of ['login','register']) {
    await page.goto(`/${route}`)
    await expect(page.getByLabel('Email',{exact:true})).toBeVisible()
    await shot(page,info,`${route}-${theme}`)
  }
  await page.goto('/')
  await expect(page.locator('.home-personal')).toHaveCount(0)
  await shot(page,info,`home-anonymous-${theme}`)
  if(info.project.name==='mobile') {
    await page.getByLabel('Account menu',{exact:true}).click()
    await shot(page,info,`mobile-menu-${theme}`)
  }
})

for(const theme of ['dark','light']) test(`Complete visual Open Library ${theme}`,async({page,sandbox},info)=>{
  test.skip(baseline && theme==='light')
  pilotCatalogue(sandbox)
  await page.addInitScript(value=>localStorage.setItem('myfunlist_theme',value),theme)
  await page.goto('/tests/ui/open-library.html?provider=open-library&q=lantern')
  await expect(page.locator('.open-library-work')).toHaveCount(6)
  await shot(page,info,`discover-open-library-${theme}`)
})
