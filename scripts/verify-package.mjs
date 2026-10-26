import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MiB = 1024 ** 2
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function packageVersion() {
  return JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
}
export function validateManifest(manifest) {
  for (const key of ['name', 'short', 'description', 'version', 'author', 'url'])
    assert(typeof manifest[key] === 'string', `theme.json 缺少字符串字段 ${key}`)
  assert(manifest.name.trim(), '主题名称不能为空')
  assert(
    /^[A-Za-z0-9_-]+$/.test(manifest.short) && manifest.short === 'football-monitor',
    '主题 short 不合法',
  )
  assert(manifest.version === packageVersion(), '版本必须与 package.json 一致')
  // The panel's GitHub update reads releases from url, so it must name this repository.
  assert(
    manifest.url === 'https://github.com/NSJLUCAS/football-monitor',
    'theme.json url 必须指向 GitHub 仓库',
  )
  const keys = new Set()
  assert(Array.isArray(manifest.config), '缺少静态配置声明')
  for (const field of manifest.config) {
    if (field.type === 'title') {
      assert(typeof field.label === 'string', '配置标题无效')
      continue
    }
    assert(typeof field.key === 'string' && !keys.has(field.key), '配置 key 缺少或重复')
    keys.add(field.key)
    assert(['string', 'text', 'boolean', 'number', 'select'].includes(field.type), '配置类型无效')
    assert(
      typeof field.default ===
        (field.type === 'boolean' ? 'boolean' : field.type === 'number' ? 'number' : 'string'),
      '配置默认值类型错误',
    )
    if (field.type === 'select')
      assert(
        field.options?.some((o) => o.value === field.default),
        '下拉默认值不在选项中',
      )
  }
  for (const required of ['default_template', 'node_config', 'upload_endpoint'])
    assert(keys.has(required), `缺少配置 ${required}`)
}
export function validateEntries(entries, mode) {
  assert(mode === 'hub' || mode === 'wrapped', '归档模式无效')
  const paths = new Set(),
    diskEntries = new Set(),
    files = new Map()
  let expandedBytes = 0
  for (const entry of entries) {
    const path = entry.path.replace(/\/$/, '')
    assert(
      path &&
        Buffer.byteLength(path) <= 4096 &&
        !path.startsWith('/') &&
        !path.includes('\\') &&
        !path.includes(':') &&
        !path.split('/').some((part) => part === '.' || part === '..'),
      `危险归档路径 ${path}`,
    )
    assert(!paths.has(path), `重复归档路径 ${path}`)
    paths.add(path)
    assert(entry.type === 'file' || entry.type === 'directory', `不接受链接或特殊文件 ${path}`)
    assert(
      Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= 8 * MiB,
      `单个文件超过 8 MiB ${path}`,
    )
    expandedBytes += entry.size
    assert(expandedBytes <= 64 * MiB, '解压后超过 64 MiB')
    const parts = path.split('/')
    for (let i = 1; i <= parts.length; i++) diskEntries.add(parts.slice(0, i).join('/'))
    assert(diskEntries.size <= 2000 && entries.length <= 2000, '文件和目录数超过 2000')
    const logical =
      mode === 'wrapped'
        ? path === 'football-monitor'
          ? ''
          : path.startsWith('football-monitor/')
            ? path.slice(17)
            : null
        : path
    assert(logical !== null, '封装包缺少 football-monitor 根目录')
    assert(
      (logical === '' && entry.type === 'directory') ||
        logical === 'theme.json' ||
        logical === 'preview.png' ||
        logical === 'dist' ||
        logical.startsWith('dist/'),
      '归档结构与当前 Hub 安装格式不符',
    )
    if (entry.type === 'file') {
      assert(entry.data && entry.data.length === entry.size, `文件数据不完整 ${path}`)
      files.set(logical, entry.data)
      if (/\.(js|html|css)$/.test(logical))
        assert(
          !/本地模拟验收|must survive saves|US-Los Angeles|__test\/reset/.test(entry.data.toString('utf8')),
          '生产包包含模拟数据',
        )
    }
  }
  assert(
    files.has('theme.json') && files.has('dist/index.html') && files.has('preview.png'),
    '主题缺少必要文件',
  )
  const manifest = JSON.parse(files.get('theme.json').toString('utf8'))
  validateManifest(manifest)
  assert(files.get('theme.json').length <= 65536, 'theme.json 超过 64 KiB')
  assert(
    files
      .get('preview.png')
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    '预览图不是 PNG',
  )
  const html = files.get('dist/index.html').toString('utf8')
  // The Hub swaps its own site icon in at these exact root paths; hashed copies would never update.
  assert(html.includes('href="/favicon.svg"'), 'index.html 必须原样引用 /favicon.svg')
  assert(
    files.has('dist/apple-touch-icon.png') && html.includes('href="/apple-touch-icon.png"'),
    '缺少 dist/apple-touch-icon.png 或 index.html 中的 apple-touch-icon 声明',
  )
  for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g))
    assert(files.has(`dist/${match[1]}`), `入口引用丢失 ${match[1]}`)
  const logicalPaths = [...files.keys()]
  // Source artwork (design/) and build tooling (scripts/) must never ship; only Vite-hashed card faces do.
  assert(!logicalPaths.some((p) => /(^|\/)(design|scripts)\//.test(p)), '安装包包含 design/ 或 scripts/')
  const cardFaces = logicalPaths
    .filter((p) => /^dist\/assets\/[^/]+\.webp$/.test(p))
    .map((p) => p.slice('dist/assets/'.length).replace(/-[\w-]{8}\.webp$/, ''))
    .sort()
  return {
    mode,
    files: files.size,
    filesAndDirectories: diskEntries.size,
    expandedBytes,
    short: manifest.short,
    version: manifest.version,
    cardFaces,
    designOrScriptsIncluded: false,
  }
}
function parseTar(bytes) {
  const entries = []
  const string = (offset, length) =>
    bytes
      .subarray(offset, offset + length)
      .toString('utf8')
      .split('\0')[0]
  const octal = (offset, length) => {
    const s = string(offset, length).trim()
    assert(/^[0-7]*$/.test(s), '非法 tar 数值')
    return parseInt(s || '0', 8)
  }
  let offset = 0,
    ended = false
  while (offset + 512 <= bytes.length) {
    const block = bytes.subarray(offset, offset + 512)
    if (block.every((b) => b === 0)) {
      assert(
        bytes.subarray(offset + 512, offset + 1024).length === 512 &&
          bytes.subarray(offset + 512, offset + 1024).every((b) => b === 0),
        'tar 缺少结尾块',
      )
      assert(bytes.length - offset - 1024 <= MiB, 'tar 尾部填充超过 1 MiB')
      ended = true
      break
    }
    const checksum = octal(offset + 148, 8)
    const actual = block.reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0)
    assert(checksum === actual, 'tar 头部校验和错误')
    const name = string(offset, 100),
      prefix = string(offset + 345, 155),
      size = octal(offset + 124, 12),
      flag = string(offset + 156, 1)
    assert(size <= 8 * MiB && offset + 512 + size <= bytes.length, 'tar 文件截断或过大')
    entries.push({
      path: prefix ? `${prefix}/${name}` : name,
      type: !flag || flag === '0' ? 'file' : flag === '5' ? 'directory' : 'special',
      size,
      data: bytes.subarray(offset + 512, offset + 512 + size),
    })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  assert(ended, 'tar 流缺少完整结尾')
  return entries
}
const CARD_FACES = ['bronze', 'gold', 'legend', 'pioneer', 'silver', 'weekly-black']
export function verifyArchive(path, mode) {
  const compressed = readFileSync(path)
  assert(compressed.length <= 32 * MiB, '压缩包超过 32 MiB')
  const expanded = gunzipSync(compressed, { maxOutputLength: 73 * MiB })
  const report = validateEntries(parseTar(expanded), mode)
  for (const face of CARD_FACES) assert(report.cardFaces.includes(face), `安装包缺少卡面 ${face}`)
  return {
    path,
    ...report,
    compressedBytes: compressed.length,
    sha256: createHash('sha256').update(compressed).digest('hex'),
    gzipCRC: 'verified',
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const reports = [
    verifyArchive('theme.tar.gz', 'wrapped'),
    verifyArchive('release/hub-install/theme.tar.gz', 'hub'),
  ]
  mkdirSync('release', { recursive: true })
  writeFileSync(
    'release/package-verification.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        realHubInstall: 'not verified; source contract and mock integration only',
        archives: reports,
      },
      null,
      2,
    ) + '\n',
  )
  writeFileSync('release/SHA256SUMS.txt', reports.map((r) => `${r.sha256}  ${r.path}`).join('\n') + '\n')
  console.log(JSON.stringify(reports, null, 2))
}
