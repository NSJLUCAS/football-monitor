import { mkdirSync, mkdtempSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { verifyArchive } from './verify-package.mjs'

const root = resolve('.')
for (const path of ['dist/index.html', 'theme.json', 'preview.png'])
  if (!lstatSync(path).isFile()) throw new Error(`先生成 ${path}`)
function rejectLinks(path) {
  if (lstatSync(path).isSymbolicLink()) throw new Error(`拒绝打包符号链接：${relative(root, path)}`)
  if (lstatSync(path).isFile() && lstatSync(path).size > 8 * 1024 ** 2)
    throw new Error(`文件超过 8 MiB：${path}`)
  if (lstatSync(path).isDirectory()) for (const file of readdirSync(path)) rejectLinks(join(path, file))
}
rejectLinks(resolve('dist'))
mkdirSync('release/hub-install', { recursive: true })
const staging = mkdtempSync(join(root, 'release/build-')),
  theme = join(staging, 'football-monitor')
mkdirSync(theme)
// Node 24.14.1 native cpSync crashes with 0xC0000409 on this Windows workspace.
// Read/write bounded, already validated files instead of invoking that native path.
function copyTree(source, destination) {
  if (lstatSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true, mode: 0o755 })
    for (const entry of readdirSync(source)) copyTree(join(source, entry), join(destination, entry))
  } else writeFileSync(destination, readFileSync(source), { mode: 0o644 })
}
copyTree('dist', join(theme, 'dist'))
for (const file of ['theme.json', 'preview.png']) copyTree(file, join(theme, file))
function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'tar 执行失败')
}
tar(['--format=ustar', '-czf', resolve('theme.tar.gz'), '-C', staging, 'football-monitor'])
tar([
  '--format=ustar',
  '-czf',
  resolve('release/hub-install/theme.tar.gz'),
  '-C',
  theme,
  'theme.json',
  'preview.png',
  'dist',
])
console.log(
  JSON.stringify(
    [verifyArchive('theme.tar.gz', 'wrapped'), verifyArchive('release/hub-install/theme.tar.gz', 'hub')],
    null,
    2,
  ),
)
console.log(`保留构建目录用于审阅：${theme}`)
