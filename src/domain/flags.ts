/** Country flags from flag-icons (MIT), bundled as separate assets that load only when shown. */
const flags = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})
export function flagUrl(code: string): string | undefined {
  const id = code.trim().toLowerCase()
  return /^[a-z]{2}$/.test(id) && id !== 'xx'
    ? flags[`/node_modules/flag-icons/flags/4x3/${id}.svg`]
    : undefined
}
