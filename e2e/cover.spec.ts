import { existsSync, readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { nodes as fixtureNodes } from '../dev/fixtures'

// Renders preview.png, the 16:9 cover on the Hub theme page: the wordmark and tagline beside a fan of real
// cards shot from the built theme against the isolated mock API. Run with `npm run cover`.

// Fixture node -> skin. The fixtures' auto portraits follow node id, so each card shows a different player;
// the centre card instead wears the owner-supplied cover figure (D043), and 102 trades its auto portrait for
// the one 103 gives up so no player shows twice.
const fan = [
  [102, 'shatter'],
  [104, 'neon'],
  [103, 'toty-xi'],
  [101, 'galaxy'],
  [105, 'splash'],
] as const
const features = ['17 套球星卡面', '实时探针', '三网延迟', '到期提醒']
// The centre card is a Brazilian node on Alibaba Cloud running Debian, to match the figure (owner's choice).
const centreNode = { id: 103, name: 'BR-Sao Paulo', country: 'BR', os: 'Debian 12' }
const centreFigure = 'design/cover/center.png'
// Card portraits only load public HTTPS images, so the local figure is served under a routed address.
const centreUrl = 'https://assets.example.com/football-monitor-cover.png'

async function shootCards(page: Page) {
  await page.route('**/api/themes/football-monitor/config', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const config = await (await route.fetch()).json()
    const nodes = JSON.parse(config.node_config).nodes
    for (const [id, template] of fan) nodes[id] = { ...nodes[id], template }
    nodes[102].portrait = { builtin: 'argentina', scale: 2.2, x: 14, y: 52 }
    nodes[103].portrait = { url: centreUrl, scale: 2.15, x: -13, y: 19 }
    nodes[103].provider = { id: 'aliyun' }
    await route.fulfill({ json: { ...config, node_config: JSON.stringify({ version: 1, nodes }) } })
  })
  const live = fixtureNodes().map((n) => (n.id === centreNode.id ? { ...n, ...centreNode } : n))
  await page.route('**/api/nodes', (route) => route.fulfill({ json: { nodes: live } }))
  await page.routeWebSocket('**/api/ws*', (socket) => socket.send(JSON.stringify({ nodes: live })))
  await page.route(centreUrl, (route) =>
    route.fulfill({ contentType: 'image/png', body: readFileSync(centreFigure) }),
  )
  await page.goto('/')
  await expect(page.locator('.player-card')).toHaveCount(5)
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.live-card.card-intro')].every((c) =>
        c.classList.contains('card-ready'),
      ) &&
      !document.querySelector('.pc-roll') &&
      [...document.querySelectorAll<HTMLImageElement>('.player-card img')].every((i) => i.complete),
  )
  // Clear every backdrop behind the cards so the shots keep the cut card outline.
  await page.addStyleTag({ content: 'html, body, body * { background-color: transparent !important }' })
  await page.evaluate(() => {
    for (const card of document.querySelectorAll('.player-card'))
      for (let el = card.parentElement; el; el = el.parentElement) el.style.backgroundImage = 'none'
  })
  const shots: string[] = []
  for (const [id] of fan) {
    const card = page.locator(`.live-card:has(a[href$="/node/${id}"]) .player-card`).first()
    const png = await card.screenshot({ omitBackground: true, animations: 'disabled' })
    shots.push(`data:image/png;base64,${png.toString('base64')}`)
  }
  return shots
}

function coverHtml(cards: string[]) {
  const pitch = `data:image/svg+xml;base64,${readFileSync('public/favicon.svg').toString('base64')}`
  const slots = [
    { x: -296, y: 46, r: -13, s: 0.82, z: 1 },
    { x: -152, y: 14, r: -6.5, s: 0.92, z: 2 },
    { x: 0, y: 0, r: 0, s: 1.06, z: 5 },
    { x: 152, y: 14, r: 6.5, s: 0.92, z: 4 },
    { x: 296, y: 46, r: 13, s: 0.82, z: 3 },
  ]
  const fanned = cards
    .map((src, i) => {
      const { x, y, r, s, z } = slots[i]!
      return `<img class="card" src="${src}" style="--x:${x}px;--y:${y}px;--r:${r}deg;--s:${s};z-index:${z}" alt="" />`
    })
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; margin: 0 }
  html, body { width: 1600px; height: 900px; overflow: hidden }
  body {
    position: relative;
    font-family: Inter, 'Segoe UI', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
    color: #f3f4f6;
    background:
      radial-gradient(70% 60% at 72% 58%, rgba(255, 122, 26, 0.16), transparent 70%),
      radial-gradient(60% 80% at 10% 0%, rgba(56, 189, 248, 0.08), transparent 60%),
      linear-gradient(180deg, #0d1017 0%, #10141c 55%, #0b0e14 100%);
  }
  /* Floodlights from the stand roof. */
  .beam { position: absolute; top: -120px; width: 260px; height: 1100px; filter: blur(28px); opacity: 0.5;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 75%); }
  .beam.a { left: 820px; transform: rotate(24deg); transform-origin: top }
  .beam.b { left: 1380px; transform: rotate(-22deg); transform-origin: top }
  /* Pitch markings: halfway line and centre circle behind the cards. The Hub crops the cover's sides to
     about 1.72:1, so the fan keeps inside x 30..1570. */
  .pitch { position: absolute; inset: 0; opacity: 0.1;
    mask-image: linear-gradient(transparent 14%, #000 34%, #000 66%, transparent 86%) }
  .glow { position: absolute; left: 860px; top: 640px; width: 520px; height: 110px; border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 122, 26, 0.55), transparent); filter: blur(18px) }
  .copy { position: absolute; left: 96px; top: 0; bottom: 0; width: 640px; display: flex;
    flex-direction: column; justify-content: center; gap: 30px }
  .brand { display: flex; align-items: center; gap: 16px; font-weight: 900; letter-spacing: 0.06em;
    font-size: 30px }
  .brand img { width: 50px; height: 50px }
  .brand strong { color: #ff7a1a; font-weight: 900 }
  h1 { font-size: 84px; line-height: 1.08; font-weight: 900; letter-spacing: 0.01em }
  h1 span { display: block; background: linear-gradient(90deg, #ffb347, #ff7a1a 60%, #ff5a1f);
    -webkit-background-clip: text; background-clip: text; color: transparent }
  p { font-size: 22px; line-height: 1.6; color: #9aa3b2 }
  ul { display: flex; flex-wrap: wrap; gap: 12px; padding: 0; list-style: none; max-width: 620px }
  li { padding: 9px 18px; border-radius: 999px; font-size: 19px; font-weight: 700; color: #e5e7eb;
    background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1) }
  li:first-child { color: #ffb066; border-color: rgba(255, 122, 26, 0.45); background: rgba(255, 122, 26, 0.1) }
  .stage { position: absolute; left: 1112px; top: 450px }
  .card { position: absolute; left: 0; top: 0; width: 304px;
    transform: translate(-50%, -50%) translate(var(--x), var(--y)) rotate(var(--r)) scale(var(--s));
    filter: drop-shadow(0 26px 30px rgba(0, 0, 0, 0.6)) }
</style></head><body>
  <div class="beam a"></div><div class="beam b"></div>
  <svg class="pitch" viewBox="0 0 1600 900" fill="none" stroke="#fff" stroke-width="3">
    <path d="M1112 120v660" /><circle cx="1112" cy="450" r="270" /><circle cx="1112" cy="450" r="6" fill="#fff" />
  </svg>
  <div class="glow"></div>
  <div class="copy">
    <div class="brand"><img src="${pitch}" alt="" /><span>FOOTBALL <strong>MONITOR</strong></span></div>
    <h1>你的服务器，<span>你的主场</span></h1>
    <p>每个节点都是一名球员，评分就是网络质量（0–99）。<br />原创足球球星卡风格的极简探针主题。</p>
    <ul>${features.map((f) => `<li>${f}</li>`).join('')}</ul>
  </div>
  <div class="stage">${fanned}</div>
</body></html>`
}

test('cover', async ({ browser, request }) => {
  expect(existsSync(centreFigure), `缺少封面中间卡立绘 ${centreFigure}`).toBe(true)
  await request.post('http://127.0.0.1:9911/__test/reset')
  const shoot = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 })
  const cards = await shootCards(await shoot.newPage())
  await shoot.close()
  const compose = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  const page = await compose.newPage()
  await page.setContent(coverHtml(cards))
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  await page.screenshot({ path: 'preview.png' })
  await compose.close()
})
