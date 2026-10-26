import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { test, expect, type WebSocketRoute } from '@playwright/test'
import { nodes as fixtureNodes } from '../dev/fixtures'
const shots = 'docs/screenshots'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:9911/__test/reset')
  await mkdir(shots, { recursive: true })
})

test('exported WebP rebinds with the same composition and no duplicate crop', async ({ page, request }) => {
  await page.goto('/settings?node=101')
  await page.getByRole('button', { name: '立绘编辑', exact: true }).click()
  await page.getByLabel('选择本地立绘').setInputFiles('tests/fixtures/athlete.png')
  await page.getByRole('slider', { name: '水平位置', exact: true }).focus()
  await page.getByRole('slider', { name: '水平位置', exact: true }).press('End')
  await page.getByRole('slider', { name: '缩放', exact: true }).focus()
  await page.getByRole('slider', { name: '缩放', exact: true }).press('End')
  await page.getByLabel('显示区域', { exact: true }).selectOption('upper')
  await expect(page.locator('.custom-portrait')).toHaveAttribute('data-loaded', 'true')
  const before = await page
    .locator('.preview-card-wrap .portrait-layer')
    .screenshot({ path: `${shots}/composition-before.png` })
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 WebP' }).click()
  const download = await downloadEvent,
    exported = readFileSync((await download.path())!)
  const size = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/webp;base64,${base64}`)).blob())
    return [bitmap.width, bitmap.height]
  }, exported.toString('base64'))
  expect(size).toEqual([1200, 1500])
  const url = 'https://images.example.org/exported.webp'
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: exported }))
  await expect(page.getByLabel('绑定的图片')).toHaveValue('processed')
  await page.getByLabel('立绘图片 URL').fill(url)
  await expect(page.getByRole('slider', { name: '水平位置', exact: true })).toHaveValue('0')
  await expect(page.getByRole('slider', { name: '缩放', exact: true })).toHaveValue('1')
  await expect(page.locator('.custom-portrait')).toHaveAttribute('href', url)
  await expect(page.locator('.custom-portrait')).toHaveAttribute('data-loaded', 'true')
  const after = await page
    .locator('.preview-card-wrap .portrait-layer')
    .screenshot({ path: `${shots}/composition-after.png` })
  const difference = await page.evaluate(
    async ([a, b]) => {
      const load = (base64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = reject
          image.src = `data:image/png;base64,${base64}`
        })
      const first = await load(a!),
        second = await load(b!),
        canvas = document.createElement('canvas')
      canvas.width = first.width
      canvas.height = first.height
      const context = canvas.getContext('2d')!
      context.drawImage(first, 0, 0)
      const x = context.getImageData(0, 0, first.width, first.height).data
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(second, 0, 0)
      const y = context.getImageData(0, 0, first.width, first.height).data
      return x.reduce((sum, value, i) => sum + Math.abs(value - y[i]!), 0) / x.length
    },
    [before.toString('base64'), after.toString('base64')],
  )
  expect(difference).toBeLessThan(8)
  await page.getByRole('button', { name: '保存到 Hub' }).click()
  await expect(page.locator('.save-feedback.success')).toBeVisible()
  const raw = await (await request.get('http://127.0.0.1:9911/api/themes/football-monitor/config')).json()
  expect(JSON.parse(raw.node_config).nodes['101'].portrait).toMatchObject({
    url,
    scale: 1,
    x: 0,
    y: 0,
    area: 'full',
    box: 'bleed',
  })
})

test('a public HTTP 200 fallback still revokes editing after logout', async ({ page, request }) => {
  let stream: WebSocketRoute | undefined
  await page.routeWebSocket('**/api/ws*', (socket) => {
    stream = socket
    socket.send(
      JSON.stringify({
        nodes: [{ ...fixtureNodes()[0], id: 901, public: false, name: 'PRIVATE-SIMULATED' }],
      }),
    )
  })
  await page.goto('/settings')
  await expect(page.getByText('实时连接', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '选择传奇', exact: true }).click()
  await request.post('http://127.0.0.1:9911/__test/auth?value=false')
  await stream!.close()
  await expect(page.getByText('这片主场，由站长定义。')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存到 Hub' })).toHaveCount(0)
  await expect(page.getByText('PRIVATE-SIMULATED', { exact: true })).toHaveCount(0)
})
