<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseRates } from '../domain/fleet'
import { Input } from './ui/input'
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
// The draft keeps what the owner typed; only well-formed rates reach the config.
const draft = ref(props.modelValue),
  error = ref('')
watch(
  () => props.modelValue,
  (value) => {
    // An outside change (reset, reload) replaces the draft; our own emit leaves it alone.
    if (value !== draft.value.trim()) {
      draft.value = value
      error.value = ''
    }
  },
)
function update(value: string) {
  draft.value = value
  if (parseRates(value) === null) {
    error.value = '格式应为 币种=汇率，用逗号分隔，例如 USD=7.10,JPY=0.047'
    return
  }
  error.value = ''
  emit('update:modelValue', value.trim())
}
</script>
<template>
  <div class="form-field">
    <label for="exchange-rates">汇率（折合人民币）</label
    ><Input
      id="exchange-rates"
      :model-value="draft"
      placeholder="USD=7.10,JPY=0.047"
      :aria-invalid="!!error || undefined"
      @update:model-value="update(String($event))"
    />
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p>1 单位外币折合多少人民币。只用于首页“剩余价值”合计，人民币不用填；没有汇率的币种不计入。</p>
  </div>
</template>
