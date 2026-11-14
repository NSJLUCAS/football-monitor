<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink } from '@lucide/vue'
import { tileHue, tileLetter, urlHost } from '../domain/projects'
import type { ProjectConfig } from '../domain/types'
const props = defineProps<{ project: ProjectConfig }>()
// The link is only ever a link: nothing is fetched from the project's own site, not even an icon.
const sub = computed(() => urlHost(props.project.url) || props.project.note || '未填网址')
</script>
<template>
  <component
    :is="project.url ? 'a' : 'div'"
    class="pj-item"
    :href="project.url"
    :target="project.url ? '_blank' : undefined"
    :rel="project.url ? 'noopener noreferrer' : undefined"
    :title="project.note"
    ><i class="pj-tile" :style="{ '--h': tileHue(project.name) }" aria-hidden="true">{{
      tileLetter(project.name)
    }}</i
    ><span class="pj-text"
      ><b>{{ project.name }}</b
      ><small>{{ sub }}</small></span
    ><ExternalLink v-if="project.url" class="pj-out" :size="13" aria-hidden="true"
  /></component>
</template>
