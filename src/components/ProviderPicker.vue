<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from '@lucide/vue'
import { safeImageUrl } from '../domain/config'
import { providers } from '../domain/providers'
import type { ProviderConfig } from '../domain/types'
import { WorkerUploader } from '../services/upload'
const props = defineProps<{ modelValue?: ProviderConfig; nodeId: number; endpoint: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: ProviderConfig | undefined] }>()
const error = ref(''),
  busy = ref(false)
function choose(id: string) {
  error.value = ''
  emit('update:modelValue', !id ? undefined : id === 'custom' ? { ...props.modelValue, id } : { id })
}
function custom(patch: Partial<ProviderConfig>) {
  const next: ProviderConfig = { ...props.modelValue, ...patch, id: 'custom' }
  if (!next.name) delete next.name
  if (!next.logo) delete next.logo
  emit('update:modelValue', next)
}
function logoInput(value: string | number) {
  const url = String(value).trim()
  error.value = url && !safeImageUrl(url) ? '仅接受公开 HTTPS 图片地址，不接受凭据或本地地址。' : ''
  if (!error.value) custom({ logo: url })
}
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !props.endpoint) return
  busy.value = true
  error.value = ''
  try {
    custom({ logo: await new WorkerUploader(props.endpoint).upload(file, props.nodeId) })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'LOGO 上传失败'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="provider-picker">
    <div class="form-field">
      <label for="provider-select">服务商</label
      ><select
        id="provider-select"
        :value="modelValue?.id ?? ''"
        @change="choose(($event.target as HTMLSelectElement).value)"
      >
        <option value="">未设置</option>
        <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
        <option value="custom">自定义（自己的名称和 LOGO）</option>
      </select>
      <p>显示在卡面底部国旗旁边。品牌标识归各自所有者，仅用于标明服务商。</p>
    </div>
    <template v-if="modelValue?.id === 'custom'">
      <div class="form-field">
        <label for="provider-name">服务商名称</label
        ><input
          id="provider-name"
          :value="modelValue.name ?? ''"
          maxlength="32"
          placeholder="例如：小鸡云"
          @change="custom({ name: ($event.target as HTMLInputElement).value.trim() })"
        />
      </div>
      <div class="form-field">
        <label for="provider-logo">LOGO 图片 URL</label
        ><input
          id="provider-logo"
          type="url"
          :value="modelValue.logo ?? ''"
          placeholder="https://images.example.com/logo.png"
          @change="logoInput(($event.target as HTMLInputElement).value)"
        />
        <p>推荐方形透明背景 PNG / WebP。没有 LOGO 时卡面显示名称。</p>
      </div>
      <label v-if="endpoint" class="provider-upload" :aria-busy="busy"
        ><Upload :size="14" />{{ busy ? '正在上传…' : '上传 LOGO'
        }}<input
          id="provider-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="sr-only"
          :disabled="busy"
          @change="upload"
      /></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </template>
  </div>
</template>
