import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { WebSocketServer, WebSocket } from 'ws'
import { history, initialConfig, nodes } from './fixtures'

let config: Record<string, unknown> = { ...initialConfig }
let authed = true
// Development switch: nodes taken offline keep their last report, as Hub does.
let offline = new Set<number>()
const liveNodes = () =>
  nodes().map((n) =>
    offline.has(n.id)
      ? { ...n, online: false, last_seen: n.last_seen - 3 * 3600, last_seen_ago: 3 * 3600 }
      : n,
  )
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1:9911')
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-football-monitor-test-api', 'isolated mock only')
  const json = (value: unknown, status = 200) => {
    res.statusCode = status
    res.end(JSON.stringify(value))
  }
  if (url.pathname === '/__test/reset' && req.method === 'POST') {
    config = { ...initialConfig }
    authed = true
    offline = new Set()
    json({ ok: true })
    return
  }
  if (url.pathname === '/__test/auth' && req.method === 'POST') {
    authed = url.searchParams.get('value') !== 'false'
    json({ ok: true })
    return
  }
  // POST /__test/offline?ids=103,105 takes those nodes offline; no ids brings every node back.
  if (url.pathname === '/__test/offline' && req.method === 'POST') {
    offline = new Set((url.searchParams.get('ids') || '').split(',').filter(Boolean).map(Number))
    json({ ok: true, offline: [...offline] })
    return
  }
  if (url.pathname === '/api/me') {
    json({
      authed,
      public_page: true,
      site_name: '本地模拟验收 · 非真实服务器',
      github: false,
      history_days: 7,
    })
    return
  }
  if (url.pathname === '/api/nodes') {
    json({ nodes: liveNodes() })
    return
  }
  const match = url.pathname.match(/^\/api\/nodes\/(\d+)\/metrics$/)
  if (match) {
    const id = Number(match[1]),
      data = history(id, Number(url.searchParams.get('hours')) || 6, url.searchParams.get('series') || '')
    // An offline agent stops reporting and probing: its history ends when it went away.
    if (offline.has(id)) {
      const end = Date.now() / 1000 - 3 * 3600
      data.metrics = data.metrics.filter((p) => p.ts <= end)
      data.ping = data.ping.filter((p) => p.ts <= end)
    }
    json(data)
    return
  }
  if (url.pathname === '/api/themes/football-monitor/config') {
    if (req.method === 'PUT') {
      if (!authed) {
        json({ error: 'unauthorized' }, 401)
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk)
        size += buffer.length
        if (size > 65536) {
          json({ error: 'large' }, 413)
          return
        }
        chunks.push(buffer)
      }
      try {
        config = JSON.parse(Buffer.concat(chunks).toString())
        res.statusCode = 204
        res.end()
      } catch {
        json({ error: 'bad json' }, 400)
      }
    } else json(config)
    return
  }
  json({ error: 'not found' }, 404)
})
const wss = new WebSocketServer({ server, path: '/api/ws' })
wss.on('connection', (ws, req) => {
  const compressed = new URL(req.url || '/', 'http://127.0.0.1').searchParams.has('gzip')
  const send = () => {
    if (ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify({ nodes: liveNodes() })
      ws.send(compressed ? gzipSync(data) : data)
    }
  }
  send()
  const timer = setInterval(send, 2000)
  ws.on('close', () => clearInterval(timer))
})
server.listen(9911, '127.0.0.1', () =>
  console.log('Isolated development API: http://127.0.0.1:9911 (never ship this server)'),
)
