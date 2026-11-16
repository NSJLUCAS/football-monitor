import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:9911/__test/reset')
})
const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'))

test('a phone opens on the squad: the overview folds behind one line until it is asked for', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  const toggle = page.locator('.overview-toggle')
  await expect(page.locator('.overview')).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toContainText('在线 5/5')
  // The first card is on the first screen instead of two screens down.
  const top = await page
    .locator('.live-card')
    .first()
    .evaluate((e) => e.getBoundingClientRect().top + scrollY)
  expect(top).toBeLessThan(844)
  expect(await noHorizontalOverflow(page)).toBe(true)
  await toggle.click()
  await expect(page.locator('.overview')).toBeVisible()
  await expect(page.locator('.summary-stat')).toHaveCount(8)
  // Remembered in this browser.
  await page.reload()
  await expect(page.locator('.overview')).toBeVisible()
  // Wider screens never fold it and never show the toggle.
  await page.evaluate(() => localStorage.removeItem('football-monitor:overview'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await expect(page.locator('.overview')).toBeVisible()
  await expect(toggle).toBeHidden()
})

test('group and status filters live in the address and follow the visitor to the next page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  await page.getByRole('button', { name: '亚洲节点', exact: true }).click()
  await page.locator('.status-filter').getByRole('button', { name: '在线', exact: true }).click()
  await expect(page).toHaveURL(/group=/)
  await expect(page).toHaveURL(/status=online/)
  const shown = await page.locator('.player-card').count()
  expect(shown).toBeGreaterThan(0)
  expect(shown).toBeLessThan(5)
  await page.reload()
  await expect(page.locator('.player-card')).toHaveCount(shown)
  await expect(page.getByRole('button', { name: '亚洲节点', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // The main navigation carries the group along; exactly one entry is the current page.
  await page.locator('.main-nav').getByRole('link', { name: '网络质量' }).click()
  await expect(page).toHaveURL(/\/network\?group=/)
  await expect(page.getByRole('button', { name: '亚洲节点', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.network-row')).toHaveCount(shown)
  await expect(page.locator('.main-nav a[aria-current="page"]')).toHaveText(['网络质量'])
  await page.locator('.main-nav').getByRole('link', { name: '首页' }).click()
  await expect(page.locator('.main-nav a[aria-current="page"]')).toHaveText(['首页'])
  await expect(page).toHaveURL(/group=/)
})

test('configuring a node from its page opens that node’s settings, and a draft is never lost silently', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/node/103')
  await page.getByRole('link', { name: '配置此节点' }).click()
  await expect(page.getByRole('heading', { name: '节点设置', exact: true })).toBeVisible()
  await expect(page.getByLabel('选择节点', { exact: true })).toHaveValue('103')
  // A full reload keeps both the category and the node.
  await page.reload()
  await expect(page.getByRole('heading', { name: '节点设置', exact: true })).toBeVisible()
  await expect(page.getByLabel('选择节点', { exact: true })).toHaveValue('103')
  await page.getByRole('button', { name: '选择开拓者', exact: true }).click()
  // The page's own save button has scrolled away at the foot of the long form; the bar is still in view.
  await page.locator('.settings-panel-footer').scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: '保存到 Hub' })).not.toBeInViewport()
  const bar = page.locator('.settings-dirty-bar')
  await expect(bar).toBeInViewport()
  await expect(bar).toContainText('更改尚未保存')
  // Leaving asks first; declining stays with the draft.
  page.once('dialog', (dialog) => void dialog.dismiss())
  await page.getByRole('link', { name: 'Football Monitor 首页' }).click()
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.getByRole('button', { name: '选择开拓者', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await bar.getByRole('button', { name: '保存更改' }).click()
  await expect(bar).toContainText('已保存')
  // Nothing left to lose: leaving is free again.
  await page.getByRole('link', { name: 'Football Monitor 首页' }).click()
  await expect(page.locator('.player-card')).toHaveCount(5)
  expect(await noHorizontalOverflow(page)).toBe(true)
})

test('the node page marks the section being read and keeps the chart window in the address', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/node/101')
  const current = page.locator('.detail-tabs a[aria-current="location"]')
  await expect(current).toHaveText(['项目'])
  await page.locator('.detail-tabs').getByRole('link', { name: '历史表现' }).click()
  await expect(current).toHaveText(['历史表现'])
  await page.locator('.range-buttons').getByRole('button', { name: '1 天', exact: true }).click()
  await page.getByRole('tab', { name: '网络延迟' }).click()
  await expect(page).toHaveURL(/hours=24/)
  await expect(page).toHaveURL(/chart=latency/)
  await page.reload()
  await expect(page.getByRole('tab', { name: '网络延迟' })).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.locator('.range-buttons').getByRole('button', { name: '1 天', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  // The arrow keys move between the two chart tabs.
  await page.getByRole('tab', { name: '网络延迟' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: '资源' })).toBeFocused()
  await expect(page.getByRole('tab', { name: '资源' })).toHaveAttribute('aria-selected', 'true')
  // The four billing blocks sit in one row or two by two, never three and a lone fourth.
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const rows = await page.locator('.billing-block').evaluateAll((blocks) => {
      const tops = blocks.map((b) => Math.round(b.getBoundingClientRect().top))
      return [...new Set(tops)].map((top) => tops.filter((t) => t === top).length)
    })
    expect(
      rows.reduce((a, b) => a + b, 0),
      `${width}px`,
    ).toBe(4)
    expect(new Set(rows).size, `${width}px: ${rows.join('+')}`).toBe(1)
    expect(await noHorizontalOverflow(page)).toBe(true)
  }
})

test('a visitor’s light or dark pick lets go once the owner changes the site default', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  expect(await isDark(page)).toBe(true)
  await page.getByRole('button', { name: '切换浅色外观' }).click()
  expect(await isDark(page)).toBe(false)
  const setDefault = async (value: string) => {
    await page.goto('/settings?tab=global')
    await page.getByLabel('站点默认外观').selectOption(value)
    await page.getByRole('button', { name: '保存到 Hub' }).click()
    await expect(page.locator('.save-feedback.success')).toContainText('已保存到 Hub')
  }
  await setDefault('light')
  // Back to a dark default: a browser that once picked light is no longer pinned to it.
  await setDefault('dark')
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  expect(await isDark(page)).toBe(true)
})

for (const appearance of ['dark', 'light'] as const)
  test(`network page with an offline node has no serious accessibility violations in ${appearance} appearance`, async ({
    page,
    request,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('football-monitor:appearance', value),
      appearance,
    )
    await request.post('http://127.0.0.1:9911/__test/offline?ids=104')
    await page.goto('/network')
    await expect(page.locator('.network-row')).toHaveCount(5)
    await expect(page.locator('.network-row[data-online="false"]')).toHaveCount(1)
    await expect(page.locator('.network-row .quality-bar[data-state="loading"]')).toHaveCount(0)
    expect(await isDark(page)).toBe(appearance === 'dark')
    const report = await new AxeBuilder({ page }).analyze()
    expect(report.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual([])
  })

test('the projects page leaves searching to the header on a phone, where its box sits right above', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')
  await expect(page.locator('.pj-stats')).toBeVisible()
  await expect(page.locator('.pj-search')).toBeHidden()
  await page.getByRole('searchbox', { name: '搜索服务器' }).fill('zzzz-nothing')
  await expect(page.getByText('没有找到匹配的项目')).toBeVisible()
  await expect(page).toHaveURL(/q=zzzz-nothing/)
  expect(await noHorizontalOverflow(page)).toBe(true)
})

test('cards that do not fill the first row widen and sit in the middle of it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  const edges = () =>
    page.locator('.card-grid').evaluate((grid) => {
      const box = grid.getBoundingClientRect(),
        cards = [...grid.children].map((c) => c.getBoundingClientRect())
      return {
        left: cards[0]!.left - box.left,
        right: box.right - Math.max(...cards.map((c) => c.right)),
        // Layout position: a card's entrance animation moves its box, not its place in the grid.
        rows: new Set([...grid.children].map((c) => (c as HTMLElement).offsetTop)).size,
      }
    })
  // Five cards where seven fit: one row, the same space on both sides.
  await expect(page.locator('.card-grid')).toHaveAttribute('data-short', '')
  let e = await edges()
  expect(e.rows).toBe(1)
  expect(e.left).toBeGreaterThan(20)
  expect(Math.abs(e.left - e.right)).toBeLessThan(2)
  // Once the row is full the grid is the plain one again, flush with both edges.
  await page.setViewportSize({ width: 700, height: 900 })
  await expect(page.locator('.card-grid')).not.toHaveAttribute('data-short')
  e = await edges()
  expect(e.left).toBeLessThan(1)
  expect(e.right).toBeLessThan(1)
  expect(await noHorizontalOverflow(page)).toBe(true)
})

test('the phone header is two rows for the owner: mark and actions, then the search', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  await expect(page.getByRole('link', { name: '主题设置' })).toBeVisible()
  const brand = await page.locator('.brand').boundingBox(),
    actions = await page.locator('.header-actions').boundingBox(),
    search = await page.locator('.header-search').boundingBox()
  expect(Math.abs(brand!.y + brand!.height / 2 - (actions!.y + actions!.height / 2))).toBeLessThan(4)
  expect(search!.y).toBeGreaterThan(actions!.y + actions!.height - 1)
  expect(await page.locator('.site-header').evaluate((h) => h.getBoundingClientRect().height)).toBeLessThan(
    115,
  )
  await expect(page.locator('.brand')).toContainText('MONITOR')
  expect(await noHorizontalOverflow(page)).toBe(true)
})
