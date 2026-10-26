import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { R2Bucket, DurableObjectNamespace, DurableObjectState } from '@cloudflare/workers-types'
import { inspectImage, MAX_IMAGE_BYTES } from '../shared/image-content'

export interface Env {
  BUCKET: R2Bucket
  LIMITER: DurableObjectNamespace
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  ALLOWED_EMAILS: string
  ALLOWED_ORIGIN: string
  PUBLIC_IMAGE_BASE: string
}
const resolvers = new Map<string, JWTVerifyGetKey>()
const secureUrl = (value: string) => {
  try {
    const u = new URL(value)
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) &&
      !/(^|\.)(localhost|local|internal)$/.test(u.hostname)
    )
  } catch {
    return false
  }
}
function configured(env: Env) {
  return (
    env.BUCKET &&
    env.LIMITER &&
    /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '') &&
    env.ACCESS_AUD?.length > 0 &&
    env.ALLOWED_EMAILS?.trim() &&
    secureUrl(env.ALLOWED_ORIGIN) &&
    new URL(env.ALLOWED_ORIGIN).origin === env.ALLOWED_ORIGIN &&
    secureUrl(env.PUBLIC_IMAGE_BASE)
  )
}
async function limitedBytes(request: Request): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new RangeError('size')
  if (!request.body) throw new Error('empty')
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel()
        throw new RangeError('size')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
/** Inject only the key resolver in tests; every request still runs real JWT verification. */
export function createUploadHandler(testResolver?: JWTVerifyGetKey) {
  return async (request: Request, env: Env): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      vary: 'Origin',
    })
    if (origin === env.ALLOWED_ORIGIN) {
      headers.set('access-control-allow-origin', origin)
      headers.set('access-control-allow-credentials', 'true')
    }
    const reply = (status: number, body: Record<string, unknown>) =>
      new Response(JSON.stringify(body), { status, headers })
    if (!configured(env)) return reply(503, { error: 'Upload service is not configured' })
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      const requested = (request.headers.get('access-control-request-headers') || '')
        .toLowerCase()
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean)
      if (
        url.pathname !== '/upload' ||
        origin !== env.ALLOWED_ORIGIN ||
        request.headers.get('access-control-request-method') !== 'POST' ||
        requested.some((h) => !['content-type', 'x-node-id'].includes(h))
      )
        return reply(403, { error: 'Origin or preflight denied' })
      headers.set('access-control-allow-methods', 'POST')
      headers.set('access-control-allow-headers', 'Content-Type, X-Node-Id')
      headers.set('access-control-max-age', '600')
      return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'GET' && (request.method !== 'POST' || url.pathname !== '/upload'))
      return reply(404, { error: 'Not found' })
    if (request.method === 'POST' && origin !== env.ALLOWED_ORIGIN)
      return reply(403, { error: 'Origin denied' })
    const token = request.headers.get('cf-access-jwt-assertion')
    if (!token) return reply(401, { error: 'Access authentication required' })
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`
    let subject: string
    try {
      let key = testResolver || resolvers.get(issuer)
      if (!key) {
        key = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
          timeoutDuration: 5000,
          cooldownDuration: 30000,
        })
        resolvers.set(issuer, key)
      }
      const { payload } = await jwtVerify(token, key, {
        issuer,
        audience: env.ACCESS_AUD,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat'],
        maxTokenAge: '24h',
        clockTolerance: 5,
      })
      const allowed = env.ALLOWED_EMAILS.split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
      if (typeof payload.email !== 'string' || !allowed.includes(payload.email.toLowerCase()))
        return reply(403, { error: 'Uploader is not allowed' })
      subject = payload.sub!
    } catch {
      return reply(401, { error: 'Invalid or expired Access identity' })
    }
    if (request.method === 'GET')
      return url.pathname === '/'
        ? reply(200, { status: 'Access identity verified. Return to Football Monitor to upload.' })
        : reply(404, { error: 'Not found' })
    const nodeId = request.headers.get('x-node-id') || ''
    if (!/^[1-9]\d*$/.test(nodeId) || !Number.isSafeInteger(Number(nodeId)))
      return reply(400, { error: 'Invalid node ID' })
    const mime = request.headers.get('content-type')?.split(';')[0]?.trim()
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime || ''))
      return reply(400, { error: 'Unsupported image type' })
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${issuer}|${subject}`))
      const actor = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('')
      const result = await env.LIMITER.get(env.LIMITER.idFromName(actor)).fetch('https://limiter/check', {
        method: 'POST',
      })
      if (result.status === 429) {
        headers.set('retry-after', '60')
        return reply(429, { error: 'Upload limit reached' })
      }
      if (!result.ok) return reply(503, { error: 'Rate service unavailable' })
    } catch {
      return reply(503, { error: 'Rate service unavailable' })
    }
    let bytes: Uint8Array, info: ReturnType<typeof inspectImage>
    try {
      bytes = await limitedBytes(request)
      info = inspectImage(bytes)
      if (info.mime !== mime) throw new Error('mime')
    } catch (e) {
      return reply(e instanceof RangeError ? 413 : 400, {
        error: e instanceof RangeError ? 'Image exceeds 8 MiB' : 'Invalid image content or dimensions',
      })
    }
    const key = `nodes/${nodeId}/${crypto.randomUUID()}.${info.extension}`
    try {
      await env.BUCKET.put(key, bytes, {
        httpMetadata: { contentType: info.mime, cacheControl: 'public, max-age=31536000, immutable' },
      })
    } catch {
      return reply(503, { error: 'Image storage unavailable' })
    }
    return reply(201, { url: new URL(key, `${env.PUBLIC_IMAGE_BASE.replace(/\/$/, '')}/`).href })
  }
}
export default { fetch: createUploadHandler() }

/** Five upload attempts per subject per minute, enforced by durable storage transaction. */
export class UploadLimiter {
  constructor(private state: DurableObjectState) {}
  async fetch(): Promise<Response> {
    const allowed = await this.state.storage.transaction(async (transaction) => {
      const now = Date.now(),
        stored = await transaction.get<{ start: number; count: number }>('window')
      const window = !stored || now - stored.start >= 60000 ? { start: now, count: 0 } : stored
      if (window.count >= 5) return false
      window.count++
      await transaction.put('window', window)
      return true
    })
    return new Response(null, { status: allowed ? 200 : 429 })
  }
}
