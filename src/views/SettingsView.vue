<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Check,
  Save,
  Layers,
  SlidersHorizontal,
  Server,
  Image,
  Network,
  RotateCcw,
  Eye,
  LockKeyhole,
} from '@lucide/vue'
import manifest from '../../theme.json'
import { useMonitorStore } from '../stores/monitor'
import { DEFAULT_CONFIG } from '../domain/config'
import { clearVisitorView } from '../services/cardView'
import { skinOf } from '../domain/skins'
import { emptyScore, nextTier } from '../domain/score'
import type {
  CardView,
  ConfigPatch,
  GlobalConfig,
  NodeConfig,
  PortraitConfig,
  TemplateId,
  ThemeConfig,
  ProviderConfig,
} from '../domain/types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import PageHeading from '../components/PageHeading.vue'
import PlayerCard from '../components/PlayerCard.vue'
import TemplatePicker from '../components/TemplatePicker.vue'
import PortraitEditor from '../components/PortraitEditor.vue'
import NodeSettings from '../components/NodeSettings.vue'
import ExchangeRatesField from '../components/ExchangeRatesField.vue'
import ProviderPicker from '../components/ProviderPicker.vue'
const store = useMonitorStore(),
  route = useRoute()
const crumbs = [{ label: 'Football Monitor', to: '/' }, { label: '主题设置' }]
const tab = ref('templates'),
  selected = ref(Number(route.query.node) || 0)
const values = ref<Partial<GlobalConfig>>({}),
  nodeChanges = ref<Record<string, NodeConfig | null>>({})
const message = ref(''),
  error = ref('')
const previews = ref<Record<string, string | undefined>>({}),
  localDrafts = ref<Record<string, boolean>>({})
const preview = computed(() => previews.value[selected.value])
const unsaved = computed(() => Object.values(localDrafts.value).some(Boolean))
const editVersion = ref(0),
  portraitEditor = ref<InstanceType<typeof PortraitEditor>>()
const tabs = [
  { id: 'templates', label: '卡面风格', icon: Layers },
  { id: 'global', label: '全局设置', icon: SlidersHorizontal },
  { id: 'node', label: '节点设置', icon: Server },
  { id: 'portrait', label: '立绘编辑', icon: Image },
  { id: 'carriers', label: '三网线路', icon: Network },
]
const previewConfig = computed<ThemeConfig>(() => {
  const nodes = { ...store.config.nodes }
  for (const [id, n] of Object.entries(nodeChanges.value)) {
    if (n === null) delete nodes[id]
    else nodes[id] = n
  }
  return { ...store.config, ...values.value, nodes }
})
const node = computed(() => store.nodes.find((n) => n.id === selected.value))
const previewScore = computed(() => (node.value ? (store.scores[node.value.id] ?? emptyScore()) : null))
const previewTier = computed(() =>
  node.value && previewScore.value
    ? (store.tiers[node.value.id] ?? nextTier(previewScore.value.overall))
    : 'silver',
)
const current = computed(() => previewConfig.value.nodes[String(selected.value)] || {})
const dirty = computed(() => !!Object.keys(values.value).length || !!Object.keys(nodeChanges.value).length)
const nodeMode = computed(() => ['node', 'portrait', 'carriers'].includes(tab.value))
const toggleFields: {
  key: 'motion' | 'show_summary' | 'show_traffic' | 'show_billing' | 'show_carriers' | 'show_clock'
  label: string
  help: string
}[] = [
  { key: 'motion', label: '轻量交互动效', help: '卡片悬停反馈；尊重系统减少动态效果偏好' },
  {
    key: 'show_summary',
    label: '全站服务器汇总',
    help: '显示首页在线、评分、内存、硬盘、流量与网速汇总卡片',
  },
  {
    key: 'show_traffic',
    label: '周期流量区块',
    help: '显示球星卡今日流量行，以及详情页本周期与今日流量块；不影响评分',
  },
  {
    key: 'show_billing',
    label: '费用与到期',
    help: '显示首页剩余价值与到期排行，以及详情页费用与到期块；不影响评分',
  },
  { key: 'show_carriers', label: '三网监控', help: '显示卡下延迟行与详情页三网面板；不影响评分' },
  {
    key: 'show_clock',
    label: '首页时钟',
    help: '在首页标题区右下角显示访客本地时间的字符时钟；放不下时不显示',
  },
]
watch(
  () => store.nodes,
  (nodes) => {
    if (!nodes.some((n) => n.id === selected.value)) selected.value = nodes[0]?.id || 0
  },
  { immediate: true },
)
watch(
  selected,
  () => {
    if (selected.value && store.me?.authed) void store.loadPing(selected.value)
  },
  { immediate: true },
)
watch(
  () => store.me?.authed,
  (authed) => {
    if (!authed) {
      values.value = {}
      nodeChanges.value = {}
      previews.value = {}
      localDrafts.value = {}
      editVersion.value++
      message.value = ''
      error.value = ''
    }
    if (authed && selected.value) void store.loadPing(selected.value)
  },
)
function updateGlobal<K extends keyof GlobalConfig>(key: K, value: GlobalConfig[K]) {
  editVersion.value++
  values.value[key] = value
  message.value = ''
  error.value = ''
}
// Whoever sets the site default wants to see it here, so this browser's own pick from the home page goes.
function viewChange(value: CardView) {
  clearVisitorView()
  updateGlobal('card_view', value)
}
function updateNode(value: NodeConfig) {
  updateNodeFor(selected.value, value)
}
function updateNodeFor(id: number, value: NodeConfig) {
  editVersion.value++
  if (id) nodeChanges.value[String(id)] = value
  message.value = ''
  error.value = ''
}
function setPortrait(value: PortraitConfig | undefined, id: number) {
  updateNodeFor(id, { ...previewConfig.value.nodes[id], portrait: value })
}
function setPreview(value: string | undefined, id: number) {
  previews.value[id] = value
}
function setUnsaved(value: boolean, id: number) {
  localDrafts.value[id] = value
}
const templateName = (id: TemplateId) => (id === 'auto' ? '自动（按评分）' : skinOf(id).name)
function templateChange(value: TemplateId | undefined) {
  updateNode({ ...current.value, template: value })
}
function providerChange(value: ProviderConfig | undefined) {
  updateNode({ ...current.value, provider: value })
}
function defaultTemplateChange(value: TemplateId | undefined) {
  if (value) updateGlobal('default_template', value)
}
function resetNode() {
  portraitEditor.value?.reset()
  editVersion.value++
  nodeChanges.value[String(selected.value)] = null
  message.value = '当前节点已在草稿中恢复默认，请保存到 Hub。'
}
function resetGlobal() {
  editVersion.value++
  values.value = { ...DEFAULT_CONFIG }
  message.value = '全局设置已在草稿中恢复默认，请保存到 Hub。'
}
async function save() {
  if (unsaved.value) {
    error.value = '当前本地立绘尚未托管，请导出并绑定 HTTPS URL，或移除本地预览后保存。'
    return
  }
  error.value = ''
  message.value = ''
  try {
    const version = editVersion.value
    const snapshot = JSON.parse(
      JSON.stringify({ values: values.value, nodes: nodeChanges.value }),
    ) as ConfigPatch
    await store.save(snapshot)
    if (editVersion.value === version) {
      values.value = {}
      nodeChanges.value = {}
      message.value = '已保存到 Hub，并重新读取确认。刷新或更换设备后会恢复。'
    } else message.value = '本次提交已保存并确认；保存期间的新编辑仍在草稿中，请再次保存。'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败，草稿已保留'
  }
}
</script>
<template>
  <PageHeading
    :crumbs="crumbs"
    title="让主场，成为你的风格。"
    description="每一张卡面，都是一台独一无二的服务器。"
  >
    <div v-if="store.me?.authed" class="settings-save">
      <span v-if="dirty" class="dirty-label">{{ unsaved ? '含未托管图片' : '有未保存更改' }}</span
      ><Button :disabled="!dirty || store.saving || !!store.config.configWarning" @click="save"
        ><Save :size="15" />{{ store.saving ? '正在确认保存…' : '保存到 Hub' }}</Button
      >
    </div>
  </PageHeading>
  <div v-if="!store.me?.authed" class="empty-state panel">
    <LockKeyhole :size="32" />
    <h2>{{ store.loading ? '正在确认站长身份…' : '这片主场，由站长定义。' }}</h2>
    <p>请先登录 Monitor Hub，主题将通过官方会话确认编辑权限。</p>
    <a href="/admin/" class="primary-link">前往 Hub 登录 ↗</a>
  </div>
  <template v-else>
    <div v-if="store.config.configWarning" class="inline-notice" role="alert">
      {{ store.config.configWarning }} 请先在 Hub 主题设置中备份并修复 JSON。
    </div>
    <p v-if="message" class="save-feedback success" role="status"><Check :size="16" />{{ message }}</p>
    <p v-if="error" class="save-feedback failure" role="alert">{{ error }}</p>
    <div class="settings-grid">
      <aside class="settings-sidebar">
        <span class="settings-category">主题设置</span>
        <nav aria-label="主题设置分类">
          <button
            v-for="item in tabs"
            :key="item.id"
            :class="{ active: tab === item.id }"
            :aria-current="tab === item.id ? 'page' : undefined"
            @click="tab = item.id"
          >
            <component :is="item.icon" :size="16" />{{ item.label }}<span v-if="tab === item.id">›</span>
          </button>
        </nav>
        <div class="settings-sidebar-note">
          <LockKeyhole :size="14" />
          <p>设置保存到 Hub<br />站点共享，跨设备恢复</p>
        </div>
        <p class="settings-version">
          FOOTBALL MONITOR<br /><span>VERSION {{ manifest.version }}</span>
        </p>
      </aside>
      <section class="settings-form panel">
        <div class="settings-panel-header">
          <span class="eyebrow">MAKE IT YOURS</span>
          <h2>{{ tabs.find((t) => t.id === tab)?.label }}</h2>
          <p>
            {{
              tab === 'templates'
                ? '选择你的首发卡面，未单独配置的节点将继承此风格。'
                : tab === 'global'
                  ? '调整整个主场的呈现方式。'
                  : '使用稳定节点 ID 保存，重命名不会丢失配置。'
            }}
          </p>
        </div>
        <div class="settings-panel-body">
          <template v-if="tab === 'templates'"
            ><TemplatePicker
              :model-value="previewConfig.default_template"
              @update:model-value="defaultTemplateChange"
            />
            <div class="settings-callout">
              <Check :size="15" />
              <p>全局卡面即刻预览。你也可以在「节点设置」中，为每台服务器选择专属风格。</p>
            </div>
            <Button variant="ghost" size="sm" @click="updateGlobal('default_template', 'auto')"
              ><RotateCcw :size="13" />恢复默认卡面</Button
            ></template
          >
          <template v-else-if="tab === 'global'"
            ><div class="form-row form-row-3">
              <div class="form-field">
                <label for="global-layout">卡片布局</label
                ><select
                  id="global-layout"
                  :value="previewConfig.layout"
                  @change="
                    updateGlobal(
                      'layout',
                      ($event.target as HTMLSelectElement).value as GlobalConfig['layout'],
                    )
                  "
                >
                  <option value="comfortable">标准 · 每行 7 张</option>
                  <option value="compact">紧凑 · 每行 8 张</option>
                </select>
              </div>
              <div class="form-field">
                <label for="global-size">卡片尺寸</label
                ><select
                  id="global-size"
                  :value="previewConfig.card_size"
                  @change="
                    updateGlobal(
                      'card_size',
                      ($event.target as HTMLSelectElement).value as GlobalConfig['card_size'],
                    )
                  "
                >
                  <option value="standard">标准 · 按布局排列</option>
                  <option value="large">大卡 · 每行 6 张</option>
                </select>
              </div>
              <div class="form-field">
                <label for="global-view">首页形式</label
                ><select
                  id="global-view"
                  :value="previewConfig.card_view"
                  @change="viewChange(($event.target as HTMLSelectElement).value as CardView)"
                >
                  <option value="stacked">上下 · 卡下数据</option>
                  <option value="split">左右 · 右侧面板</option>
                </select>
              </div>
            </div>
            <p class="form-help">
              每行张数指桌面宽屏下的排布，窄屏会自动减少。首页形式：上下为卡面下方显示速率与三网，左右为卡面右侧显示数据面板；访客可用顶栏深浅色按钮旁的图标临时切换，只记在自己的浏览器里。
            </p>
            <div class="form-field">
              <label for="global-appearance">站点默认外观</label
              ><select
                id="global-appearance"
                :value="previewConfig.appearance"
                @change="
                  updateGlobal(
                    'appearance',
                    ($event.target as HTMLSelectElement).value as GlobalConfig['appearance'],
                  )
                "
              >
                <option value="dark">深色主场</option>
                <option value="light">浅色主场</option>
                <option value="system">跟随系统</option>
              </select>
              <p>访客自己的外观偏好可以覆盖站点默认值。</p>
            </div>
            <div class="toggle-list">
              <div v-for="f in toggleFields" :key="f.key" class="toggle-field">
                <label :for="`toggle-${f.key}`"
                  ><strong>{{ f.label }}</strong
                  ><span>{{ f.help }}</span></label
                ><Switch
                  :id="`toggle-${f.key}`"
                  :model-value="previewConfig[f.key]"
                  @update:model-value="updateGlobal(f.key, $event)"
                />
              </div>
            </div>
            <ExchangeRatesField
              :model-value="previewConfig.exchange_rates"
              @update:model-value="updateGlobal('exchange_rates', $event)"
            />
            <div class="form-field">
              <label for="upload-endpoint">可选图片上传服务</label
              ><Input
                id="upload-endpoint"
                :model-value="previewConfig.upload_endpoint"
                type="url"
                placeholder="https://upload.example.com/upload"
                @update:model-value="updateGlobal('upload_endpoint', String($event))"
              />
              <p>
                独立 Cloudflare Access + R2 Worker 的公开地址。此字段不得包含密钥。未配置时 URL
                与导出模式仍正常工作。
              </p>
            </div>
            <Button variant="outline" size="sm" @click="resetGlobal"
              ><RotateCcw :size="13" />恢复全局默认</Button
            ></template
          >
          <template v-else
            ><div class="form-field node-selector">
              <label for="node-select">选择节点</label
              ><select id="node-select" v-model.number="selected">
                <option v-for="n in store.nodes" :key="n.id" :value="n.id">{{ n.name }} · #{{ n.id }}</option>
                <option v-if="!store.nodes.length" :value="0">尚无可配置节点</option>
              </select>
            </div>
            <template v-if="node"
              ><template v-if="tab === 'node'"
                ><h3 class="field-section-title">节点专属卡面</h3>
                <TemplatePicker
                  :model-value="current.template"
                  inherit
                  @update:model-value="templateChange"
                />
                <p class="form-help">
                  继承全局时，此节点会跟随默认卡面更新。当前生效：{{
                    templateName(current.template || previewConfig.default_template)
                  }}。
                </p>
                <h3 class="field-section-title">服务商与卡面徽章</h3>
                <ProviderPicker
                  :model-value="current.provider"
                  :node-id="selected"
                  :endpoint="previewConfig.upload_endpoint"
                  @update:model-value="providerChange"
                />
                <Button variant="outline" size="sm" @click="resetNode"
                  ><RotateCcw :size="13" />恢复此节点的全部默认设置</Button
                ></template
              ><NodeSettings
                v-else-if="tab === 'carriers'"
                :model-value="current"
                :history="store.ping[selected]"
                :error="store.pingErrors[selected]"
                @update:model-value="updateNode"
                @refresh="store.loadPing(selected, true)" /></template
          ></template>
          <div v-show="tab === 'portrait' && !!node">
            <KeepAlive>
              <PortraitEditor
                v-if="node"
                :key="selected"
                ref="portraitEditor"
                :model-value="current.portrait"
                :node-id="selected"
                :endpoint="previewConfig.upload_endpoint"
                @update:model-value="setPortrait"
                @preview="setPreview"
                @unsaved="setUnsaved"
              />
            </KeepAlive>
          </div>
        </div>
        <div class="settings-panel-footer">
          <span>设置对访客公开，请勿填写秘密或内网地址。</span><span>HUB SYNC <span class="live-dot" /></span>
        </div>
      </section>
      <aside class="settings-preview">
        <div class="preview-heading">
          <span><Eye :size="14" /> 实时预览</span
          ><small>{{ unsaved ? '本地图片 · 未保存' : dirty ? '草稿预览' : '已保存配置' }}</small>
        </div>
        <div v-if="node" class="preview-card-wrap">
          <PlayerCard
            v-if="previewScore"
            :node="node"
            :config="previewConfig"
            :score="previewScore"
            :tier="previewTier"
            :template-override="nodeMode ? undefined : previewConfig.default_template"
            :portrait-preview="preview"
            :interactive="false"
          />
        </div>
        <div v-else class="empty-state panel"><p>添加节点后即可查看完整卡面预览。</p></div>
        <div class="preview-caption">
          <span class="live-dot" /> 改变设置，即刻呈现。
          <p>预览基于当前节点的真实数据。<br />点击保存后才会同步到站点。</p>
        </div>
      </aside>
    </div>
  </template>
</template>
