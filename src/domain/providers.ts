import {
  siAkamai,
  siAlibabacloud,
  siAlmalinux,
  siAlpinelinux,
  siArchlinux,
  siCentos,
  siCloudflare,
  siContabo,
  siDebian,
  siDigitalocean,
  siFedora,
  siFreebsd,
  siGentoo,
  siGodaddy,
  siGooglecloud,
  siHetzner,
  siHostinger,
  siHuawei,
  siIonos,
  siKalilinux,
  siLinux,
  siMacos,
  siNamecheap,
  siNixos,
  siOpensuse,
  siOpenwrt,
  siOvh,
  siProxmox,
  siRedhat,
  siRockylinux,
  siScaleway,
  siUbuntu,
  siUpcloud,
  siVultr,
} from 'simple-icons'

/** Brand mark from Simple Icons (CC0): a 24x24 path drawn in the brand colour. */
export interface BrandIcon {
  path: string
  hex: string
}
export interface Badge {
  name: string
  icon?: BrandIcon
  /** Text mark for brands without a Simple Icons glyph. */
  short?: string
}
export interface Provider extends Badge {
  id: string
  /** Bundled logo for brands Simple Icons lacks. */
  image?: string
}
const mark = (icon: { path: string; hex: string }): BrandIcon => ({ path: icon.path, hex: icon.hex })
// Logos taken from each provider's own site (src/assets/providers/), shown only to identify the provider.
const logos = import.meta.glob<string>('../assets/providers/*.{webp,svg}', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})
const logo = (file: string) => logos[`../assets/providers/${file}`]

/** VPS providers offered in node settings; `custom` (own name and logo) is handled by the config. */
export const providers: Provider[] = [
  { id: 'aws', name: 'AWS', short: 'AWS' },
  { id: 'aliyun', name: '阿里云', icon: mark(siAlibabacloud) },
  { id: 'tencent', name: '腾讯云', short: '腾讯云' },
  { id: 'huawei', name: '华为云', icon: mark(siHuawei) },
  { id: 'googlecloud', name: 'Google Cloud', icon: mark(siGooglecloud) },
  { id: 'azure', name: 'Azure', short: 'Azure' },
  { id: 'oracle', name: 'Oracle Cloud', short: 'Oracle' },
  { id: 'digitalocean', name: 'DigitalOcean', icon: mark(siDigitalocean) },
  { id: 'vultr', name: 'Vultr', icon: mark(siVultr) },
  { id: 'linode', name: 'Linode / Akamai', icon: mark(siAkamai) },
  { id: 'hetzner', name: 'Hetzner', icon: mark(siHetzner) },
  { id: 'ovh', name: 'OVHcloud', icon: mark(siOvh) },
  { id: 'cloudflare', name: 'Cloudflare', icon: mark(siCloudflare) },
  { id: 'scaleway', name: 'Scaleway', icon: mark(siScaleway) },
  { id: 'contabo', name: 'Contabo', icon: mark(siContabo) },
  { id: 'upcloud', name: 'UpCloud', icon: mark(siUpcloud) },
  { id: 'ionos', name: 'IONOS', icon: mark(siIonos) },
  { id: 'hostinger', name: 'Hostinger', icon: mark(siHostinger) },
  { id: 'godaddy', name: 'GoDaddy', icon: mark(siGodaddy) },
  { id: 'namecheap', name: 'Namecheap', icon: mark(siNamecheap) },
  { id: 'racknerd', name: 'RackNerd', short: 'RackNerd' },
  { id: 'bandwagon', name: '搬瓦工', short: '搬瓦工' },
  { id: 'dmit', name: 'DMIT', short: 'DMIT' },
  { id: 'cloudcone', name: 'CloudCone', image: logo('cloudcone.webp') },
  { id: 'bagevm', name: 'BageVM', image: logo('bagevm.webp') },
  { id: 'vmiss', name: 'VMISS', image: logo('vmiss.svg') },
  { id: 'akile', name: 'Akile', image: logo('akile.webp') },
]
export const providerOf = (id: unknown) => providers.find((p) => p.id === id)

const systems: [RegExp, Badge][] = [
  [/debian/i, { name: 'Debian', icon: mark(siDebian) }],
  [/ubuntu/i, { name: 'Ubuntu', icon: mark(siUbuntu) }],
  [/centos/i, { name: 'CentOS', icon: mark(siCentos) }],
  [/alpine/i, { name: 'Alpine Linux', icon: mark(siAlpinelinux) }],
  [/rocky/i, { name: 'Rocky Linux', icon: mark(siRockylinux) }],
  [/alma/i, { name: 'AlmaLinux', icon: mark(siAlmalinux) }],
  [/fedora/i, { name: 'Fedora', icon: mark(siFedora) }],
  [/\barch\b|archlinux/i, { name: 'Arch Linux', icon: mark(siArchlinux) }],
  [/red ?hat|\brhel\b/i, { name: 'Red Hat', icon: mark(siRedhat) }],
  [/suse/i, { name: 'openSUSE', icon: mark(siOpensuse) }],
  [/freebsd/i, { name: 'FreeBSD', icon: mark(siFreebsd) }],
  [/kali/i, { name: 'Kali Linux', icon: mark(siKalilinux) }],
  [/gentoo/i, { name: 'Gentoo', icon: mark(siGentoo) }],
  [/nixos/i, { name: 'NixOS', icon: mark(siNixos) }],
  [/openwrt/i, { name: 'OpenWrt', icon: mark(siOpenwrt) }],
  [/proxmox/i, { name: 'Proxmox', icon: mark(siProxmox) }],
  [/mac ?os|darwin/i, { name: 'macOS', icon: mark(siMacos) }],
  [/windows/i, { name: 'Windows', short: 'Win' }],
  [/linux/i, { name: 'Linux', icon: mark(siLinux) }],
]
/** Badge for the OS name the agent reports, or null when it is empty or unknown. */
export const osBadge = (os: string): Badge | null =>
  systems.find(([pattern]) => pattern.test(os))?.[1] ?? null
