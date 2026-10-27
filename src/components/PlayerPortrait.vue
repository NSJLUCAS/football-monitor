<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { safeImageUrl } from '../domain/config'
import type { PortraitConfig } from '../domain/types'
import { portraitClipRect, portraitPlacement, portraitTransform } from '../domain/portrait'
import { resolvePortrait } from '../domain/portraits'
const props = defineProps<{ portrait?: PortraitConfig; preview?: string; fallback?: string }>()
const failed = ref(false)
const loaded = ref(false),
  clip = useId().replace(/:/g, '')
watch([() => props.portrait?.url, () => props.preview], () => {
  failed.value = false
  loaded.value = false
})
// A bound image that fails or is unsafe falls back to the node's built-in portrait.
const drawn = computed(() => {
  const portrait = props.portrait
  const usable = !failed.value && (props.preview || (portrait?.url && safeImageUrl(portrait.url)))
  return resolvePortrait(
    usable ? portrait : portrait && { ...portrait, url: undefined },
    props.fallback ?? '',
    usable ? props.preview : undefined,
  )
})
const config = computed(() => drawn.value.config)
</script>
<template>
  <div class="portrait-layer" :class="{ 'portrait-upper': config.area === 'upper' }" aria-hidden="true">
    <svg
      v-if="!config.hidden"
      class="portrait-canvas"
      viewBox="-200 -250 1200 1500"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath :id="clip"><rect v-bind="portraitClipRect(config)" /></clipPath>
      </defs>
      <g :clip-path="`url(#${clip})`">
        <image
          :class="drawn.kind === 'custom' ? 'custom-portrait' : 'default-portrait'"
          :href="drawn.src"
          :data-portrait="drawn.kind === 'builtin' ? drawn.id : drawn.kind"
          v-bind="portraitPlacement(config)"
          :preserveAspectRatio="`xMidYMid ${config.fit === 'cover' ? 'slice' : 'meet'}`"
          :transform="portraitTransform(config)"
          :data-loaded="loaded"
          @load="loaded = true"
          @error="drawn.kind === 'custom' && (failed = true)"
        />
      </g>
    </svg>
  </div>
</template>
