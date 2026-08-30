import { describe, expect, it, vi } from 'vitest'
import {
  createDshfindAdapter,
  DSHFIND_ADAPTER_ID,
  DSHFIND_KEY,
  DSHFIND_PROVIDER_ID,
} from '../src/adapters/dshfind.js'
import type { CatalogHttpClient, LocalSourceRecord } from '../src/contracts/index.js'

const DATA_VERSION = `sha256:${'a'.repeat(64)}`
const AS_OF = '2026-08-18T03:30:27Z'

const source = (): LocalSourceRecord => ({
  sourceRecordId: '018f1f77-a5c4-7b73-a9ae-0242ac120003',
  registrationKind: 'built-in',
  adapterId: DSHFIND_ADAPTER_ID,
  providerId: DSHFIND_PROVIDER_ID,
  builtInProviderKey: DSHFIND_KEY,
  enabled: true,
  order: 0,
})

function rawItem(index: number): Record<string, unknown> {
  return {
    full_name: `owner/plugin-${index}`,
    name: `plugin-${index}`,
    owner: 'owner',
    repository_url: `https://github.com/owner/plugin-${index}`,
    url: `https://github.com/owner/plugin-${index}`,
    description: `Plugin ${index} summary`,
    tags: ['memory', 'tools', 'memory'],
    language: 'TypeScript',
    pushed_at: '2026-08-17T12:00:00Z',
    category: 'memory',
    score: 90,
    grade: 'S',
    is_featured: true,
    is_risky: false,
    install: {
      cmd: `unsafe-command-${index}`,
      kind: 'npm',
      pkg_name: `unsafe-package-${index}`,
      npm_published: true,
    },
  }
}

function rawCatalog(
  data: readonly unknown[],
  dataVersion = DATA_VERSION,
  total = data.length,
): Record<string, unknown> {
  return {
    data,
    total,
    data_version: dataVersion,
    as_of: AS_OF,
    generated_at: AS_OF,
  }
}

describe('dshfind adapter', () => {
  it('downloads one atomic full catalog and emits browse-only identity', async () => {
    const allItems = Array.from({ length: 101 }, (_, index) => rawItem(index))
    const getJson = vi.fn(async (url: string) => ({ value: rawCatalog(allItems), finalUrl: url }))
    const register = vi.fn(() => 'mktimg_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    const adapter = createDshfindAdapter({ now: () => new Date('2026-08-18T09:30:00Z') })

    const snapshots = await adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http: { getJson },
      media: { register },
    })

    const items = snapshots.flatMap(snapshot => snapshot.items)
    expect(items).toHaveLength(101)
    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]?.source).toMatchObject({
      providerRevision: DATA_VERSION,
      providerGeneratedAt: '2026-08-18T03:30:27.000Z',
      fetchedAt: '2026-08-18T09:30:00.000Z',
    })
    expect(items[0]).toEqual({
      id: 'owner/plugin-0',
      name: 'plugin-0',
      displayName: 'plugin-0',
      summary: 'Plugin 0 summary',
      description: 'Plugin 0 summary',
      categories: ['memory'],
      keywords: ['memory', 'tools', 'TypeScript'],
      repository: { url: 'https://github.com/owner/plugin-0' },
      publisher: { name: 'owner', url: 'https://github.com/owner' },
      updatedAt: '2026-08-17T12:00:00.000Z',
      provenance: {
        sourceRecordId: source().sourceRecordId,
        providerId: DSHFIND_PROVIDER_ID,
        itemId: 'owner/plugin-0',
      },
    })
    expect(JSON.stringify(snapshots)).not.toContain('unsafe-command')
    expect(JSON.stringify(snapshots)).not.toContain('unsafe-package')
    expect(register).not.toHaveBeenCalled()
    expect(getJson).toHaveBeenCalledOnce()

    const firstUrl = new URL(getJson.mock.calls[0]![0])
    expect(firstUrl.pathname).toBe('/v1/catalog')
    expect(firstUrl.searchParams.has('data_version')).toBe(false)
    expect(getJson).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.any(AbortSignal),
      { allowedOrigin: 'https://api.dshfind.com' },
    )
  })

  it('rejects redirects outside the exact reviewed origin', async () => {
    const http: CatalogHttpClient = {
      getJson: vi.fn().mockResolvedValue({
        value: rawCatalog([rawItem(0)]),
        finalUrl: 'https://attacker.example/v1/catalog',
      }),
    }
    const adapter = createDshfindAdapter()

    await expect(adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http,
      media: { register: vi.fn() },
    })).rejects.toThrow(/reviewed provider origin/u)
  })

  it('omits explicitly risky items while retaining false and unknown risk states', async () => {
    const unknownRisk = rawItem(2)
    delete unknownRisk.is_risky
    const risky = {
      ...rawItem(1),
      is_risky: true,
      risk_note: 'Known impersonation fixture',
    }
    const adapter = createDshfindAdapter()
    const http: CatalogHttpClient = {
      getJson: vi.fn(async url => ({
        value: rawCatalog([rawItem(0), risky, unknownRisk]),
        finalUrl: url,
      })),
    }

    const snapshots = await adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http,
      media: { register: vi.fn() },
    })

    expect(snapshots.flatMap(snapshot => snapshot.items).map(item => item.id)).toEqual([
      'owner/plugin-0',
      'owner/plugin-2',
    ])
    expect(snapshots[0]?.page.total).toBe(2)
  })

  it('rejects catalogs above the bounded item limit or with an incomplete full snapshot', async () => {
    const adapter = createDshfindAdapter()
    const itemLimitHttp: CatalogHttpClient = {
      getJson: vi.fn(async url => ({
        value: rawCatalog([], DATA_VERSION, 25_001),
        finalUrl: url,
      })),
    }

    await expect(adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http: itemLimitHttp,
      media: { register: vi.fn() },
    })).rejects.toThrow(/item limit/u)

    const incompleteHttp: CatalogHttpClient = {
      getJson: vi.fn(async url => ({
        value: rawCatalog([], DATA_VERSION, 1),
        finalUrl: url,
      })),
    }
    await expect(adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http: incompleteHttp,
      media: { register: vi.fn() },
    })).rejects.toThrow(/item count/u)
  })

  it('rejects duplicate IDs and invalid dataset metadata in the full snapshot', async () => {
    const adapter = createDshfindAdapter()
    const duplicateHttp: CatalogHttpClient = {
      getJson: vi.fn(async url => ({
        value: rawCatalog([rawItem(0), rawItem(0)]),
        finalUrl: url,
      })),
    }
    await expect(adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http: duplicateHttp,
      media: { register: vi.fn() },
    })).rejects.toThrow(/duplicate item IDs/u)

    const invalidVersionHttp: CatalogHttpClient = {
      getJson: vi.fn(async url => ({
        value: rawCatalog([rawItem(0)], 'latest'),
        finalUrl: url,
      })),
    }
    await expect(adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http: invalidVersionHttp,
      media: { register: vi.fn() },
    })).rejects.toThrow(/data_version/u)
  })

  it('checks cancellation after the full catalog response arrives', async () => {
    const controller = new AbortController()
    const getJson = vi.fn(async (url: string) => {
      controller.abort(new DOMException('fixture abort', 'AbortError'))
      return { value: rawCatalog([rawItem(0)]), finalUrl: url }
    })
    const adapter = createDshfindAdapter()
    const scan = adapter.scanCatalog!({}, {
      source: source(),
      signal: controller.signal,
      http: { getJson },
      media: { register: vi.fn() },
    })

    await expect(scan).rejects.toMatchObject({ name: 'AbortError' })
    expect(getJson).toHaveBeenCalledOnce()
  })
})

describe('dshfind install target normalization', () => {
  const reviewedMethod = {
    kind: 'npm',
    verification: 'verified',
    code: 'repository_backlink',
    requiresBuildAllowance: false,
    spec: 'dsh-plugin-0',
    revision: '1.2.3',
  }
  const baseInstall = {
    cmd: 'provider command text',
    kind: 'npm',
    pkg_name: 'dsh-plugin-0',
    npm_published: true,
  }

  async function scanInstall(install: unknown) {
    const adapter = createDshfindAdapter()
    const http: CatalogHttpClient = {
      getJson: vi.fn(async url => ({
        value: rawCatalog([{ ...rawItem(0), install }]),
        finalUrl: url,
      })),
    }
    const snapshots = await adapter.scanCatalog!({}, {
      source: source(),
      signal: new AbortController().signal,
      http,
      media: { register: vi.fn() },
    })
    return snapshots.flatMap(snapshot => snapshot.items)
  }

  it('exposes one reviewed exact npm target without exposing the provider command', async () => {
    const items = await scanInstall({
      ...baseInstall,
      methods: [reviewedMethod, { ...reviewedMethod }],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'owner/plugin-0',
      repository: { url: 'https://github.com/owner/plugin-0' },
      package: { registry: 'npm', name: 'dsh-plugin-0' },
      latestVersion: '1.2.3',
    })
    expect(JSON.stringify(items)).not.toContain('provider command text')
  })

  it.each([
    ['missing methods', baseInstall],
    ['a non-object install', 'npm install dsh-plugin-0'],
    ['an unverified method', { ...baseInstall, methods: [{ ...reviewedMethod, verification: 'unverified' }] }],
    ['a wrong verification code', { ...baseInstall, methods: [{ ...reviewedMethod, code: 'unlinked_package' }] }],
    ['a build allowance requirement', { ...baseInstall, methods: [{ ...reviewedMethod, requiresBuildAllowance: true }] }],
    ['a prerelease version', { ...baseInstall, methods: [{ ...reviewedMethod, revision: '1.2.4-rc.1' }] }],
    ['a mutable tag instead of a version', { ...baseInstall, methods: [{ ...reviewedMethod, revision: 'latest' }] }],
    ['an invalid package name', { ...baseInstall, methods: [{ ...reviewedMethod, spec: 'Not A Package!' }] }],
    ['an overlong package name', { ...baseInstall, pkg_name: undefined, methods: [{ ...reviewedMethod, spec: `dsh-${'a'.repeat(211)}` }] }],
    ['an overlong version', { ...baseInstall, methods: [{ ...reviewedMethod, revision: `${'1'.repeat(63)}.2.3` }] }],
    ['a spec disagreeing with pkg_name', { ...baseInstall, methods: [{ ...reviewedMethod, spec: 'other-package' }] }],
    ['ambiguous reviewed targets', {
      ...baseInstall,
      pkg_name: undefined,
      methods: [reviewedMethod, { ...reviewedMethod, spec: 'another-package', revision: '2.0.0' }],
    }],
  ] as const)('does not expose an install identity for %s', async (_label, install) => {
    const items = await scanInstall(install)

    expect(items).toHaveLength(1)
    expect(items[0]).not.toHaveProperty('package')
    expect(items[0]).not.toHaveProperty('latestVersion')
  })
})
