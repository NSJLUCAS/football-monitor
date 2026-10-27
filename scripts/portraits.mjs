// Turns the site owner's portrait sources (design/portraits) into trimmed runtime WebP assets.
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const ids = ['arsenal', 'brazil', 'argentina', 'france', 'portugal']
mkdirSync('src/assets/portraits', { recursive: true })
for (const id of ids) {
  const out = `src/assets/portraits/${id}.webp`
  // Sources already have transparent backgrounds; trim the empty margin and cap the height.
  const trimmed = await sharp(`design/portraits/${id}.webp`)
    .ensureAlpha()
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
  const info = await sharp(trimmed)
    .resize({ height: 1400, withoutEnlargement: true })
    .webp({ quality: 84, alphaQuality: 90, effort: 6 })
    .toFile(out)
  console.log(`${out} ${info.width}x${info.height} ${info.size} bytes`)
}
