// Turns the site owner's carrier logos (design/carriers) into trimmed small WebP assets.
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const ids = ['telecom', 'unicom', 'mobile']
mkdirSync('src/assets/carriers', { recursive: true })
for (const id of ids) {
  const out = `src/assets/carriers/${id}.webp`
  // Sources already have transparent backgrounds; trim the empty margin and cap the size.
  const trimmed = await sharp(`design/carriers/${id}.webp`)
    .ensureAlpha()
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
  const info = await sharp(trimmed)
    .resize({ width: 128, height: 128, fit: 'inside' })
    .webp({ quality: 90, alphaQuality: 95, effort: 6 })
    .toFile(out)
  console.log(`${out} ${info.width}x${info.height} ${info.size} bytes`)
}
