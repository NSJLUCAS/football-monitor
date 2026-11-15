<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import { PROJECT_KINDS, PROJECT_LIMITS, validProjects } from '../domain/config'
import { KIND_LABEL } from '../domain/projects'
import type { ProjectConfig } from '../domain/types'
import { Button } from './ui/button'
const props = defineProps<{ modelValue: ProjectConfig[] | undefined; nodeId: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: ProjectConfig[]] }>()
const list = computed(() => props.modelValue ?? [])
const full = computed(() => list.value.length >= PROJECT_LIMITS.perNode)
// The same check saving runs, shown early; typing is never blocked by it.
const problem = computed(() => {
  try {
    validProjects(list.value, true)
    return ''
  } catch (e) {
    return e instanceof Error ? e.message : '项目列表不合法'
  }
})
function change(index: number, key: 'name' | 'kind' | 'note', value: string) {
  emit(
    'update:modelValue',
    list.value.map((p, i) => {
      if (i !== index) return p
      const next = { ...p, [key]: value } as ProjectConfig
      // An empty note stays out of the saved config.
      return { name: next.name, kind: next.kind, ...(next.note ? { note: next.note } : {}) }
    }),
  )
}
const add = () => emit('update:modelValue', [...list.value, { name: '', kind: 'site' }])
const remove = (index: number) =>
  emit(
    'update:modelValue',
    list.value.filter((_, i) => i !== index),
  )
</script>
<template>
  <div class="projects-editor">
    <div class="settings-callout">
      <strong>项目名称、类型与备注对所有访客公开。</strong>
      <p>不要填写网址、端口、内网地址、后台入口或任何密钥。定时任务的执行时间可以写在备注里。</p>
    </div>
    <div v-for="(p, i) in list" :key="i" class="project-row">
      <select
        :value="p.kind"
        aria-label="项目类型"
        @change="change(i, 'kind', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="k in PROJECT_KINDS" :key="k" :value="k">{{ KIND_LABEL[k] }}</option>
      </select>
      <input
        :id="`project-${nodeId}-${i}-name`"
        :value="p.name"
        aria-label="项目名称"
        placeholder="名称"
        :maxlength="PROJECT_LIMITS.name"
        @input="change(i, 'name', ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="p.note ?? ''"
        aria-label="项目备注"
        :placeholder="p.kind === 'cron' ? '执行时间与内容，如 每天 04:00 备份' : '备注（可选）'"
        :maxlength="PROJECT_LIMITS.note"
        @input="change(i, 'note', ($event.target as HTMLInputElement).value)"
      />
      <Button
        variant="ghost"
        size="icon"
        :aria-label="`删除项目 ${p.name || i + 1}`"
        title="删除"
        @click="remove(i)"
        ><Trash2 :size="15"
      /></Button>
    </div>
    <p v-if="problem" class="form-error" role="alert">{{ problem }}</p>
    <div class="project-actions">
      <Button variant="outline" size="sm" :disabled="full" @click="add"><Plus :size="13" />添加项目</Button
      ><span v-if="full" class="form-help">每台机器最多 {{ PROJECT_LIMITS.perNode }} 个项目</span>
    </div>
  </div>
</template>
