import { readFileSync } from 'node:fs'
// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableObjectState } from '@cloudflare/workers-types'
import { generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose'
import { createUploadHandler, UploadLimiter, type Env } from '../upload-worker/index'

const png = readFileSync('tests/fixtures/athlete.png')
let privateKey: CryptoKey, resolver: JWTVerifyGetKey, token: string
const put = vi.fn().mockResolvedValue({})
beforeEach(() => put.mockClear())
function env(overrides: Partial<Env> = {}): Env {
  return {
    BUCKET: { put },
    LIMITER: {
      idFromName: () => 'x',
      get: () => ({ fetch: async () => new Response(null, { status: 200 }) }),
    },
    ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    ACCESS_AUD: 'expected-aud',
    ALLOWED_EMAILS: 'admin@example.org',
    ALLOWED_ORIGIN: 'https://monitor.example.org',
    PUBLIC_IMAGE_BASE: 'https://images.example.org',
    ...overrides,
  } as unknown as Env
}
const req = (jwt = token, body: Uint8Array = png, extra: Record<string, string> = {}) =>
  new Request('https://upload.example.org/upload', {
    method: 'POST',
    headers: {
      Origin: 'https://monitor.example.org',
      'Cf-Access-Jwt-Assertion': jwt,
      'content-type': 'image/png',
      'x-node-id': '101',
      ...extra,
    },
    body: body as BodyInit,
  })
beforeAll(async () => {
  const keys = await generateKeyPair('RS256')
  privateKey = keys.privateKey
  resolver = async () => keys.publicKey
  token = await new SignJWT({ email: 'admin@example.org' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('admin-sub')
    .setIssuer('https://team.cloudflareaccess.com')
    .setAudience('expected-aud')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
})
describe('Access protected optional upload Worker', () => {
  it('verifies a real signature and stores generated immutable object key', async () => {
    const handler = createUploadHandler(resolver)
    const res = await handler(req(), env())
    expect(res.status).toBe(201)
    expect(((await res.json()) as { url: string }).url).toMatch(
      /^https:\/\/images\.example\.org\/nodes\/101\/[a-f\d-]+\.png$/,
    )
    expect(put).toHaveBeenCalledOnce()
    expect(put.mock.calls[0]![2].httpMetadata.contentType).toBe('image/png')
    expect(res.headers.get('access-control-allow-origin')).toBe('https://monitor.example.org')
  })
  it('rejects forged, expired and wrong-audience tokens', async () => {
    const handler = createUploadHandler(resolver)
    expect((await handler(req('forged'), env())).status).toBe(401)
    const expired = await new SignJWT({ email: 'admin@example.org' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('s')
      .setIssuer('https://team.cloudflareaccess.com')
      .setAudience('expected-aud')
      .setIssuedAt()
      .setExpirationTime(1)
      .sign(privateKey)
    expect((await handler(req(expired), env())).status).toBe(401)
    expect((await handler(req(), env({ ACCESS_AUD: 'wrong' }))).status).toBe(401)
    expect(put).not.toHaveBeenCalled()
  })
  it('requires explicitly allowed email and Origin', async () => {
    const handler = createUploadHandler(resolver)
    expect((await handler(req(), env({ ALLOWED_EMAILS: 'someone@example.org' }))).status).toBe(403)
    expect((await handler(req(token, png, { Origin: 'https://evil.example.org' }), env())).status).toBe(403)
    expect(put).not.toHaveBeenCalled()
  })
  it('fails closed with absent/failed distributed limiter or exhausted rate', async () => {
    const handler = createUploadHandler(resolver)
    expect((await handler(req(), env({ LIMITER: undefined }))).status).toBe(503)
    const limit = {
      idFromName: () => 'x',
      get: () => ({ fetch: async () => new Response(null, { status: 429 }) }),
    } as unknown as Env['LIMITER']
    expect((await handler(req(), env({ LIMITER: limit }))).status).toBe(429)
  })
  it('bounds actual streamed bytes and validates real MIME and node ID', async () => {
    const handler = createUploadHandler(resolver)
    expect((await handler(req(token, new Uint8Array(8 * 1024 ** 2 + 1)), env())).status).toBe(413)
    expect((await handler(req(token, new TextEncoder().encode('<script>bad</script>')), env())).status).toBe(
      400,
    )
    expect((await handler(req(token, png, { 'content-type': 'image/jpeg' }), env())).status).toBe(400)
    expect((await handler(req(token, png, { 'x-node-id': '../escape' }), env())).status).toBe(400)
    const jpeg = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 1, 0, 1, 0, 255, 217])
    expect((await handler(req(token, jpeg, { 'content-type': 'image/jpeg' }), env())).status).toBe(400)
    const webp = new Uint8Array(30),
      view = new DataView(webp.buffer)
    webp.set(new TextEncoder().encode('RIFF'), 0)
    view.setUint32(4, 22, true)
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8)
    view.setUint32(16, 10, true)
    expect((await handler(req(token, webp, { 'content-type': 'image/webp' }), env())).status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })
  it('preflight permits only configured browser origin and method', async () => {
    const handler = createUploadHandler(resolver)
    const res = await handler(
      new Request('https://upload.example.org/upload', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://monitor.example.org',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-node-id',
        },
      }),
      env(),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })
  it('uses a durable transaction for the per-subject rate budget', async () => {
    const storage = new Map<string, unknown>()
    const transaction = vi.fn(async (callback: (txn: unknown) => Promise<unknown>) =>
      callback({
        get: async (key: string) => storage.get(key),
        put: async (key: string, value: unknown) => {
          storage.set(key, value)
        },
      }),
    )
    const limiter = new UploadLimiter({ storage: { transaction } } as unknown as DurableObjectState)
    const statuses = []
    for (let i = 0; i < 6; i++) statuses.push((await limiter.fetch()).status)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
    expect(transaction).toHaveBeenCalledTimes(6)
  })
})
