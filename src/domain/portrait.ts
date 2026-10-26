import type { PortraitConfig } from './types'
export const PORTRAIT_WIDTH = 800
export const PORTRAIT_HEIGHT = 1000
/** The 800x1000 reference frame plus a 25% margin on every side: still 4:5. */
export const PORTRAIT_BLEED = { x: -200, y: -250, width: 1200, height: 1500 }
const CARD_ASPECT = 640 / 860
export const portraitClipRect = (config: PortraitConfig) => ({
  ...PORTRAIT_BLEED,
  height: config.area === 'upper' ? 720 - PORTRAIT_BLEED.y : PORTRAIT_BLEED.height,
})
export const portraitPlacement = (config: PortraitConfig) =>
  config.box === 'bleed'
    ? { ...PORTRAIT_BLEED }
    : { x: 0, y: 0, width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT }
export const portraitTransform = (config: PortraitConfig) =>
  `translate(${400 + config.x * 8} ${500 + config.y * 10}) scale(${config.scale}) translate(-400 -500)`
/** Bleed box in card percentages, centred on the 4:5 reference frame of a skin layout. */
export function cardPortraitBox(layout: { inset: number; portraitTop: number }) {
  const width = (100 - 2 * layout.inset) * 0.64,
    height = width * CARD_ASPECT * (PORTRAIT_HEIGHT / PORTRAIT_WIDTH),
    left = 100 - layout.inset - (100 - 2 * layout.inset) * 0.06 - width,
    scale = PORTRAIT_BLEED.width / PORTRAIT_WIDTH
  return {
    left: left - (width * (scale - 1)) / 2,
    top: layout.portraitTop - (height * (scale - 1)) / 2,
    width: width * scale,
    height: height * scale,
  }
}
export function portraitBounds(width: number, height: number, config: PortraitConfig) {
  const factor =
    (config.fit === 'cover' ? Math.max : Math.min)(PORTRAIT_WIDTH / width, PORTRAIT_HEIGHT / height) *
    config.scale
  const w = width * factor,
    h = height * factor
  return {
    x: (PORTRAIT_WIDTH - w) / 2 + config.x * 8,
    y: (PORTRAIT_HEIGHT - h) / 2 + config.y * 10,
    width: w,
    height: h,
  }
}
