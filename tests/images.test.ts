import { readFileSync } from 'node:fs'
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { inspectImage } from '../shared/image-content'
import { WorkerUploader } from '../src/services/upload'

const png = readFileSync('tests/fixtures/athlete.png')
describe('image byte validation and optional uploader', () => {
  it.each([
    ['jpg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ])('validates a real browser encoded %s image', (extension, mime) => {
    const info = inspectImage(readFileSync(`tests/fixtures/athlete.${extension}`))
    expect(info.mime).toBe(mime)
    expect(info.width).toBe(680)
    expect(info.height).toBe(840)
  })
  it('rejects header-only JPEG/WebP and corrupt PNG content', () => {
    const jpeg = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 1, 0, 1, 0, 255, 217])
    const webp = new Uint8Array(30),
      view = new DataView(webp.buffer)
    webp.set(new TextEncoder().encode('RIFF'), 0)
    view.setUint32(4, 22, true)
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8)
    view.setUint32(16, 10, true)
    expect(() => inspectImage(jpeg)).toThrow()
    expect(() => inspectImage(webp)).toThrow()
    const corrupt = new Uint8Array(png)
    corrupt[corrupt.length - 1] = 0
    expect(() => inspectImage(corrupt)).toThrow()
  })
  it('checks real content and dimensions, rejects script bytes and truncated images', () => {
    expect(inspectImage(png).mime).toBe('image/png')
    expect(inspectImage(png).width).toBe(680)
    expect(() => inspectImage(new TextEncoder().encode('<svg onload="evil"/>'))).toThrow()
    expect(() => inspectImage(png.subarray(0, 32))).toThrow()
  })
  it('bounds bytes and pixel count before decode', () => {
    expect(() => inspectImage(new Uint8Array(8 * 1024 ** 2 + 1))).toThrow(/8/)
    const large = new Uint8Array(png)
    new DataView(large.buffer).setUint32(16, 50000)
    expect(() => inspectImage(large)).toThrow(/尺寸|像素/)
  })
  it('requires configured HTTPS endpoint and validates returned persistent URL', async () => {
    expect(() => new WorkerUploader('http://unsafe')).toThrow()
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ url: 'https://images.example.org/nodes/1/image.webp' }))
    const url = await new WorkerUploader('https://upload.example.org/upload', fetcher).upload(
      new Blob([png], { type: 'image/png' }),
      1,
    )
    expect(url).toContain('https://')
    expect(fetcher.mock.calls[0]![1].credentials).toBe('include')
    const hostile = vi.fn().mockResolvedValue(Response.json({ url: 'javascript:alert(1)' }))
    await expect(
      new WorkerUploader('https://upload.example.org/upload', hostile).upload(new Blob([png]), 1),
    ).rejects.toThrow()
  })
})
