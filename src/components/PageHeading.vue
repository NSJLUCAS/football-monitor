<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, ref, useSlots } from 'vue'
import { RouterLink } from 'vue-router'
defineProps<{ crumbs: { label: string; to?: string }[]; title: string; description?: string }>()
const slots = useSlots()
const head = ref<HTMLElement>(),
  aside = ref<HTMLElement>(),
  asideFits = ref(true)
let observer: ResizeObserver | null = null
// The aside sits at the bottom right, beside the tabs; drop it when the last tab would run under it.
function place() {
  const box = head.value?.getBoundingClientRect()
  if (!box) return
  const tabs = [...head.value!.querySelectorAll('.page-tabs button, .page-tabs a')].map(
    (el) => el.getBoundingClientRect().right - box.left,
  )
  const width = aside.value?.offsetWidth || 220
  asideFits.value = Math.max(0, ...tabs) + 24 <= box.width - width
}
onMounted(() => {
  if (!slots.aside || typeof ResizeObserver !== 'function') return
  observer = new ResizeObserver(place)
  observer.observe(head.value!)
  head.value!.querySelectorAll('.page-tabs').forEach((el) => observer!.observe(el))
  place()
})
// Tabs arrive with the node list, after the heading has mounted.
onUpdated(() => observer && place())
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <header ref="head" class="page-head">
    <div class="page-head-main">
      <div class="page-head-text">
        <nav class="page-crumbs" aria-label="面包屑">
          <template v-for="(crumb, i) in crumbs" :key="i">
            <span v-if="i" class="page-crumb-sep" aria-hidden="true">›</span>
            <RouterLink v-if="crumb.to" :to="crumb.to">{{ crumb.label }}</RouterLink>
            <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ crumb.label }}</span>
          </template>
        </nav>
        <h1>{{ title }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.aside && asideFits" ref="aside" class="page-head-aside">
        <slot name="aside" />
      </div>
      <div v-if="$slots.default" class="page-head-actions"><slot /></div>
    </div>
    <div v-if="$slots.tabs" class="page-tabs"><slot name="tabs" /></div>
  </header>
</template>
