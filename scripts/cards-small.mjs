// Downscales every runtime card face (src/assets/cards) to the 400px wide copy that card grids and the
// skin picker load: a grid card is about 180px wide, so the 640px face is only needed on the detail page.
import { mkdirSync, readdirSync } from 'node:fs'
import sharp from 'sharp'

const dir = 'src/assets/cards'
mkdirSync(`${dir}/small`, { recursive: true })
for (const file of readdirSync(dir).filter((f) => f.endsWith('.webp')))
  await sharp(`${dir}/${file}`)
    .resize({ width: 400 })
    .webp({ quality: 80, alphaQuality: 90, effort: 6 })
    .toFile(`${dir}/small/${file}`)
