import sharp from 'sharp'
import { readFileSync } from 'node:fs'

// iOS fills transparency with black, so the touch icon gets the opaque dark theme ground.
const mark = await sharp(readFileSync('public/favicon.svg'), { density: 1200 })
  .resize(144, 144)
  .png()
  .toBuffer()
await sharp({ create: { width: 180, height: 180, channels: 3, background: '#14161c' } })
  .composite([{ input: mark, top: 18, left: 18 }])
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile('public/apple-touch-icon.png')
console.log('public/apple-touch-icon.png 180×180')
