import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { nodes as fixtureNodes } from '../dev/fixtures'
const shots = 'docs/screenshots'
const skinIds = ['gold', 'silver', 'bronze', 'weekly-black', 'pioneer', 'legend'] as const
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:9911/__test/reset')
  await mkdir(shots, { recursive: true })
})

// Ten simulated nodes (the five dev fixtures plus five renamed copies) so a desktop row can fill up.
// Test-only data served through Playwright routes; it never reaches the theme package.
const extra = [
  ['KR-Seoul', 'KR', '亚洲节点', '首尔 · 测试副本'],
  ['GB-London', 'GB', '欧洲节点', '伦敦 · 测试副本'],
  ['AU-Sydney', 'AU', '亚洲节点', '悉尼 · 测试副本'],
  ['BR-Sao Paulo', 'BR', '美洲节点', '圣保罗 · 测试副本'],
  ['CA-Toronto', 'CA', '美洲节点', '多伦多 · 测试副本'],
] as const
function squad() {
  const base = fixtureNodes()
  return [
    ...base,
    ...extra.map(([name, country, group, public_remark], i) => ({
      ...base[i]!,
      id: 106 + i,
      sort: 5 + i,
      name,
      country,
      group,
      public_remark,
    })),
  ]
}
async function serveSquad(page: Page) {
  const nodes = squad()
  await page.route('**/api/nodes', (route) => route.fulfill({ json: { nodes } }))
  await page.routeWebSocket('**/api/ws*', (socket) => {
    const send = () => socket.send(JSON.stringify({ nodes }))
    send()
    const timer = setInterval(send, 2000)
    socket.onClose(() => clearInterval(timer))
  })
}
/** Waits for the page-load animations to end: the card fade, the score roll and the bar fill move or hide
 *  what layout checks, screenshots and contrast checks look at. */
const cardsSettled = (page: Page) =>
  page.waitForFunction(
    () =>
      [...document.querySelectorAll('.live-card.card-intro')].every((c) =>
        c.classList.contains('card-ready'),
      ) &&
      !document.querySelector('.pc-roll') &&
      document
        .getAnimations()
        .every(
          (a) =>
            !['card-intro', 'strip-fill'].includes((a as CSSAnimation).animationName) ||
            a.playState === 'finished',
        ),
  )
/** Number of cards whose top edge matches the first card's. */
const firstRowCount = async (page: Page) => {
  await cardsSettled(page)
  return page.locator('.player-card').evaluateAll((cards) => {
    const top = cards[0]!.getBoundingClientRect().top
    return cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 1).length
  })
}
const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
/** The split panel's probe rows: the narrowest colour bar, and whether any two parts of a row overlap. */
const probeLayout = (page: Page) =>
  page.locator('.np-probe').evaluateAll((rows) => {
    const rects = rows.map((r) => [...r.children].map((c) => c.getBoundingClientRect()))
    const hit = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    return {
      narrowestBar: Math.min(
        ...rows.flatMap((r) => [...r.querySelectorAll('.np-segs')].map((s) => s.clientWidth)),
      ),
      overlap: rects.some((parts) => parts.some((a, i) => parts.slice(i + 1).some((b) => hit(a, b)))),
    }
  })
async function saveSettings(page: Page) {
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.locator('.save-feedback.success')).toContainText('已保存到 Hub')
}

test('dashboard renders all six skins and fits desktop, tablet, mobile and 320px', async ({
  page,
  browser,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await serveSquad(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  // Dev fixtures migrate to gold / weekly-black / legend. The overview shots use score-driven tiers, so the
  // manual gold on 101 goes back to the global auto skin first; weekly-black and legend are special skins.
  await page.goto('/settings')
  await page.getByRole('button', { name: '节点设置', exact: true }).click()
  await page.getByLabel('选择节点', { exact: true }).selectOption('101')
  await page.getByRole('button', { name: '继承全局卡面' }).click()
  await saveSettings(page)
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(10)
  // Opening the page fades the first cards in.
  await expect(page.locator('.live-card.card-intro')).toHaveCount(10)
  await expect(page.getByText('实时连接', { exact: true })).toBeVisible()
  await expect(page.locator('.card-grid')).toHaveAttribute('data-layout', 'comfortable')
  await page.keyboard.press('/')
  await expect(page.getByRole('searchbox', { name: '搜索服务器' })).toBeFocused()
  await page.getByRole('searchbox', { name: '搜索服务器' }).blur()
  expect(await firstRowCount(page)).toBe(7)
  // Today's traffic top five sits beside the expiry board on desktop, both under the tiles below 1200px.
  await expect(page.locator('.traffic-board li')).toHaveCount(5)
  const boardTops = () =>
    page
      .locator('.expiry-board, .traffic-board')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1080 : 900 })
    if (width <= 390) expect(await firstRowCount(page)).toBe(2)
    const [expiryTop, trafficTop] = await boardTops()
    if (width > 390) expect(trafficTop).toBe(expiryTop)
    else expect(trafficTop).toBeGreaterThan(expiryTop!)
    await page.screenshot({ path: `${shots}/dashboard-${width}.png`, fullPage: true })
    expect(await noHorizontalOverflow(page)).toBe(true)
  }
  // Assign the remaining skins through the settings UI so every skin has a close-up.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/settings')
  await page.getByRole('button', { name: '节点设置', exact: true }).click()
  for (const [id, skin] of [
    ['101', '金卡'],
    ['104', '开拓者'],
    ['105', '银卡'],
    ['106', '铜卡'],
  ] as const) {
    await page.getByLabel('选择节点', { exact: true }).selectOption(id)
    await page.getByRole('button', { name: `选择${skin}`, exact: true }).click()
  }
  await saveSettings(page)
  // Skin close-ups of the same 1440px grid at 2x device pixels, so text against each frame can be reviewed.
  const sharp = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  const closeUp = await sharp.newPage()
  closeUp.on('pageerror', (e) => errors.push(e.message))
  await serveSquad(closeUp)
  await closeUp.goto('http://127.0.0.1:4173/')
  await expect(closeUp.locator('.player-card')).toHaveCount(10)
  await cardsSettled(closeUp)
  for (const id of skinIds) {
    const card = closeUp.locator(`.player-card[data-skin="${id}"]`).first()
    await expect(card).toBeVisible()
    await card.screenshot({ path: `${shots}/skin-${id}.png` })
  }
  await sharp.close()
  expect(errors).toEqual([])
})
test('dashboard density follows saved layout and card size', async ({ page }) => {
  await serveSquad(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/settings')
  await page.getByRole('button', { name: '全局设置', exact: true }).click()
  await page.getByLabel('卡片布局', { exact: true }).selectOption('compact')
  await saveSettings(page)
  await page.goto('/')
  await expect(page.locator('.card-grid')).toHaveAttribute('data-layout', 'compact')
  await expect(page.locator('.player-card')).toHaveCount(10)
  expect(await firstRowCount(page)).toBe(8)
  expect(await noHorizontalOverflow(page)).toBe(true)
  await page.goto('/settings')
  await page.getByRole('button', { name: '全局设置', exact: true }).click()
  await page.getByLabel('卡片布局', { exact: true }).selectOption('comfortable')
  await page.getByLabel('卡片尺寸', { exact: true }).selectOption('large')
  await saveSettings(page)
  await page.goto('/')
  await expect(page.locator('.card-grid')).toHaveAttribute('data-size', 'large')
  await expect(page.locator('.player-card')).toHaveCount(10)
  expect(await firstRowCount(page)).toBe(6)
  expect(await noHorizontalOverflow(page)).toBe(true)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await firstRowCount(page)).toBe(2)
    expect(await noHorizontalOverflow(page)).toBe(true)
  }
})
test('split view puts a data panel beside each card and visitors can switch back', async ({ page }) => {
  await serveSquad(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/settings')
  await page.getByRole('button', { name: '全局设置', exact: true }).click()
  await page.getByLabel('首页形式', { exact: true }).selectOption('split')
  await saveSettings(page)
  await page.goto('/')
  await expect(page.locator('.card-grid')).toHaveAttribute('data-view', 'split')
  await expect(page.locator('.node-panel')).toHaveCount(10)
  await expect(page.locator('.card-live-strip')).toHaveCount(0)
  await expect(page.locator('.np-probe').first()).toBeVisible()
  expect(await firstRowCount(page)).toBe(3)
  // Narrow panels put each probe's figures above its two bars, so the bars never shrink to a few ticks.
  const wide = await probeLayout(page)
  expect(wide.overlap).toBe(false)
  expect(wide.narrowestBar).toBeGreaterThanOrEqual(80)
  await page.screenshot({ path: `${shots}/dashboard-split-1440.png`, fullPage: true })
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    if (width < 1024) expect(await firstRowCount(page)).toBe(1)
    expect(await noHorizontalOverflow(page)).toBe(true)
    const layout = await probeLayout(page)
    expect(layout.overlap, `${width}px`).toBe(false)
    expect(layout.narrowestBar, `${width}px`).toBeGreaterThanOrEqual(80)
  }
  await page.screenshot({ path: `${shots}/dashboard-split-320.png`, fullPage: true })
  // A visitor's own pick outlasts a reload; the site setting stays as saved.
  await page.getByRole('button', { name: '切换为上下形式' }).click()
  await expect(page.locator('.card-live-strip')).toHaveCount(10)
  await page.reload()
  await expect(page.locator('.card-grid')).toHaveAttribute('data-view', 'stacked')
  await expect(page.getByRole('button', { name: '切换为左右形式' })).toBeVisible()
  // Changing the setting in this browser drops its own pick, so the owner sees what they chose.
  await page.goto('/settings')
  await page.getByRole('button', { name: '全局设置', exact: true }).click()
  await page.getByLabel('首页形式', { exact: true }).selectOption('stacked')
  await page.getByLabel('首页形式', { exact: true }).selectOption('split')
  await saveSettings(page)
  await page.goto('/')
  await expect(page.locator('.card-grid')).toHaveAttribute('data-view', 'split')
})
test('search, groups and detail history work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/node/103')
  await expect(page.getByRole('heading', { level: 1, name: 'JP-Tokyo' })).toBeVisible()
  await page.keyboard.press('/')
  const search = page.getByRole('searchbox', { name: '搜索服务器' })
  await expect(search).toBeFocused()
  await search.fill('东京')
  await expect(page).toHaveURL(/\/node\/103$/)
  await search.press('Enter')
  await expect(page).toHaveURL(/\/\?q=/)
  await expect(page.locator('.player-card')).toHaveCount(1)
  await search.fill('')
  await expect(page.locator('.player-card')).toHaveCount(5)
  await page.getByRole('button', { name: '亚洲节点', exact: true }).click()
  await expect(page.locator('.player-card')).toHaveCount(3)
  await search.fill('东京')
  await expect(page.locator('.player-card')).toHaveCount(1)
  await page.getByRole('link', { name: /^查看 JP-Tokyo 详情，/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'JP-Tokyo' })).toBeVisible()
  await expect(page.locator('.chart-svg')).toHaveCount(5)
  await page.getByRole('navigation', { name: '详情分区' }).getByRole('link', { name: '评分明细' }).click()
  await expect(page.locator('#score')).toBeInViewport()
  await page.getByRole('button', { name: '7 天', exact: true }).click()
  await expect(page.locator('.charts-grid')).toHaveAttribute('aria-busy', 'false')
  // Full-page captures draw fixed/sticky elements at the scroll offset, so capture from the top.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${shots}/node-detail-1440.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${shots}/node-detail-390.png`, fullPage: true })
  expect(await noHorizontalOverflow(page)).toBe(true)
})
test('network quality page lists every node and fits desktop and phones', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '网络质量' }).click()
  await expect(page).toHaveURL(/\/network$/)
  await expect(page.getByRole('heading', { level: 1, name: '网络质量' })).toBeVisible()
  const total = Number(await page.locator('.group-tabs button small').first().textContent())
  await expect(page.locator('.network-row')).toHaveCount(total)
  await expect(page.locator('.network-summary .quality-bar i')).toHaveCount(24)
  await expect(page.locator('.network-row .quality-bar[data-state="loading"]')).toHaveCount(0)
  await page.screenshot({ path: `${shots}/network-1440.png`, fullPage: true })
  await page.getByRole('button', { name: '7 天', exact: true }).click()
  await expect(page).toHaveURL(/hours=168/)
  await expect(page.locator('.network-row')).toHaveCount(total)
  await page.locator('.network-row', { hasText: 'JP-Tokyo' }).click()
  await expect(page).toHaveURL(/\/node\/103#carriers$/)
  await expect(page.locator('#carriers')).toBeInViewport()
  // Between the phone layout and tablet width the header must not push the page sideways.
  for (const path of ['/', '/network', '/node/103']) {
    for (const width of [700, 660]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      await expect(page.locator('.site-header')).toBeVisible()
      expect(await noHorizontalOverflow(page), `${path} at ${width}px`).toBe(true)
    }
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.locator('header .network-link').click()
    await expect(page).toHaveURL(/\/network$/)
    await expect(page.locator('.network-row')).toHaveCount(total)
    expect(await noHorizontalOverflow(page)).toBe(true)
    if (width === 390) await page.screenshot({ path: `${shots}/network-390.png`, fullPage: true })
  }
  expect(errors).toEqual([])
})

/** `count` copies of the dev fixtures, renamed, with the first three offline and the fourth near full. */
function wall(count: number) {
  const base = fixtureNodes()
  return Array.from({ length: count }, (_, i) => {
    const n = base[i % base.length]!
    return {
      ...n,
      id: 1000 + i,
      sort: i,
      name: `${n.name} · ${i + 1}`,
      ...(i < 3
        ? { online: false, last_seen: Math.floor(Date.now() / 1000) - 5 * 3600, last_seen_ago: 5 * 3600 }
        : {}),
      ...(i === 3 && n.metrics ? { metrics: { ...n.metrics, cpu: 96 } } : {}),
    }
  })
}
async function serveWall(page: Page, count: number) {
  const nodes = wall(count)
  await page.route('**/api/nodes', (route) => route.fulfill({ json: { nodes } }))
  // The mock derives latency from the node id; copies borrow the history of the fixture they copy.
  await page.route(/\/api\/nodes\/\d+\/metrics/, async (route) => {
    const url = new URL(route.request().url()),
      id = Number(url.pathname.split('/')[3])
    url.pathname = `/api/nodes/${id >= 1000 ? 101 + ((id - 1000) % 5) : id}/metrics`
    await route.fulfill({ response: await route.fetch({ url: url.toString() }) })
  })
  await page.routeWebSocket('**/api/ws*', (socket) => {
    const send = () => socket.send(JSON.stringify({ nodes }))
    send()
    const timer = setInterval(send, 2000)
    socket.onClose(() => clearInterval(timer))
  })
}
const fitsScreen = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <= innerWidth &&
      document.documentElement.scrollHeight <= innerHeight,
  )
test('ops wall shows the fleet on a globe without the site header and tours what needs attention', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await serveWall(page, 30)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '运维模式' }).click()
  await expect(page).toHaveURL(/\/ops$/)
  await expect(page.locator('.site-header')).toHaveCount(0)
  // Three offline, one busy, the rest normal; every node is placed by its country.
  await expect(page.locator('.ops-counts [data-tone="ok"] dd')).toHaveText('26')
  await expect(page.locator('.ops-counts [data-tone="warn"] dd')).toHaveText('1')
  await expect(page.locator('.ops-counts [data-tone="off"] dd')).toHaveText('3')
  await expect(page.locator('.og-marker')).toHaveCount(5)
  await expect(page.locator('.ops-row')).toHaveCount(4)
  await expect(page.locator('.ops-row').first()).toContainText('离线')
  await expect(page.locator('.ops-card .oc-kicker')).toContainText('离线已持续')
  expect(await fitsScreen(page)).toBe(true)
  // Picking the first row holds the globe there; then long enough for it to turn and the card to slide in.
  await page.locator('.ops-row').first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${shots}/ops-1920.png` })
  // Picking a row turns the globe to that node.
  await page.locator('.ops-row', { hasText: 'CPU' }).click()
  await expect(page.locator('.ops-card .oc-tag')).toContainText('CPU')
  // A country marker with several nodes lists them; one of them opens its own card.
  await page.locator('.og-marker[data-focus]').click()
  await expect(page.locator('.oc-kicker')).toHaveText('该区域的服务器')
  await expect(page.locator('.oc-row')).toHaveCount(6)
  await page.locator('.oc-row').first().click()
  await expect(page.locator('.oc-metric')).toHaveCount(4)
  await page.setViewportSize({ width: 1366, height: 768 })
  expect(await fitsScreen(page)).toBe(true)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${shots}/ops-1366.png` })
  await page.getByRole('link', { name: '返回首页' }).click({ force: true })
  await expect(page.locator('.site-header')).toBeVisible()
  expect(errors).toEqual([])
})
test('ops wall globe turns when dragged and stops the tour', async ({ page }) => {
  await serveWall(page, 30)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/ops')
  await expect(page.locator('.ops-tour')).toHaveText('停止依次查看')
  await page.waitForTimeout(2000)
  const where = () =>
    page
      .locator('.og-marker')
      .first()
      .evaluate((el) => (el as HTMLElement).style.transform)
  const before = await where()
  const box = (await page.locator('.og-canvas').boundingBox())!
  // Grab the globe between the status column and the rail, then pull it sideways.
  const x = box.x + box.width * 0.55,
    y = box.y + box.height * 0.5
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 160, y + 40, { steps: 8 })
  await page.mouse.up()
  expect(await where()).not.toBe(before)
  await expect(page.locator('.ops-tour')).toContainText('依次查看')
  await expect(page.locator('.ops-tour')).not.toHaveText('停止依次查看')
  // Starting on the status figures turns the globe too, and selects no text on the way.
  const after = await where()
  const figures = (await page.locator('.ops-rates').boundingBox())!
  await page.mouse.move(figures.x + 20, figures.y + figures.height / 2)
  await page.mouse.down()
  await page.mouse.move(figures.x + 420, figures.y - 60, { steps: 8 })
  await page.mouse.up()
  expect(await where()).not.toBe(after)
  expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('')
  // The pointer stays a plain arrow over the globe.
  expect(await page.locator('.og-canvas').evaluate((el) => getComputedStyle(el).cursor)).not.toMatch(/grab/)
})
test('ops wall globe comes closer to a picked place and backs off when the card closes', async ({ page }) => {
  await serveWall(page, 30)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/ops')
  await expect(page.locator('.ops-card')).toBeVisible()
  await page.locator('.oc-close').click()
  await expect(page.locator('.ops-card')).toHaveCount(0)
  // Two markers' distance on screen grows with the globe's size.
  const spread = () =>
    page.evaluate(() => {
      const at = (code: string) => {
        const r = document.querySelector(`.og-marker[aria-label^="${code}"]`)!.getBoundingClientRect()
        return [r.left, r.top]
      }
      const [a, b] = [at('日本'), at('新加坡')]
      return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!)
    })
  await page.waitForTimeout(2500)
  const full = await spread()
  await page.locator('.og-marker[aria-label^="日本"]').click()
  await expect(page.locator('.ops-card')).toBeVisible()
  await page.waitForTimeout(2200)
  expect(await spread()).toBeGreaterThan(full * 1.4)
  // A plain click on the globe, away from markers and the card, closes the card and backs off too.
  const globe = (await page.locator('.og-canvas').boundingBox())!
  await page.mouse.click(globe.x + globe.width * 0.3, globe.y + globe.height * 0.82)
  await expect(page.locator('.ops-card')).toHaveCount(0)
  await page.waitForTimeout(2200)
  expect(await spread()).toBeLessThan(full * 1.15)
  // A drag is not a click: it leaves a shown card open.
  await page.locator('.og-marker[aria-label^="日本"]').click()
  await expect(page.locator('.ops-card')).toBeVisible()
  await page.mouse.move(globe.x + globe.width * 0.3, globe.y + globe.height * 0.82)
  await page.mouse.down()
  await page.mouse.move(globe.x + globe.width * 0.3 + 120, globe.y + globe.height * 0.82, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('.ops-card')).toBeVisible()
})
test('ops wall stays still when motion is reduced', async ({ page }) => {
  await serveWall(page, 30)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/ops')
  await expect(page.locator('.og-marker')).toHaveCount(5)
  expect(await fitsScreen(page)).toBe(true)
  const running = await page.evaluate(
    () => document.getAnimations().filter((a) => a.playState === 'running').length,
  )
  expect(running).toBe(0)
})

test('settings preserves Hub keys, saves a node override and restores after reload', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '卡面风格', exact: true })).toBeVisible()
  await page.screenshot({ path: `${shots}/settings-1440.png`, fullPage: true })
  await page.getByRole('button', { name: '节点设置' }).click()
  await page.getByLabel('选择节点', { exact: true }).selectOption('101')
  await page.getByRole('button', { name: '选择开拓者', exact: true }).click()
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.getByRole('status')).toContainText('已保存到 Hub')
  await page.reload()
  await page.getByRole('button', { name: '节点设置' }).click()
  await expect(page.getByRole('button', { name: '选择开拓者', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const raw = await (await request.get('http://127.0.0.1:9911/api/themes/football-monitor/config')).json()
  expect(raw.preserved_external_setting).toBe('must survive saves')
  expect(JSON.parse(raw.node_config).nodes['101'].template).toBe('pioneer')
})
test('portrait edits remain clearly unsaved, export real WebP and bind hosted URL', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/settings?node=101')
  await page.getByRole('button', { name: '立绘编辑', exact: true }).click()
  const png = readFileSync('tests/fixtures/athlete.png')
  await page
    .getByLabel('选择本地立绘')
    .setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('未保存 · 仅本地预览', { exact: true })).toBeVisible()
  await page.getByRole('slider', { name: '缩放', exact: true }).focus()
  await page.getByRole('slider', { name: '缩放', exact: true }).press('End')
  await expect(page.getByRole('slider', { name: '缩放', exact: true })).toHaveValue('3')
  for (let i = 0; i < 6; i++) await page.getByRole('slider', { name: '缩放', exact: true }).press('PageDown')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 WebP' }).click()
  expect((await download).suggestedFilename()).toContain('.webp')
  await page.locator('.settings-panel-header h2').click()
  await page.screenshot({ path: `${shots}/portrait-editor-1440.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await noHorizontalOverflow(page)).toBe(true)
  await page.screenshot({ path: `${shots}/portrait-editor-390.png`, fullPage: true })
  await page.getByLabel('立绘图片 URL').fill('https://images.example.org/portrait.webp')
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.locator('.save-feedback.success')).toContainText('已保存到 Hub')
})
test('anonymous users cannot edit site settings', async ({ page, request }) => {
  await request.post('http://127.0.0.1:9911/__test/auth?value=false')
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  await expect(page.getByRole('link', { name: '主题设置', exact: true })).toHaveCount(0)
  await page.goto('/settings')
  await expect(page.getByText('这片主场，由站长定义。')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存到 Hub' })).toHaveCount(0)
})
test('save failure is visible and no successful save is claimed', async ({ page }) => {
  await page.route('**/api/themes/football-monitor/config', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({ status: 500, contentType: 'text/plain', body: '模拟保存失败' })
    else await route.continue()
  })
  await page.goto('/settings')
  await page.getByRole('button', { name: '选择传奇', exact: true }).click()
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟保存失败')
  await expect(page.getByText('有未保存更改')).toBeVisible()
})
for (const appearance of ['dark', 'light'] as const)
  test(`dashboard has no serious accessibility violations in ${appearance} appearance`, async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('football-monitor:appearance', value),
      appearance,
    )
    await page.goto('/')
    await expect(page.locator('.player-card')).toHaveCount(5)
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      appearance === 'dark',
    )
    await cardsSettled(page)
    const report = await new AxeBuilder({ page }).analyze()
    expect(report.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual([])
  })

test('offline, malformed and long names fit on a 320px phone', async ({ page }) => {
  await page.routeWebSocket('**/api/ws*', (socket) => socket.close())
  const data = fixtureNodes().slice(0, 2)
  data[0]!.online = false
  data[0]!.name = '这是一台用于验证长节点名称自动换行的服务器-'.repeat(5)
  const response = { nodes: [data[0], { ...data[1], price: null, metrics: { cpu: -1 } }] }
  await page.route('**/api/nodes', (route) => route.fulfill({ json: response }))
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(2)
  const offline = page.locator('.player-card').first(),
    malformed = page.locator('.player-card').nth(1)
  await expect(offline.locator('.pc-rating')).toHaveText('OFF')
  await expect(offline.locator('.pc-offline-tag')).toHaveText('离线')
  const cpu = malformed.locator('.pc-stat').filter({ hasText: 'CPU' })
  await expect(cpu.locator('.pc-stat-label')).toHaveText('CPU')
  await expect(cpu.locator('.pc-stat-value')).toHaveText(/^(\d{1,2}|—)$/)
  for (const card of [offline, malformed]) {
    const cardBounds = (await card.boundingBox())!
    const nameBounds = (await card.locator('.pc-name').boundingBox())!
    expect(nameBounds.x).toBeGreaterThanOrEqual(cardBounds.x)
    expect(nameBounds.x + nameBounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width + 1)
    expect(nameBounds.y + nameBounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height)
  }
  expect(await noHorizontalOverflow(page)).toBe(true)
  await page.screenshot({ path: `${shots}/edge-cases-320.png`, fullPage: true })
})
test('no-node, closed-site and network failures have dedicated usable states', async ({ page }) => {
  await page.routeWebSocket('**/api/ws*', (socket) => socket.close())
  await page.route('**/api/nodes', (route) => route.fulfill({ json: { nodes: [] } }))
  await page.goto('/')
  await expect(page.getByText('阵容正在等待第一位球员')).toBeVisible()
  await page.route('**/api/me', (route) => route.fulfill({ json: { authed: false, public_page: false } }))
  await page.reload()
  await expect(page.getByText('此刻，主场暂未开放')).toBeVisible()
  await page.unroute('**/api/me')
  await page.unroute('**/api/nodes')
  await page.route('**/api/nodes', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByText('暂时无法获取节点')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
})
test('carrier task IDs, portrait offsets and global switches persist across reload', async ({
  page,
  request,
}) => {
  await page.goto('/settings?node=101')
  await page.getByRole('button', { name: '三网线路', exact: true }).click()
  await page.getByLabel('关联探测任务', { exact: true }).first().selectOption('202')
  await page.getByLabel('线路类型', { exact: true }).first().selectOption('CN2 GIA')
  await page.getByRole('button', { name: '立绘编辑', exact: true }).click()
  await page.getByRole('slider', { name: '水平位置', exact: true }).focus()
  await page.getByRole('slider', { name: '水平位置', exact: true }).press('End')
  await page.getByRole('button', { name: '全局设置', exact: true }).click()
  await page.getByRole('switch', { name: /全站服务器汇总/ }).click()
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.locator('.save-feedback.success')).toBeVisible()
  const config = await (await request.get('http://127.0.0.1:9911/api/themes/football-monitor/config')).json()
  expect(config.show_summary).toBe(false)
  expect(JSON.parse(config.node_config).nodes['101'].carriers.telecom.taskId).toBe(202)
  expect(JSON.parse(config.node_config).nodes['101'].portrait.x).toBe(60)
  await page.reload()
  await page.getByRole('button', { name: '立绘编辑', exact: true }).click()
  await expect(page.getByRole('slider', { name: '水平位置', exact: true })).toHaveValue('60')
})

test('edits made while save confirmation is pending remain in the draft', async ({ page, request }) => {
  let put = false,
    release: () => void = () => {}
  const confirmation = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/themes/football-monitor/config', async (route) => {
    if (route.request().method() === 'PUT') put = true
    else if (put) await confirmation
    await route.continue()
  })
  await page.goto('/settings')
  await page.getByRole('button', { name: '选择传奇', exact: true }).click()
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.getByRole('button', { name: '正在确认保存…' })).toBeVisible()
  await page.getByRole('button', { name: '选择开拓者', exact: true }).click()
  release()
  await expect(page.getByRole('button', { name: '选择开拓者', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('有未保存更改')).toBeVisible()
  const raw = await (await request.get('http://127.0.0.1:9911/api/themes/football-monitor/config')).json()
  expect(raw.default_template).toBe('legend')
})

test('local portrait drafts survive tab changes and node changes without pretending saved', async ({
  page,
}) => {
  await page.goto('/settings?node=101')
  await page.getByRole('button', { name: '立绘编辑', exact: true }).click()
  await page.getByLabel('选择本地立绘').setInputFiles('tests/fixtures/athlete.png')
  await expect(page.getByText('未保存 · 仅本地预览', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '全局设置', exact: true }).click()
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.getByRole('alert')).toContainText('尚未托管')
  await page.getByRole('button', { name: '立绘编辑', exact: true }).click()
  await expect(page.getByText('athlete.png', { exact: true })).toBeVisible()
  await page.getByLabel('选择节点', { exact: true }).selectOption('102')
  await page.getByLabel('选择节点', { exact: true }).selectOption('101')
  await expect(page.getByText('athlete.png', { exact: true })).toBeVisible()
  await expect(page.getByText('未保存 · 仅本地预览', { exact: true })).toBeVisible()
})
