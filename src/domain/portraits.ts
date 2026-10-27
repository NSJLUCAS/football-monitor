import { DEFAULT_PORTRAIT } from './config'
import type { PortraitConfig } from './types'

/** Built-in portraits supplied by the site owner, bundled as separate WebP assets. */
const assets = import.meta.glob<string>('../assets/portraits/*.webp', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})
type Preset = Pick<PortraitConfig, 'scale' | 'x' | 'y'>
// Full-length figures: each preset zooms in so the head and torso fill the card's art area.
const entries: { id: string; label: string; preset: Preset }[] = [
  { id: 'arsenal', label: '红白跪地', preset: { scale: 1.4, x: 14, y: 36 } },
  { id: 'brazil', label: '黄衫庆祝', preset: { scale: 1.55, x: 8, y: 40 } },
  { id: 'argentina', label: '蓝白握拳', preset: { scale: 1.55, x: 8, y: 40 } },
  { id: 'france', label: '蓝衫抱臂', preset: { scale: 1.55, x: 8, y: 40 } },
  { id: 'portugal', label: '红衫跃起', preset: { scale: 1.55, x: 8, y: 40 } },
]
export const builtinPortraits = entries.map((e) => ({
  ...e,
  src: assets[`../assets/portraits/${e.id}.webp`]!,
}))
export const NEUTRAL_PORTRAIT = 'neutral'
export const NEUTRAL_SRC = '/athlete.svg'
export const isBuiltinPortrait = (id: unknown): id is string =>
  id === NEUTRAL_PORTRAIT || builtinPortraits.some((p) => p.id === id)

/** Nodes without a chosen portrait take the built-in ones in turn, by node id. */
export const autoPortrait = (nodeId: number) =>
  builtinPortraits[
    (((nodeId - 1) % builtinPortraits.length) + builtinPortraits.length) % builtinPortraits.length
  ]!.id

export type ResolvedPortrait =
  | { kind: 'custom'; src: string; config: PortraitConfig }
  | { kind: 'builtin'; id: string; src: string; config: PortraitConfig }
  | { kind: 'neutral'; src: string; config: PortraitConfig }
/**
 * What a card draws: a local preview, then the bound image, then the chosen built-in portrait (with the
 * owner's framing), else the automatic one with its own preset.
 */
export function resolvePortrait(
  portrait: PortraitConfig | undefined,
  fallback: string,
  preview?: string,
): ResolvedPortrait {
  const config = portrait ?? DEFAULT_PORTRAIT
  if (preview) return { kind: 'custom', src: preview, config }
  if (portrait?.url) return { kind: 'custom', src: portrait.url, config }
  if (portrait?.builtin === NEUTRAL_PORTRAIT) return { kind: 'neutral', src: NEUTRAL_SRC, config }
  const chosen = builtinPortraits.find((p) => p.id === portrait?.builtin)
  if (chosen) return { kind: 'builtin', id: chosen.id, src: chosen.src, config }
  const auto = builtinPortraits.find((p) => p.id === fallback)
  if (!auto) return { kind: 'neutral', src: NEUTRAL_SRC, config }
  return {
    kind: 'builtin',
    id: auto.id,
    src: auto.src,
    config: { ...config, ...auto.preset, box: undefined, fit: 'contain' },
  }
}
