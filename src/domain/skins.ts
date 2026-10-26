import bronze from '../assets/cards/bronze.webp'
import frames from '../assets/cards/frames.json'
import gold from '../assets/cards/gold.webp'
import legend from '../assets/cards/legend.webp'
import pioneer from '../assets/cards/pioneer.webp'
import silver from '../assets/cards/silver.webp'
import weeklyBlack from '../assets/cards/weekly-black.webp'
import type { Tier } from './score'
import type { SkinId, TemplateId } from './types'

export interface Skin {
  id: SkinId
  name: string
  image: string
  kind: 'tier' | 'special'
  /** Primary text colour on this card face. */
  ink: string
  /** Group chip colours: [background, foreground]. */
  chip: [string, string]
  /** Text shadow for dark card faces. */
  shadow?: string
  /** Opaque frame box inside the 640x860 canvas, in percent. May include decorative side shards. */
  frame: { left: number; right: number; top: number; bottom: number }
  /** Percent of the canvas; inset is the horizontal distance from each canvas edge to the content area. */
  layout: { inset: number; ratingTop: number; portraitTop: number; nameTop: number }
}

export const skins: Skin[] = [
  {
    id: 'gold',
    name: '金卡',
    image: gold,
    kind: 'tier',
    ink: '#3b2a08',
    chip: ['#3b2a08', '#f6dc7a'],
    frame: frames.gold,
    layout: { inset: 13, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'silver',
    name: '银卡',
    image: silver,
    kind: 'tier',
    ink: '#1f2630',
    chip: ['#1f2630', '#e9edf2'],
    frame: frames.silver,
    layout: { inset: 13, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'bronze',
    name: '铜卡',
    image: bronze,
    kind: 'tier',
    ink: '#2a1408',
    chip: ['#2a1408', '#f1c39b'],
    frame: frames.bronze,
    layout: { inset: 13, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'weekly-black',
    name: '周黑',
    image: weeklyBlack,
    kind: 'special',
    ink: '#f6d77d',
    chip: ['#f6d77d', '#141414'],
    shadow: '0 1px 2px rgba(0,0,0,.7)',
    frame: frames['weekly-black'],
    layout: { inset: 12, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'pioneer',
    name: '开拓者',
    image: pioneer,
    kind: 'special',
    ink: '#ffffff',
    chip: ['#d0142a', '#ffffff'],
    shadow: '0 1px 3px rgba(40,0,60,.9)',
    frame: frames.pioneer,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'legend',
    name: '传奇',
    image: legend,
    kind: 'special',
    ink: '#5a3e0c',
    chip: ['#d4a017', '#2a1d04'],
    frame: frames.legend,
    layout: { inset: 12, ratingTop: 18, portraitTop: 17, nameTop: 63 },
  },
]

const byId = new Map<string, Skin>(skins.map((s) => [s.id, s]))

export const isTemplate = (id: unknown): id is TemplateId =>
  id === 'auto' || (typeof id === 'string' && byId.has(id))
export const skinOf = (id: SkinId): Skin => byId.get(id)!
export const resolveSkin = (template: TemplateId, tier: Tier): Skin =>
  skinOf(template === 'auto' ? tier : template)

/** V1 template id -> [node scope, global scope]. Global classic-gold becomes auto: V1 shipped it as the default. */
const LEGACY: Record<string, [TemplateId, TemplateId]> = {
  'classic-gold': ['gold', 'auto'],
  'black-elite': ['weekly-black', 'weekly-black'],
  'white-icon': ['legend', 'legend'],
  'blue-europe': ['auto', 'auto'],
  'minimal-carbon': ['auto', 'auto'],
}

export function migrateTemplate(value: unknown, scope: 'global' | 'node'): TemplateId | undefined {
  if (isTemplate(value)) return value
  if (typeof value === 'string' && Object.hasOwn(LEGACY, value))
    return LEGACY[value]![scope === 'node' ? 0 : 1]
  return undefined
}
