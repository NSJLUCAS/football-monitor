<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { STAT_KEYS, STAT_LABELS, statReadings, type NodeScore, type Tier } from '../domain/score'
import { resolveSkin } from '../domain/skins'
import { lineSkills } from '../domain/carriers'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import { osBadge, providerOf, type BrandIcon } from '../domain/providers'
import type { MonitorNode, TemplateId, ThemeConfig } from '../domain/types'
import PlayerPortrait from './PlayerPortrait.vue'
import { cardPortraitBox } from '../domain/portrait'
import { autoPortrait } from '../domain/portraits'
const props = withDefaults(
  defineProps<{
    node: MonitorNode
    config: ThemeConfig
    score: NodeScore
    tier: Tier
    size?: 'sm' | 'lg'
    interactive?: boolean
    portraitPreview?: string
    templateOverride?: TemplateId
  }>(),
  { size: 'sm', interactive: true, portraitPreview: undefined, templateOverride: undefined },
)
const settings = computed(() => props.config.nodes[String(props.node.id)])
const skin = computed(() =>
  resolveSkin(
    props.templateOverride ?? settings.value?.template ?? props.config.default_template,
    props.tier,
  ),
)
const rating = computed(() =>
  !props.node.online ? 'OFF' : props.score.overall === null ? '—' : String(props.score.overall),
)
// While an online card waits for its first score the digits spin like a counter; when it arrives they
// stop on it, units last. Scores known at mount and later changes show at once.
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const phase = ref<'spin' | 'stop' | null>(rating.value === '—' ? 'spin' : null)
watch(rating, (now) => {
  if (phase.value === 'spin') phase.value = /^\d+$/.test(now) ? 'stop' : now === '—' ? 'spin' : null
})
const rolling = computed(() => (props.config.motion && !reduced ? phase.value : null))
const digits = computed(() => (rolling.value === 'spin' ? ['0', '0'] : [...rating.value]))
const stats = computed(() => {
  const readings = statReadings(props.node, props.score)
  return STAT_KEYS.map((key) => ({ key, label: STAT_LABELS[key], ...readings[key] }))
})
const skills = computed(() => lineSkills(settings.value))
interface Crest {
  kind: 'flag' | 'provider' | 'os'
  title: string
  image?: string
  icon?: BrandIcon
  text?: string
}
// FC's nation / league / club row becomes country flag, VPS provider and operating system.
const crests = computed(() => {
  const list: Crest[] = [],
    code = props.node.country,
    provider = settings.value?.provider,
    os = osBadge(props.node.os)
  if (code)
    list.push({ kind: 'flag', title: countryName(code), image: flagUrl(code), text: code.toUpperCase() })
  if (provider?.id === 'custom')
    list.push({
      kind: 'provider',
      title: provider.name || '自定义服务商',
      image: provider.logo,
      text: provider.name,
    })
  else {
    const known = providerOf(provider?.id)
    if (known)
      list.push({
        kind: 'provider',
        title: known.name,
        image: known.image,
        icon: known.icon,
        text: known.short,
      })
  }
  if (os) list.push({ kind: 'os', title: os.name, icon: os.icon, text: os.short })
  return list
})
const style = computed(() => {
  const { inset, ratingTop, portraitTop, nameTop } = skin.value.layout
  const box = cardPortraitBox({ inset, portraitTop })
  return {
    '--ink': skin.value.ink,
    '--chip-bg': skin.value.chip[0],
    '--chip-fg': skin.value.chip[1],
    '--ink-shadow': skin.value.shadow ?? 'none',
    '--inset': `${inset}%`,
    '--rating-top': `${ratingTop}%`,
    '--art-top': `${skin.value.frame.top + 2}%`,
    '--portrait-left': `${box.left}%`,
    '--portrait-top': `${box.top}%`,
    '--portrait-width': `${box.width}%`,
    '--portrait-height': `${box.height}%`,
    '--name-top': `${nameTop}%`,
  }
})
</script>
<template>
  <article
    class="player-card"
    :class="{ 'card-offline': !node.online, 'card-interactive': interactive }"
    :data-skin="skin.id"
    :data-size="size"
    :style="style"
    :aria-label="`${node.name} ${node.online ? '在线' : '离线'} 综合 ${score.overall ?? '无数据'}`"
  >
    <img class="pc-face" :src="skin.image" alt="" loading="lazy" decoding="async" draggable="false" />
    <div class="pc-art">
      <div class="pc-portrait">
        <PlayerPortrait
          :portrait="settings?.portrait"
          :preview="portraitPreview"
          :fallback="autoPortrait(node.id)"
        />
      </div>
    </div>
    <div class="pc-text">
      <div class="pc-meta">
        <span class="pc-rating" :class="{ 'pc-rating-roll': rolling }"
          ><template v-if="rolling"
            ><span class="sr-only">{{ rating }}</span
            ><span class="pc-roll" :data-phase="rolling" aria-hidden="true"
              ><span
                v-for="(digit, i) in digits"
                :key="i"
                class="pc-roll-digit"
                :style="{ '--d': digit, '--n': i }"
                ><span
                  class="pc-roll-strip"
                  @animationend="rolling === 'stop' && i === digits.length - 1 && (phase = null)"
                  ><span v-for="k in 20" :key="k">{{ (k - 1) % 10 }}</span></span
                ></span
              ></span
            ></template
          ><template v-else>{{ rating }}</template></span
        >
        <span class="pc-position">{{ node.country || '—' }}</span>
      </div>
      <ul v-if="skills.length" class="pc-skills" aria-label="线路">
        <li
          v-for="skill in skills"
          :key="skill.line"
          class="pc-skill"
          :data-carrier="skill.carrier"
          :title="`${skill.name} · ${skill.line}`"
          :style="{ '--carrier': skill.color }"
        >
          {{ skill.line }}
        </li>
      </ul>
      <div class="pc-chips">
        <span v-if="!node.online" class="pc-offline-tag">离线</span>
      </div>
      <h2 class="pc-name" :title="node.name">{{ node.name }}</h2>
      <dl class="pc-stats">
        <div v-for="stat in stats" :key="stat.key" class="pc-stat">
          <dt class="pc-stat-label">{{ stat.label }}</dt>
          <dd
            class="pc-stat-value"
            :data-grade="stat.grade ?? undefined"
            :data-long="stat.value.length > 2 || undefined"
          >
            {{ stat.value }}<span v-if="stat.unit" class="pc-stat-unit">{{ stat.unit }}</span>
          </dd>
        </div>
      </dl>
      <div v-if="crests.length" class="pc-crests">
        <span
          v-for="crest in crests"
          :key="crest.kind"
          class="pc-crest"
          :data-kind="crest.kind"
          :title="crest.title"
          ><img v-if="crest.image" :src="crest.image" alt="" draggable="false" /><svg
            v-else-if="crest.icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path :d="crest.icon.path" :fill="`#${crest.icon.hex}`" /></svg
          ><span v-else class="pc-crest-text">{{ crest.text }}</span></span
        >
      </div>
    </div>
  </article>
</template>
