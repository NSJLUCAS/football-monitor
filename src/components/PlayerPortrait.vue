<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { DEFAULT_PORTRAIT, safeImageUrl } from '../domain/config'
import type { PortraitConfig } from '../domain/types'
import { portraitClipRect, portraitPlacement, portraitTransform } from '../domain/portrait'
const props = defineProps<{ portrait?: PortraitConfig; preview?: string }>()
const failed = ref(false)
const loaded = ref(false),
  clip = useId().replace(/:/g, '')
watch([() => props.portrait?.url, () => props.preview], () => {
  failed.value = false
  loaded.value = false
})
const config = computed(() => props.portrait || DEFAULT_PORTRAIT)
const custom = computed(
  () =>
    !failed.value &&
    (props.preview || (props.portrait?.url && safeImageUrl(props.portrait.url) ? props.portrait.url : '')),
)
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
          :class="custom ? 'custom-portrait' : 'default-portrait'"
          :href="custom || '/athlete.svg'"
          v-bind="portraitPlacement(config)"
          :preserveAspectRatio="`xMidYMid ${config.fit === 'cover' ? 'slice' : 'meet'}`"
          :transform="portraitTransform(config)"
          :data-loaded="loaded"
          @load="loaded = true"
          @error="failed = true"
        />
      </g>
    </svg>
  </div>
</template>
