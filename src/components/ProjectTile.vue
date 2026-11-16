<script setup lang="ts">
import { KIND_LABEL, tileHue, tileLetter } from '../domain/projects'
import type { ProjectConfig } from '../domain/types'
defineProps<{ project: ProjectConfig }>()
</script>
<template>
  <div class="pj-item" :title="project.note">
    <i class="pj-tile" :style="{ '--h': tileHue(project.name) }" aria-hidden="true">{{
      tileLetter(project.name)
    }}</i><span class="pj-text"
      ><b>{{ project.name }}</b
      ><small>{{ project.note || KIND_LABEL[project.kind] }}</small></span
    >
  </div>
</template>
