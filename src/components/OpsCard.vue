<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import type { CountryCard, NodeCard } from '../domain/ops'

/** The card beside the globe's reticle: one node in detail, or every node of a country to pick from. */
defineProps<{ card: { kind: 'node'; data: NodeCard } | { kind: 'country'; data: CountryCard } }>()
const emit = defineEmits<{ close: []; node: [id: number]; country: [code: string] }>()
</script>
<template>
  <section
    class="ops-card"
    :data-online="card.kind === 'node' ? card.data.state === 'ONLINE' : undefined"
    aria-live="polite"
  >
    <button type="button" class="oc-close" aria-label="关闭" @click="emit('close')"><X :size="14" /></button>
    <template v-if="card.kind === 'node'">
      <p class="oc-kicker">
        <span>{{ card.data.kicker }}</span
        ><span class="oc-state">{{ card.data.state }}</span>
      </p>
      <h3 class="oc-name">{{ card.data.name }}</h3>
      <p class="oc-sub">
        <img v-if="flagUrl(card.data.code)" class="oc-flag" :src="flagUrl(card.data.code)" alt="" />{{
          card.data.code ? countryName(card.data.code) : '未设置地区'
        }}
      </p>
      <div v-if="card.data.tags.length" class="oc-tags">
        <span v-for="(t, i) in card.data.tags" :key="i" class="oc-tag" :data-tone="t.tone"
          >{{ t.label }}<i>{{ t.value }}</i></span
        >
      </div>
      <div class="oc-metrics">
        <div v-for="m in card.data.metrics" :key="m.label" class="oc-metric">
          <span>{{ m.label }}</span
          ><strong
            >{{ m.value }}<small>{{ m.unit }}</small></strong
          >
        </div>
      </div>
      <div v-if="card.data.probes.length" class="oc-section">
        <h4>各检测线路延迟</h4>
        <div v-for="(p, i) in card.data.probes" :key="i" class="oc-latency" :data-level="p.level">
          <span :title="p.name">{{ p.name }}</span
          ><u><s :style="{ width: `${p.width}%` }" /></u><em>{{ p.ms === null ? '—' : `${p.ms} ms` }}</em>
        </div>
      </div>
      <div class="oc-actions">
        <button
          v-if="card.data.siblings > 1"
          type="button"
          class="oc-link"
          @click="emit('country', card.data.code)"
        >
          <ChevronLeft :size="14" />{{ countryName(card.data.code) }}的全部
          {{ card.data.siblings }} 台</button
        ><span v-else />
        <RouterLink class="oc-link" :to="`/node/${card.data.id}`"
          >打开详情页<ChevronRight :size="14"
        /></RouterLink>
      </div>
    </template>
    <template v-else>
      <p class="oc-kicker"><span>该区域的服务器</span></p>
      <h3 class="oc-name">
        <img v-if="flagUrl(card.data.code)" class="oc-flag" :src="flagUrl(card.data.code)" alt="" />{{
          countryName(card.data.code)
        }}
      </h3>
      <p class="oc-sub">
        {{ card.data.total }} 台 · {{ card.data.ok }} 正常 · {{ card.data.warn }} 有异常<template
          v-if="card.data.off"
        >
          · {{ card.data.off }} 离线</template
        >
      </p>
      <div class="oc-list">
        <button
          v-for="r in card.data.rows"
          :key="r.id"
          type="button"
          class="oc-row"
          :data-status="r.status"
          @click="emit('node', r.id)"
        >
          <i aria-hidden="true" /><span>{{ r.name }}</span
          ><em>{{ r.issue }}</em>
        </button>
      </div>
    </template>
  </section>
</template>
