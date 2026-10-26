import { describe, expect, it } from 'vitest'
import { providers, providerOf, osBadge } from '../src/domain/providers'
import { flagUrl } from '../src/domain/flags'

describe('provider registry', () => {
  it('lists common providers with brand icons or a text mark', () => {
    for (const id of ['aliyun', 'googlecloud', 'digitalocean', 'vultr', 'hetzner', 'ovh', 'cloudflare'])
      expect(providerOf(id)?.icon?.hex).toMatch(/^[0-9A-F]{6}$/)
    for (const [id, text] of [
      ['aws', 'AWS'],
      ['tencent', '腾讯云'],
      ['oracle', 'Oracle'],
    ] as const) {
      expect(providerOf(id)?.icon).toBeUndefined()
      expect(providerOf(id)?.short).toBe(text)
    }
    expect(new Set(providers.map((p) => p.id)).size).toBe(providers.length)
    expect(providerOf('custom')).toBeUndefined()
    expect(providerOf('nope')).toBeUndefined()
  })
})

describe('operating system badge', () => {
  it('recognises the reported OS name', () => {
    expect(osBadge('Debian GNU/Linux 12 (bookworm)')).toMatchObject({
      name: 'Debian',
      icon: { hex: 'A81D33' },
    })
    expect(osBadge('Ubuntu 22.04.4 LTS')?.name).toBe('Ubuntu')
    expect(osBadge('Rocky Linux 9.3')?.name).toBe('Rocky Linux')
    expect(osBadge('Red Hat Enterprise Linux 9')?.name).toBe('Red Hat')
    expect(osBadge('Windows Server 2022')?.icon).toBeUndefined()
    expect(osBadge('Windows Server 2022')?.short).toBe('Win')
    expect(osBadge('Some Linux')?.name).toBe('Linux')
    expect(osBadge('')).toBeNull()
  })
})

describe('country flags', () => {
  it('maps ISO codes to bundled flag images', () => {
    expect(flagUrl('JP')).toMatch(/jp\.svg/)
    expect(flagUrl('hk')).toMatch(/hk\.svg/)
    expect(flagUrl('XX')).toBeUndefined()
    expect(flagUrl('')).toBeUndefined()
  })
})
