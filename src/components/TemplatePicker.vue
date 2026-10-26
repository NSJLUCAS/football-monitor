<script setup lang="ts">
import { Check, RotateCcw } from '@lucide/vue'
import { skinOf, skins } from '../domain/skins'
import type { TemplateId } from '../domain/types'
defineProps<{ modelValue?: TemplateId; inherit?: boolean }>()
defineEmits<{ 'update:modelValue': [value: TemplateId | undefined] }>()
const options: { id: TemplateId; name: string }[] = [
  { id: 'auto', name: '自动（按评分）' },
  ...skins.map((s) => ({ id: s.id, name: s.name })),
]
const stack = (['gold', 'silver', 'bronze'] as const).map((id) => skinOf(id).image)
</script>
<template>
  <div class="template-picker">
    <button
      v-if="inherit"
      type="button"
      class="inherit-option"
      :class="{ chosen: !modelValue }"
      :aria-pressed="!modelValue"
      @click="$emit('update:modelValue', undefined)"
    >
      <RotateCcw :size="14" /><span>继承全局卡面</span><Check v-if="!modelValue" :size="14" />
    </button>
    <div class="template-options">
      <button
        v-for="t in options"
        :key="t.id"
        type="button"
        class="template-option"
        :class="{ chosen: modelValue === t.id }"
        :aria-label="`选择${t.name}`"
        :aria-pressed="modelValue === t.id"
        @click="$emit('update:modelValue', t.id)"
      >
        <span v-if="t.id === 'auto'" class="skin-thumb-stack" aria-hidden="true">
          <img v-for="(src, i) in stack" :key="i" class="skin-thumb" :src="src" alt="" />
        </span>
        <img v-else class="skin-thumb" :src="skinOf(t.id).image" alt="" />
        <span class="template-name">{{ t.name }}</span
        ><span v-if="modelValue === t.id" class="template-check"><Check :size="12" /></span>
      </button>
    </div>
  </div>
</template>
