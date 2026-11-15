<script setup lang="ts">
import { computed, ref } from 'vue'
import { Copy, Plus, Sparkles, Trash2 } from '@lucide/vue'
import { PROJECT_KINDS, PROJECT_LIMITS, validProjects } from '../domain/config'
import { KIND_LABEL } from '../domain/projects'
import { PROJECT_PROMPT, looksLikeAddress, mergeImported, parseProjectImport } from '../domain/projectImport'
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
const hasAddress = (text?: string) => !!text && looksLikeAddress(text)
// Asking an agent on the machine: the prompt goes out by copy, its answer comes back by paste.
const promptBox = ref<HTMLTextAreaElement>(),
  pasted = ref(''),
  importNote = ref(''),
  importError = ref('')
async function copyPrompt() {
  importError.value = ''
  try {
    await navigator.clipboard.writeText(PROJECT_PROMPT)
    importNote.value = '已复制提示词，发给能 SSH 到这台机器的 AI 助手。'
  } catch {
    promptBox.value?.select()
    importNote.value = '无法写入剪贴板，提示词已选中，请手动复制。'
  }
}
function runImport() {
  importNote.value = ''
  try {
    const result = mergeImported(list.value, parseProjectImport(pasted.value))
    importError.value = ''
    if (result.added) emit('update:modelValue', result.list)
    importNote.value = `新增 ${result.added} 项，跳过 ${result.skipped} 项。请检查后保存到 Hub。`
    pasted.value = ''
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '导入失败'
  }
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
    <details class="project-import">
      <summary><Sparkles :size="14" aria-hidden="true" />用 AI 查询这台机器</summary>
      <ol>
        <li>复制下面的提示词，发给能 SSH 到这台机器的 AI 助手（它只会查看，不会改动）。</li>
        <li>把它回复的 JSON 粘贴到下方，点“导入”。已有的项目不会被改动，同名的会跳过。</li>
        <li>检查导入的名称与备注，确认没有域名、IP 或端口后保存到 Hub。</li>
      </ol>
      <textarea
        ref="promptBox"
        class="project-prompt"
        :value="PROJECT_PROMPT"
        readonly
        rows="6"
        aria-label="提示词"
      />
      <div class="project-actions">
        <Button variant="outline" size="sm" @click="copyPrompt"><Copy :size="13" />复制提示词</Button>
      </div>
      <textarea
        v-model="pasted"
        class="project-paste"
        rows="4"
        aria-label="粘贴 AI 的结果"
        placeholder='[{"kind":"docker","name":"Alist","note":"网盘"}]'
      />
      <div class="project-actions">
        <Button size="sm" :disabled="!pasted.trim()" @click="runImport">导入</Button>
      </div>
      <p v-if="importError" class="form-error" role="alert">{{ importError }}</p>
      <p v-else-if="importNote" class="form-help" role="status">{{ importNote }}</p>
    </details>
    <div
      v-for="(p, i) in list"
      :key="i"
      class="project-row"
      :data-invalid="hasAddress(p.name) || hasAddress(p.note) || undefined"
    >
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
        :aria-invalid="hasAddress(p.name) || undefined"
        placeholder="名称"
        :maxlength="PROJECT_LIMITS.name"
        @input="change(i, 'name', ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="p.note ?? ''"
        aria-label="项目备注"
        :aria-invalid="hasAddress(p.note) || undefined"
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
