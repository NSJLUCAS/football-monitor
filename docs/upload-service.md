# 可选 Cloudflare 图片上传服务

本服务独立部署，不修改 Monitor Hub。当前仅完成本地测试和 `wrangler deploy --dry-run`。你没有提供云端凭据，本项目没有建立 R2 桶、修改域名或部署 Worker。

## 所需资源

- Cloudflare 账户，R2 专用图片桶，Durable Object（使用 SQLite 后端）。不要与私密数据共用公开图片桶。
- 图片域名，例如 `images.example.com`，通过 R2 Custom Domain 提供公开只读 HTTPS 图片。上传写权限仅来自 Worker R2 binding。
- 上传域名，例如 `upload.example.com`，指向 Worker 并由 Cloudflare Access 自托管应用保护整个域名。
- 监控域名，例如 `monitor.example.com`。建议使用同一可注册域名下的 HTTPS 子域，以减少第三方 Cookie 限制造成的登录问题。

所有 `example.com` 和 `replace-*` 都是待替换示例，不是可直接使用的服务。前端只存公开上传端点，不存 R2 Key、Access Secret 或 JWT。

## 部署前准备

1. 创建专用 R2 桶 `football-monitor-images`，将公开图片自定义域名连接到这个桶。关闭不必要的 r2.dev 开发访问。公开图片可被任何知道地址的人读取，不要上传私人资料。
2. 为上传域名建立 Access 应用。访问策略只允许你的站长邮箱/身份，建议启用 MFA。保存应用 AUD 和团队域名。
3. 编辑 `upload-worker/wrangler.toml`：填真实 Custom Domain route、R2 bucket、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`ALLOWED_EMAILS`、`ALLOWED_ORIGIN`、`PUBLIC_IMAGE_BASE`。Origin 必须精确到协议/域名/端口，不带末尾 `/`，不允许 `*`。
4. 保留 `workers_dev = false`，不要留一个绕过 Access 的可用 workers.dev 入口；Worker 本身仍会验证签名，双重保护。R2 密钥不需要创建或填入前端，使用 binding 即可。
5. Access 中将 **OPTIONS 预检**设为绕过 Access，或由 Access 使用精确 Origin/方法配置回答。仅 OPTIONS 可绕过；POST 不可绕过。Worker 对 OPTIONS 也限制 Origin、POST 方法和 Content-Type/X-Node-Id 请求头。

从仓库根目录，安装依赖后先本地检查：

```powershell
npm ci
npm test -- tests/worker.test.ts tests/images.test.ts
npx wrangler@4 deploy --dry-run --config upload-worker/wrangler.toml
```

部署由站长明确执行；下面命令会修改你的 Cloudflare 资源，本项目不会自动运行：

```powershell
npx wrangler@4 login
npx wrangler@4 deploy --config upload-worker/wrangler.toml
```

Wrangler 从根目录 node_modules 解析 `jose`，并引用 `shared/image-content.ts`；不要只复制一个 Worker 文件遗漏共享验证模块。保留完整项目即可部署。

## 主题中的使用

全局设置填 `https://upload.example.com/upload`，保存到 Hub。编辑节点立绘，选择本地图片并调参数。先打开 `https://upload.example.com/` 完成 Access 登录，再点击「上传并关联」。服务验证当前 Access 身份，前端不会读取或存储 JWT。

上传的是已经规范裁切的 WebP，返回的 URL 自动填入当前节点草稿，并将位置参数恢复默认，避免双重裁切。**仍需点击「保存到 Hub」**，成功读回确认后其他设备才能恢复。

若跨站第三方 Cookie 被浏览器阻止，使用同站点子域或改用基础 URL/导出方式，不要把 Access 服务令牌硬编码到主题里。CORS/Access 联调必须在你的真实域名环境单独验收。

## 身份、文件与配额规则

- 验证 Access `Cf-Access-Jwt-Assertion` 的真实 RS256 签名，JWKS 来自固定团队的 `/cdn-cgi/access/certs`。
- 校验 issuer、AUD，要求 sub/iss/aud/exp/iat，最大 Token age 24 小时，容差 5 秒，并检查明确的邮箱白名单。
- Subject + issuer 的 SHA-256 用作 Durable Object 身份键，不将邮箱记录到图片路径或日志。每站长每分钟最多 5 次尝试，失败尝试也占额度；事务保证跨实例的一致性。缺少/故障绑定会拒绝，不用进程内计数器冒充限流。
- POST `/upload`，原始图片 body，`Content-Type` 为真实 image/png、image/jpeg、image/webp，`X-Node-Id` 为正安全整数。
- 文件最多 8 MiB；既检查 Content-Length，也按实际流累计。校验 magic bytes、结构边界/尾标记、维度（24MP，单边 10000px）以及 MIME 一致性。PNG 校验块 CRC，JPEG 必须包含帧/量化/Huffman/非空扫描和正确结束，WebP 必须包含真实图像块且尺寸一致。仅支持常见 8-bit baseline/progressive JPEG 与静态 WebP。前端还会执行真实图片解码；Worker 不声称是完整解码器。Worker 不提供外部 URL 抓取，不存在图片代理 SSRF。
- 对象路径由服务生成 `nodes/{ID}/{UUID}.{ext}`，不信任文件名或客户端路径，不覆盖已有对象。
- 写入准确 Content-Type 和 immutable Cache-Control，返回持久 HTTPS URL。建议在公开图片域名设置 `X-Content-Type-Options: nosniff` 响应规则。
- 浏览器响应精确 CORS Origin + credentials，Cache-Control no-store、nosniff、禁止页面内容执行/嵌入的 CSP；错误不暴露堆栈或令牌。

这是站长上传服务，不是多租户节点 ACL。白名单站长可以为任意节点 ID 上传。Hub 的节点绑定/保存权限仍由 Hub 会话决定。

## 存储管理与验收

本主题移除 URL 不会自动删除 R2 对象，避免不可逆误删。站长应按实际引用清单、备份和缓存生命周期处理不再使用的图片。预估存储成本并设置 Cloudflare 资源告警；速率限制不会替代账户预算。更换图片生成新 URL，避免旧缓存覆盖新图片。

上线前，在真实环境验证：未登录/错误邮箱被拒；伪造 JWT 被拒；正常站长上传并跨浏览器查看图片；超过尺寸和每分钟额度被拒；其他 Origin 被拒；Access 预检设置和 Cookie 正常；Hub 保存后刷新恢复。当前项目只证明本地测试和打包 dry-run，不证明这些云端条件。

官方依据：[Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Access CORS](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)、[R2 Custom Domain](https://developers.cloudflare.com/r2/buckets/public-buckets/)、[Durable Object SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。
