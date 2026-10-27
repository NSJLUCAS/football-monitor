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
  const rowBottom = await page
    .locator('.live-card')
    .evaluateAll((cards) => Math.max(...cards.slice(0, 7).map((c) => c.getBoundingClientRect().bottom)))
  await page.setViewportSize({ width: 1440, height: Math.ceil(rowBottom) + 12 })
  await page.screenshot({ path: 'preview.png' })
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1080 : 900 })
    if (width <= 390) expect(await firstRowCount(page)).toBe(2)
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
