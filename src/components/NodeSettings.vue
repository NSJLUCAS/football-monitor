<script setup lang="ts">
import { computed } from 'vue'
import { carriers, lines } from '../domain/carriers'
import type { CarrierConfig, CarrierId, HistoryResponse, NodeConfig } from '../domain/types'
import { Input } from './ui/input'
const props = defineProps<{ modelValue: NodeConfig; history?: HistoryResponse; error?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: NodeConfig]; refresh: [] }>()
const probes = computed(() => Object.entries(props.history?.probes || {}))
function update(id: CarrierId, patch: Partial<CarrierConfig>) {
  const old = props.modelValue.carriers || {}
  emit('update:modelValue', { ...props.modelValue, carriers: { ...old, [id]: { ...old[id], ...patch } } })
}
</script>
<template>
  <div class="carrier-editor">
    <div class="settings-callout">
      <strong>线路由你定义，延迟来自真实探测。</strong>
      <p>请先在 Hub 后台配置 TCP 探测任务，再为每个运营商明确选择任务 ID。不会根据名称或延迟猜测运营商。</p>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <button class="text-button" @click="$emit('refresh')">刷新可用探测任务 ↻</button>
    <div v-for="c in carriers" :key="c.id" class="carrier-config">
      <h3 :style="{ color: c.color }">{{ c.name }}</h3>
      <div class="form-row">
        <div class="form-field">
          <label :for="`${c.id}-line`">线路类型</label
          ><select
            :id="`${c.id}-line`"
            :value="
              lines.includes(modelValue.carriers?.[c.id]?.line || '未知')
                ? modelValue.carriers?.[c.id]?.line || '未知'
                : '自定义'
            "
            @change="update(c.id, { line: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="line in lines" :key="line">{{ line }}</option>
          </select>
        </div>
        <div class="form-field">
          <label :for="`${c.id}-task`">关联探测任务</label
          ><select
            :id="`${c.id}-task`"
            :value="modelValue.carriers?.[c.id]?.taskId || ''"
            @change="
              update(c.id, { taskId: Number(($event.target as HTMLSelectElement).value) || undefined })
            "
          >
            <option value="">不关联探测</option>
            <option v-for="[id, name] in probes" :key="id" :value="id">#{{ id }} · {{ name }}</option>
            <option
              v-if="
                modelValue.carriers?.[c.id]?.taskId && !history?.probes[modelValue.carriers[c.id]!.taskId!]
              "
              :value="modelValue.carriers[c.id]!.taskId"
            >
              #{{ modelValue.carriers[c.id]!.taskId }} · 暂未找到（可能已删除）
            </option>
          </select>
        </div>
      </div>
      <div
        v-if="
          modelValue.carriers?.[c.id]?.line === '自定义' ||
          !lines.includes(modelValue.carriers?.[c.id]?.line || '未知')
        "
        class="form-field"
      >
        <label :for="`${c.id}-custom`">自定义线路名称</label
        ><Input
          :id="`${c.id}-custom`"
          :model-value="
            modelValue.carriers?.[c.id]?.line === '自定义' ? '' : modelValue.carriers?.[c.id]?.line
          "
          maxlength="64"
          @update:model-value="update(c.id, { line: String($event) })"
        />
      </div>
    </div>
  </div>
</template>
