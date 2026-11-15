<script setup lang="ts">
import { computed } from 'vue'
import { Clock, Container, Globe } from '@lucide/vue'
import { KIND_LABEL, kindGroups } from '../domain/projects'
import type { ProjectConfig } from '../domain/types'
import ProjectTile from './ProjectTile.vue'
const props = defineProps<{ projects: ProjectConfig[] }>()
const groups = computed(() => kindGroups(props.projects))
const icons = { docker: Container, site: Globe, cron: Clock }
</script>
<template>
  <div class="pj-groups">
    <div v-for="g in groups" :key="g.kind" class="pj-group" :data-kind="g.kind">
      <h3 class="pj-group-title">
        <component :is="icons[g.kind]" :size="13" aria-hidden="true" />{{ KIND_LABEL[g.kind] }}
        <small>{{ g.projects.length }}</small>
      </h3>
      <ul class="pj-list">
        <li v-for="p in g.projects" :key="p.name"><ProjectTile :project="p" /></li>
      </ul>
    </div>
  </div>
</template>
