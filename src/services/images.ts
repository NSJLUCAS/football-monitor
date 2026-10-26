import { inspectImage, MAX_IMAGE_BYTES } from '../../shared/image-content'
import type { PortraitConfig } from '../domain/types'
import { PORTRAIT_BLEED, portraitBounds, portraitClipRect } from '../domain/portrait'
export interface LocalImage {
  bitmap: ImageBitmap
  preview: string
  name: string
  release(): void
}
export async function loadLocalImage(file: File): Promise<LocalImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('图片不能超过 8 MiB')
  const info = inspectImage(new Uint8Array(await file.arrayBuffer()))
  if (file.type && file.type !== info.mime) throw new Error('文件类型与实际内容不一致')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('浏览器无法解码这张图片，请选择其他文件')
  }
  if (bitmap.width * bitmap.height > 24000000) {
    bitmap.close()
    throw new Error('解码后图片超过 24MP')
  }
  const preview = URL.createObjectURL(file)
  return {
    bitmap,
    preview,
    name: file.name,
    release: () => {
      bitmap.close()
      URL.revokeObjectURL(preview)
    },
  }
}
export async function exportPortrait(image: LocalImage, config: PortraitConfig): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = PORTRAIT_BLEED.width
  canvas.height = PORTRAIT_BLEED.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法编辑图片')
  const bounds = portraitBounds(image.bitmap.width, image.bitmap.height, config),
    clip = portraitClipRect(config)
  context.translate(-PORTRAIT_BLEED.x, -PORTRAIT_BLEED.y)
  context.beginPath()
  context.rect(clip.x, clip.y, clip.width, clip.height)
  context.clip()
  context.drawImage(image.bitmap, bounds.x, bounds.y, bounds.width, bounds.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('WebP 导出失败'))), 'image/webp', 0.86),
  )
  if (blob.type !== 'image/webp' || blob.size > MAX_IMAGE_BYTES)
    throw new Error('浏览器不支持 WebP 或导出文件超过限制')
  return blob
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
