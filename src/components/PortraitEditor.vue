<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Upload, Download, RotateCcw, ImagePlus, ExternalLink } from '@lucide/vue'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { DEFAULT_PORTRAIT, safeImageUrl } from '../domain/config'
import type { PortraitConfig } from '../domain/types'
import { loadLocalImage, exportPortrait, downloadBlob, type LocalImage } from '../services/images'
import { WorkerUploader } from '../services/upload'
import { builtinPortraits, NEUTRAL_PORTRAIT, NEUTRAL_SRC } from '../domain/portraits'
const props = defineProps<{ modelValue?: PortraitConfig; nodeId: number; endpoint: string }>()
const emit = defineEmits<{
  'update:modelValue': [value: PortraitConfig | undefined, nodeId: number]
  preview: [value: string | undefined, nodeId: number]
  unsaved: [value: boolean, nodeId: number]
}>()
const config = computed(() => props.modelValue || DEFAULT_PORTRAIT)
const local = shallowRef<LocalImage>(),
  error = ref(''),
  busy = ref(false),
  notice = ref(''),
  localSaved = ref(false),
  bindingMode = ref<'original' | 'processed'>('original')
let generation = 0
function update(patch: Partial<PortraitConfig>) {
  emit('update:modelValue', { ...config.value, ...patch }, props.nodeId)
  if (local.value && !localSaved.value) emit('unsaved', true, props.nodeId)
}
function clearLocal() {
  generation++
  local.value?.release()
  local.value = undefined
  localSaved.value = false
  busy.value = false
  emit('preview', undefined, props.nodeId)
  emit('unsaved', false, props.nodeId)
}
watch(
  () => props.nodeId,
  () => {
    clearLocal()
    error.value = ''
    notice.value = ''
  },
)
async function choose(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const epoch = ++generation
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    const image = await loadLocalImage(file)
    if (epoch !== generation) {
      image.release()
      return
    }
    local.value?.release()
    local.value = image
    localSaved.value = false
    bindingMode.value = 'original'
    emit('preview', image.preview, props.nodeId)
    emit('unsaved', true, props.nodeId)
    emit('update:modelValue', { ...config.value, hidden: false }, props.nodeId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法读取图片'
  } finally {
    if (epoch === generation) busy.value = false
    input.value = ''
  }
}
async function exportFile() {
  if (!local.value) return
  busy.value = true
  error.value = ''
  try {
    downloadBlob(
      await exportPortrait(local.value, config.value),
      `football-monitor-node-${props.nodeId}.webp`,
    )
    bindingMode.value = 'processed'
    notice.value = '已导出 WebP。请托管后绑定 HTTPS URL，再保存到 Hub。'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    busy.value = false
  }
}
async function upload() {
  if (!local.value || !props.endpoint) return
  const epoch = generation,
    nodeId = props.nodeId,
    portrait = { ...config.value }
  busy.value = true
  error.value = ''
  try {
    const url = await new WorkerUploader(props.endpoint).upload(
      await exportPortrait(local.value, portrait),
      nodeId,
    )
    if (epoch !== generation) return
    localSaved.value = true
    emit('update:modelValue', { ...DEFAULT_PORTRAIT, url, box: 'bleed' }, props.nodeId)
    clearLocal()
    notice.value = '图片已上传并关联当前草稿，请点击“保存到 Hub”完成持久配置。'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    if (epoch === generation) busy.value = false
  }
}
const builtinOptions = [
  { id: 'auto', label: '自动', src: '' },
  ...builtinPortraits,
  { id: NEUTRAL_PORTRAIT, label: '原创中性', src: NEUTRAL_SRC },
]
// Built-in art is used when no image is bound; "auto" rotates the five by node id.
const selectedBuiltin = computed(() => (props.modelValue?.url ? null : (props.modelValue?.builtin ?? 'auto')))
function chooseBuiltin(id: string) {
  clearLocal()
  error.value = ''
  const preset = builtinPortraits.find((p) => p.id === id)?.preset
  emit(
    'update:modelValue',
    id === 'auto' ? undefined : { ...DEFAULT_PORTRAIT, ...preset, builtin: id },
    props.nodeId,
  )
}
function urlInput(value: string | number) {
  const url = String(value).trim()
  error.value = url && !safeImageUrl(url) ? '仅接受公开 HTTPS 图片地址，不接受凭据或本地地址。' : ''
  if (!error.value && url && bindingMode.value === 'processed')
    emit('update:modelValue', { ...DEFAULT_PORTRAIT, url, box: 'bleed' }, props.nodeId)
  else update({ url: url || undefined, hidden: false })
  if (!error.value && url) clearLocal()
}
function reset() {
  clearLocal()
  error.value = ''
  notice.value = ''
  emit('update:modelValue', undefined, props.nodeId)
}
function removePortrait() {
  clearLocal()
  update({ hidden: true, url: undefined })
}
onBeforeUnmount(clearLocal)
defineExpose({ reset })
</script>
<template>
  <section class="portrait-editor">
    <div class="form-field">
      <span class="form-label">内置立绘</span>
      <div class="builtin-picker" role="group" aria-label="内置立绘">
        <button
          v-for="o in builtinOptions"
          :key="o.id"
          type="button"
          class="builtin-option"
          :data-portrait="o.id"
          :aria-pressed="selectedBuiltin === o.id"
          :title="o.label"
          @click="chooseBuiltin(o.id)"
        >
          <img v-if="o.src" :src="o.src" alt="" draggable="false" /><span>{{ o.label }}</span>
        </button>
      </div>
      <p>没有绑定图片时使用；“自动”按节点编号轮换五张内置立绘。</p>
    </div>
    <div class="form-field">
      <label for="portrait-binding-mode">绑定的图片</label
      ><select id="portrait-binding-mode" v-model="bindingMode">
        <option value="original">原始图片（保留位置参数）</option>
        <option value="processed">已裁切导出图（重置位置参数）</option>
      </select>
      <p>导出 WebP 后自动选择已裁切模式，绑定 URL 时不会重复缩放或位移。</p>
    </div>
    <div class="form-field">
      <label for="portrait-url">立绘图片 URL</label
      ><Input
        id="portrait-url"
        :model-value="config.url || ''"
        type="url"
        placeholder="https://images.example.com/player.webp"
        :aria-invalid="!!error"
        @update:model-value="urlInput"
      />
      <p>推荐透明背景 PNG / WebP。地址和位置参数保存至 Hub，其他设备可恢复。</p>
    </div>
    <label class="file-drop"
      ><ImagePlus :size="24" /><strong>{{ local ? local.name : '选择一张属于你的立绘' }}</strong
      ><span>PNG、JPG、WebP · 最大 8 MiB / 24MP</span
      ><input
        aria-label="选择本地立绘"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :disabled="busy"
        @change="choose"
    /></label>
    <div v-if="local" class="unsaved-notice" role="status">
      <span>未保存 · 仅本地预览</span>
      <p>本地文件不会随主题设置永久保存。导出后托管，或使用已配置的上传服务。</p>
    </div>
    <div class="portrait-controls">
      <div
        v-for="control in [
          { key: 'scale', label: '缩放', min: 0.65, max: 3, step: 0.01 },
          { key: 'x', label: '水平位置', min: -60, max: 60, step: 1 },
          { key: 'y', label: '垂直位置', min: -60, max: 60, step: 1 },
        ]"
        :key="control.key"
        class="range-field"
      >
        <label :for="`portrait-${control.key}`"
          >{{ control.label
          }}<output>{{
            control.key === 'scale'
              ? `${Math.round(config.scale * 100)}%`
              : `${config[control.key as 'x' | 'y']}%`
          }}</output></label
        ><input
          :id="`portrait-${control.key}`"
          :aria-label="control.label"
          type="range"
          :min="control.min"
          :max="control.max"
          :step="control.step"
          :value="config[control.key as 'scale' | 'x' | 'y']"
          @input="update({ [control.key]: Number(($event.target as HTMLInputElement).value) })"
        />
      </div>
    </div>
    <div class="form-row">
      <div class="form-field">
        <label for="portrait-fit">适配方式</label
        ><select
          id="portrait-fit"
          :value="config.fit"
          @change="update({ fit: ($event.target as HTMLSelectElement).value as 'cover' | 'contain' })"
        >
          <option value="contain">完整显示</option>
          <option value="cover">填满区域</option>
        </select>
      </div>
      <div class="form-field">
        <label for="portrait-area">显示区域</label
        ><select
          id="portrait-area"
          :value="config.area"
          @change="update({ area: ($event.target as HTMLSelectElement).value as 'full' | 'upper' })"
        >
          <option value="full">完整立绘区</option>
          <option value="upper">上半区域</option>
        </select>
      </div>
    </div>
    <div class="editor-actions">
      <Button variant="outline" size="sm" :disabled="!local || busy" @click="exportFile"
        ><Download :size="14" />导出 WebP</Button
      ><Button v-if="endpoint" size="sm" :disabled="!local || busy" @click="upload"
        ><Upload :size="14" />{{ busy ? '处理中…' : '上传并关联' }}</Button
      ><Button variant="ghost" size="sm" @click="reset"><RotateCcw :size="13" />恢复默认</Button
      ><Button variant="ghost" size="sm" @click="removePortrait">移除立绘</Button>
    </div>
    <p v-if="endpoint" class="form-help">
      上传前先<a :href="endpoint.replace(/\/upload\/?$/, '/')" target="_blank" rel="noopener noreferrer"
        >打开上传服务完成 Access 登录 <ExternalLink :size="11" /></a
      >。服务只在此操作时接收图片。
    </p>
    <p v-else class="form-help">未配置上传服务。你仍可编辑、导出并绑定已托管的图片。</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
  </section>
</template>
