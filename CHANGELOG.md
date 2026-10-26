# Changelog

## 1.0.0 · 2026-10-27 · 首个公开发布（FC 风格球星卡）

### Added

- 六项健康评分与综合分（1–99，离线 OFF），铜 / 银 / 金自动档位（65 / 75，2 分滞后）。
- 六套卡面：站长提供的金卡、周黑、开拓者、传奇，及由金卡派生的银卡、铜卡；默认「自动（按评分）」。
- FUT.GG 式平面布局：首页每行 7 张，球员资料式详情页，设置页真实卡面预览，关于页评分规则。
- 180×180 不透明 `apple-touch-icon.png`（Hub 换站点图标时同步替换）。
- GitHub Actions：Ubuntu 上运行检查、测试、构建、浏览器测试与打包校验；`v*` 标签自动发布 `theme.tar.gz`、`football-monitor.tar.gz` 与 `SHA256SUMS.txt`。

### Changed

- V1 模板 ID 读取时迁移；全局 `classic-gold` 变为 `auto`。
- `theme.json` 的 `url` 指向 GitHub 仓库，Hub 可从 release 一键更新。
- 删除 V1 原创 SVG 卡框；卡面改为打包的 WebP 位图。
- 无障碍：卡片链接命名、标签对比度、窄屏连接状态文字、输入法回车。

### Verification boundaries

全部浏览器证据来自隔离模拟 API 与 CI，真实 Hub 安装与云端 R2/Access 联调未验证。

## 首次本地交付（未单独发布）· 2026-10-26

### Added

- 五套原创足球盾形球星卡，跨设备布局与中性运动员默认立绘。
- Monitor 公开接口、gzip 实时快照、轮询恢复和按需历史图。
- 站长全局/逐节点设置，安全合并、大小校验与读回确认。
- 三网任务 ID 映射与独立线路配置。
- 本地立绘裁切/压缩导出、HTTPS URL 持久配置和可选 Access/R2 上传 Worker。
- 自动化验证、视觉证据、双归档格式和本地安装说明。

### Verification boundaries

真实 Hub 安装与云端 R2/Access 联调未验证。
