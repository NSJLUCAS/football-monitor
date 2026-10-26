export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export interface ImageInfo {
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  extension: 'png' | 'jpg' | 'webp'
  width: number
  height: number
}
function requireContent(condition: unknown, message = '图片内容结构损坏或不完整'): asserts condition {
  if (!condition) throw new Error(message)
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('图片不能超过 8 MiB')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length))
  const checked = (
    mime: ImageInfo['mime'],
    extension: ImageInfo['extension'],
    width: number,
    height: number,
  ): ImageInfo => {
    requireContent(
      width >= 1 && height >= 1 && width <= 10000 && height <= 10000 && width * height <= 24000000,
      '图片尺寸或像素数过大（最大 24MP，单边 10000px）',
    )
    return { mime, extension, width, height }
  }
  if (
    bytes.length >= 45 &&
    bytes[0] === 137 &&
    ascii(1, 3) === 'PNG' &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10 &&
    ascii(12, 4) === 'IHDR' &&
    view.getUint32(8) === 13
  ) {
    const info = checked('image/png', 'png', view.getUint32(16), view.getUint32(20))
    const depths: Record<number, number[]> = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16],
    }
    requireContent(
      depths[bytes[25]!]?.includes(bytes[24]!) && bytes[26] === 0 && bytes[27] === 0 && bytes[28]! <= 1,
    )
    let position = 8,
      dataBytes = 0,
      ended = false,
      sawHeader = false
    while (position + 12 <= bytes.length) {
      const length = view.getUint32(position),
        type = ascii(position + 4, 4)
      requireContent(length <= bytes.length - position - 12 && /^[A-Za-z]{4}$/.test(type))
      requireContent(
        crc32(bytes.subarray(position + 4, position + 8 + length)) === view.getUint32(position + 8 + length),
        'PNG 校验和错误',
      )
      if (type === 'IHDR') {
        requireContent(!sawHeader && position === 8 && length === 13)
        sawHeader = true
      }
      if (type === 'IDAT') dataBytes += length
      if (type[0] === type[0]!.toUpperCase())
        requireContent(['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type), '不支持的 PNG 关键块')
      position += length + 12
      if (type === 'IEND') {
        ended = length === 0 && position === bytes.length
        break
      }
    }
    requireContent(dataBytes > 6 && ended, 'PNG 缺少完整图像数据')
    return info
  }
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216) {
    let position = 2,
      info: ImageInfo | undefined,
      quantized = false,
      huffman = false,
      scans = 0
    const components = new Set<number>()
    while (position + 1 < bytes.length) {
      requireContent(bytes[position] === 255)
      while (bytes[position] === 255) position++
      const marker = bytes[position++]!
      if (marker === 217) {
        requireContent(
          position === bytes.length && info && quantized && huffman && scans > 0,
          'JPEG 缺少图像扫描数据',
        )
        return info
      }
      requireContent(
        marker !== 0 && marker !== 216 && !(marker >= 208 && marker <= 215) && position + 2 <= bytes.length,
      )
      const size = view.getUint16(position),
        end = position + size,
        start = position + 2
      requireContent(size >= 2 && end <= bytes.length)
      if (marker === 192 || marker === 194) {
        requireContent(!info && size >= 11 && bytes[start] === 8)
        const count = bytes[start + 5]!
        requireContent([1, 3, 4].includes(count) && size === 8 + 3 * count)
        info = checked('image/jpeg', 'jpg', view.getUint16(start + 3), view.getUint16(start + 1))
        for (let c = 0; c < count; c++) {
          const id = bytes[start + 6 + c * 3]!
          requireContent(!components.has(id))
          components.add(id)
        }
      } else if (marker === 219) {
        let cursor = start
        while (cursor < end) {
          const precision = bytes[cursor]! >>> 4
          requireContent(precision <= 1 && (bytes[cursor]! & 15) <= 3)
          cursor += 1 + 64 * (precision + 1)
          requireContent(cursor <= end)
        }
        quantized = true
      } else if (marker === 196) {
        let cursor = start
        while (cursor < end) {
          requireContent(cursor + 17 <= end && bytes[cursor]! >>> 4 <= 1 && (bytes[cursor]! & 15) <= 3)
          const count = bytes.subarray(cursor + 1, cursor + 17).reduce((sum, n) => sum + n, 0)
          requireContent(count > 0 && count <= 256 && cursor + 17 + count <= end)
          cursor += 17 + count
        }
        huffman = true
      } else if (marker === 218) {
        const count = bytes[start]!
        requireContent(
          info && quantized && huffman && count >= 1 && count <= components.size && size === 6 + 2 * count,
        )
        for (let c = 0; c < count; c++) requireContent(components.has(bytes[start + 1 + c * 2]!))
        position = end
        let entropyBytes = 0
        while (position < bytes.length) {
          if (bytes[position] !== 255) {
            position++
            entropyBytes++
            continue
          }
          const next = bytes[position + 1]
          if (next === 0 || (next !== undefined && next >= 208 && next <= 215)) {
            position += 2
            entropyBytes++
            continue
          }
          break
        }
        requireContent(entropyBytes > 0, 'JPEG 扫描数据为空')
        scans++
        continue
      } else if (marker >= 193 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        throw new Error('仅支持常见 8-bit baseline / progressive JPEG')
      }
      position = end
    }
    throw new Error('JPEG 文件不完整')
  }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    requireContent(view.getUint32(4, true) + 8 === bytes.length, 'WebP 容器长度不一致')
    let position = 12,
      canvas: ImageInfo | undefined,
      image: ImageInfo | undefined
    while (position + 8 <= bytes.length) {
      const kind = ascii(position, 4),
        size = view.getUint32(position + 4, true),
        data = position + 8
      requireContent(size <= bytes.length - data)
      if (kind === 'VP8X') {
        requireContent(
          !canvas &&
            position === 12 &&
            size === 10 &&
            !(bytes[data]! & 0xc3) &&
            bytes[data + 1] === 0 &&
            bytes[data + 2] === 0 &&
            bytes[data + 3] === 0,
          '不支持动画或损坏的 WebP 头部',
        )
        const uint24 = (offset: number) =>
          1 + bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65536
        canvas = checked('image/webp', 'webp', uint24(data + 4), uint24(data + 7))
      } else if (kind === 'VP8 ') {
        requireContent(
          !image && size > 10 && ascii(data + 3, 3) === '\x9d\x01\x2a' && !(bytes[data]! & 1),
          'WebP 缺少有效图像载荷',
        )
        const partition = (view.getUint32(data, true) & 0xffffff) >>> 5
        requireContent(partition > 0 && partition + 3 <= size)
        image = checked(
          'image/webp',
          'webp',
          view.getUint16(data + 6, true) & 16383,
          view.getUint16(data + 8, true) & 16383,
        )
      } else if (kind === 'VP8L') {
        requireContent(!image && size >= 8 && bytes[data] === 47, 'WebP 缺少无损图像载荷')
        const bits = view.getUint32(data + 1, true)
        requireContent(bits >>> 29 === 0)
        image = checked('image/webp', 'webp', 1 + (bits & 16383), 1 + ((bits >>> 14) & 16383))
      } else requireContent(['ALPH', 'ICCP', 'EXIF', 'XMP '].includes(kind), '不支持的 WebP 块或动画')
      position = data + size + (size & 1)
      requireContent(position <= bytes.length)
    }
    requireContent(image && position === bytes.length, 'WebP 缺少图像载荷或容器尾部损坏')
    if (canvas)
      requireContent(canvas.width === image.width && canvas.height === image.height, 'WebP 尺寸不一致')
    return image
  }
  throw new Error('文件内容不是有效的 PNG、JPG 或 WebP 图片')
}
