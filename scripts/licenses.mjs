import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const packages = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, info]) => ({
    path,
    name: info.name || path.split('node_modules/').at(-1),
    version: info.version,
    license: info.license || 'UNKNOWN',
    development: info.dev === true,
  }))
const unknown = packages.filter((p) => p.license === 'UNKNOWN')
if (unknown.length) throw new Error(`需要手动审核许可证：${unknown.map((p) => p.name).join(', ')}`)
writeFileSync('docs/dependency-licenses.json', JSON.stringify(packages, null, 2) + '\n')
const runtime = packages.filter((p) => !p.development)
let notices =
  '# Third-party notices\n\nFootball Monitor original source/artwork: MIT. Generated shadcn-vue components: MIT, copyright (c) 2023 unovue. API contract references: Monitor/default theme MIT, copyright (c) 2026 stqfdyr. No upstream Hub/React source or EA assets are distributed.\n\nCard face artwork: the gold, weekly-black, pioneer and legend card faces were designed and supplied by the site owner on 2026-10-26 for this theme. The silver and bronze faces are derived from the gold face by this project (silver: greyscale and brightened; bronze: greyscale plus a copper tint). They ship as processed WebP files under dist/assets/. They are not EA, EA SPORTS FC or FUT.GG assets and contain no real player likeness. The source images stay in design/cards/ and are not part of the theme package.\n\nBuilt-in portraits: the five default portraits (src/assets/portraits/, shipped as WebP under dist/assets/) were supplied by the site owner on 2026-10-27 and are included at the owner’s request. They are illustrations depicting real professional footballers; two also show club, kit-supplier and sponsor marks (one also league marks). They are NOT covered by this project’s MIT licence, and this project claims no rights in them. The likenesses, names and trademarks belong to their respective owners, and their use implies no endorsement or affiliation. Anyone redistributing or deploying this theme is responsible for having the rights to use them, or can replace them, for example with the original neutral figure (public/athlete.svg, MIT) that remains selectable in settings. Sources: design/portraits/ (trimmed and compressed by npm run portraits).\n\nBuild-time card processing (npm run cards) uses sharp (Apache-2.0) with its prebuilt libvips binaries (@img/sharp-libvips-*, LGPL-3.0-or-later). Both are development dependencies only: they are listed in docs/dependency-licenses.json and are not shipped in the theme package.\n\nCard crests: country flags come from flag-icons (MIT) and ship as separate SVG assets under dist/assets/. VPS provider and operating-system marks use path data from Simple Icons (CC0-1.0). The logos are trademarks of their respective owners; they are shown only to identify the provider a site owner selected or the operating system the agent reported, and imply no endorsement. The CloudCone, BageVM, VMISS and Akile logos are not in Simple Icons; they were taken from each provider’s own website (favicon or logo, resized; the VMISS mark is cropped from its SVG logo) and ship under dist/assets/ for the same identifying purpose. Other providers without a Simple Icons mark are shown as text. Custom provider logos are supplied and hosted by the site owner. The China Telecom, China Unicom and China Mobile logos were supplied by the site owner (trimmed and resized from design/carriers/) and ship under dist/assets/ only to identify the carrier a latency probe measures; they are trademarks of their respective owners, are not covered by the MIT licence, and imply no endorsement. The home-page character clock (src/components/AsciiClock.vue) is original code; its look, a canvas grid of monospace character cells with ripples, follows stqfdyr/ascii-pond (MIT), from which no code is copied.\n\nThis file includes installed runtime dependency license texts. Full lockfile inventory (including build/test tooling) is in docs/dependency-licenses.json. The optional upload Worker additionally uses jose (MIT); its license follows below.\n'
for (const p of [...runtime, ...packages.filter((p) => p.name === 'jose')]) {
  notices += `\n## ${p.name} ${p.version}\n\nLicense: ${p.license}\n\n`
  if (!existsSync(p.path)) throw new Error(`缺少已安装运行依赖 ${p.path}`)
  const files = readdirSync(p.path).filter((f) =>
    /^licen[cs]e(?:\.|$)|^notice(?:\.|$)|^copyright(?:\.|$)|thirdpartynotice/i.test(f),
  )
  if (!files.length) {
    if (p.name === '@vue/devtools-api' && p.version === '6.6.4')
      notices += readFileSync('docs/references/vue-devtools-LICENSE.txt', 'utf8').trim() + '\n'
    else throw new Error(`需查找完整许可证 ${p.name}`)
  }
  for (const file of files) notices += readFileSync(join(p.path, file), 'utf8').trim() + '\n'
}
notices +=
  '\n## shadcn-vue component source (MIT)\n\n' +
  readFileSync('docs/references/shadcn-vue-LICENSE.txt', 'utf8')
writeFileSync('THIRD_PARTY_NOTICES.md', notices)
console.log(
  `已记录 ${packages.length} 项依赖；${runtime.length} 项运行依赖许可证；未知许可证：${unknown.length}`,
)
