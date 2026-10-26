<script setup lang="ts">
import { RouterLink } from 'vue-router'
defineProps<{ crumbs: { label: string; to?: string }[]; title: string; description?: string }>()
</script>
<template>
  <header class="page-head">
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
      <div v-if="$slots.default" class="page-head-actions"><slot /></div>
    </div>
    <div v-if="$slots.tabs" class="page-tabs"><slot name="tabs" /></div>
  </header>
</template>
