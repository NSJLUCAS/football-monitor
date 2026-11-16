<script setup lang="ts">
import { useMonitorStore } from '../stores/monitor'
import { useGroupFilter } from '../services/filters'
// The group tabs under a page heading; the home, network and projects pages share the choice through `?group=`.
const store = useMonitorStore(),
  group = useGroupFilter()
</script>
<template>
  <div class="group-tabs" role="group" aria-label="节点分组">
    <button :class="{ selected: group === null }" :aria-pressed="group === null" @click="group = null">
      全部节点 <small>{{ store.nodes.length }}</small></button
    ><button
      v-for="g in store.groups"
      :key="g"
      :class="{ selected: group === g }"
      :aria-pressed="group === g"
      @click="group = g"
    >
      {{ g }}</button
    ><button
      v-if="store.groups.length && store.nodes.some((n) => !n.group)"
      :class="{ selected: group === '' }"
      :aria-pressed="group === ''"
      @click="group = ''"
    >
      未分组
    </button>
  </div>
</template>
