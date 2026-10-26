# Verified upstream references

Checked 2026-10-26. Source snapshots are read-only under ignored `.research/`.

- [Theme contract](https://monitor-document.pages.dev/dev/theme)
- [Architecture and protocol](https://monitor-document.pages.dev/dev/architecture)
- [TCP probes](https://monitor-document.pages.dev/config/ping)
- [Default theme](https://github.com/monitor-probe/monitor-theme-default), commit `6cd1ed45601167ce44aad52d99df227785302f74`, version 1.4.2: `src/lib/api.ts`, `src/lib/config.ts`, `src/components/NodeDetail.tsx`, `vite.config.ts`.
- [Hub](https://github.com/monitor-probe/monitor), commit `9eca347f0adeae8330ba3d38682ef96e8bddd1e9`: public node whitelist/metrics/me/theme config in `src/api.rs`; SPA serving, package limits and installation in `src/frontend.rs`; route registration in `src/main.rs`.
- [shadcn-vue Vite](https://www.shadcn-vue.com/docs/installation/vite), [Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite), [Vite base](https://vite.dev/config/shared-options.html#base).
- [Cloudflare Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

No generic theme image-upload API is documented or exposed among the allowed theme routes. The theme uses public probe names included in metrics history; probe targets and assignments remain in the official administration panel.

Important source/documentation discrepancy: the documentation describes a directory wrapper, while Hub `src/frontend.rs` publish() checks `staging/theme.json` and `staging/dist/index.html` directly. The default theme `.github/workflows/release.yml` line 40 runs `tar czf theme.tar.gz dist theme.json preview.png`. Deliver both the requested wrapper and a separately labeled flat Hub-upload archive, and do not claim real installation evidence.

Additional verified references: [R2 public custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Access CORS](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/), [Durable Object SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). Missing npm license file for nested vue-devtools-api 6.6.4 is preserved from [upstream v6.6.4 license](https://raw.githubusercontent.com/vuejs/vue-devtools/v6.6.4/LICENSE); generated shadcn-vue components use the [unovue MIT license](https://raw.githubusercontent.com/unovue/shadcn-vue/dev/LICENSE).
