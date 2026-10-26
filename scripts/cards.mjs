// Normalises the site owner's card sources (design/cards) into uniform 640x860 runtime assets.
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const W = 640,
  H = 860,
  CARD_H = 840,
  TOP = 10
const src = (id) => `design/cards/${id}.webp`
const out = (name) => `src/assets/cards/${name}.webp`
const webp = { quality: 82, alphaQuality: 90, effort: 6 }

async function bbox(input, threshold = 128) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width,
    right = -1,
    top = info.height,
    bottom = -1
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > threshold) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
  if (right < 0) throw new Error('没有不透明像素')
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

// Crop to the frame body, scale to CARD_H tall, centre on a transparent canvas (overflow is clipped).
async function normalise(id) {
  const box = await bbox(src(id))
  const scaled = await sharp(src(id)).ensureAlpha().extract(box).resize({ height: CARD_H }).png().toBuffer()
  const { width } = await sharp(scaled).metadata()
  const input =
    width > W
      ? await sharp(scaled)
          .extract({ left: Math.round((width - W) / 2), top: 0, width: W, height: CARD_H })
          .png()
          .toBuffer()
      : scaled
  const left = Math.max(0, Math.round((W - width) / 2))
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input, left, top: TOP }])
    .png()
    .toBuffer()
}

// Recolour RGB only, then re-attach the original alpha so edges stay clean.
async function recolour(png, apply) {
  const alpha = await sharp(png).ensureAlpha().extractChannel(3).toBuffer()
  const rgb = await apply(sharp(png).removeAlpha()).png().toBuffer()
  return sharp(rgb).joinChannel(alpha).png().toBuffer()
}

const frames = {}
async function emit(name, png, options = webp) {
  await sharp(png).webp(options).toFile(out(name))
  const box = await bbox(png),
    pct = (v, total) => Math.round((v / total) * 1000) / 10
  frames[name] = {
    left: pct(box.left, W),
    right: pct(box.left + box.width, W),
    top: pct(box.top, H),
    bottom: pct(box.top + box.height, H),
  }
}

mkdirSync('src/assets/cards', { recursive: true })
const gold = await normalise('gold')
await emit('gold', gold)
await emit(
  'silver',
  await recolour(gold, (s) => s.greyscale().modulate({ brightness: 1.15 }).linear(1.05, -6)),
)
// Bronze: desaturate first, then multiply by copper per-channel gains (darker and redder than gold).
const grey = await recolour(gold, (s) => s.greyscale().toColourspace('srgb'))
await emit('bronze', await recolour(grey, (s) => s.linear([1.0, 0.62, 0.36], [0, 0, 0])))
await emit('weekly-black', await normalise('weekly-black'))
await emit('pioneer', await normalise('pioneer'), { ...webp, quality: 76 }) // over 150 KiB at quality 82
await emit('legend', await normalise('legend'))
writeFileSync('src/assets/cards/frames.json', JSON.stringify(frames, null, 2) + '\n')
console.log(frames)
