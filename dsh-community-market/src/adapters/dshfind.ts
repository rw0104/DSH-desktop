import type { CatalogAdapter, CatalogFetchContext } from '../contracts/types.js'
import type { CatalogQuery } from '../contracts/generated/catalog-query.js'
import type { CatalogSnapshot } from '../contracts/generated/catalog-snapshot.js'
import { normalizeRepositoryIdentity } from '../contracts/identity.js'
import { parseCatalogSnapshot } from '../contracts/validate.js'

export const DSHFIND_KEY = 'dshfind'
export const DSHFIND_ENDPOINT = 'https://api.dshfind.com/v1/catalog'
export const DSHFIND_HOSTNAME = 'api.dshfind.com'
export const DSHFIND_PROVIDER_ID = 'com.dshfind.catalog'
export const DSHFIND_ADAPTER_ID = 'market.dshfind-v1'

const DSHFIND_ORIGIN = `https://${DSHFIND_HOSTNAME}`
const DSHFIND_PAGE_SIZE = 100
const MAX_DSHFIND_ITEMS = 25_000
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u
const GITHUB_OWNER_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/iu
const GITHUB_REPOSITORY_PATTERN = /^[a-z0-9._-]{1,100}$/iu
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u
const DATA_VERSION_PATTERN = /^sha256:[0-9a-f]{64}$/u
const NPM_PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const STABLE_SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u
const MAX_NPM_PACKAGE_LENGTH = 214
const MAX_NPM_VERSION_LENGTH = 64
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u

type CatalogItem = CatalogSnapshot['items'][number]

interface DshfindDatasetIdentity {
  readonly dataVersion: string
  readonly asOf: string
  readonly finalUrl: string
}

export interface DshfindAdapterOptions {
  readonly now?: () => Date
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`dshfind ${label} is invalid`)
  }
  return value as number
}

function dateTime(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`dshfind ${label} is invalid`)
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`dshfind ${label} is invalid`)
  return new Date(timestamp).toISOString()
}

function plainText(value: unknown, maxLength: number, allowEmpty = false): string | undefined {
  if (typeof value !== 'string' || value.length > maxLength || UNSAFE_TEXT_PATTERN.test(value)) return undefined
  if (!allowEmpty && value.length === 0) return undefined
  return value
}

function assertFinalOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('dshfind final URL is invalid')
  }
  if (url.origin !== DSHFIND_ORIGIN) {
    throw new Error('dshfind response changed the reviewed provider origin')
  }
  return url.href
}

function parseRawCatalog(value: unknown, finalUrl: string): {
  readonly data: readonly unknown[]
  readonly dataset: DshfindDatasetIdentity
} {
  const raw = record(value)
  if (raw === undefined || !Array.isArray(raw.data)) throw new Error('dshfind full catalog response is invalid')
  const total = safeInteger(raw.total, 'catalog total')
  if (total > MAX_DSHFIND_ITEMS) throw new Error('dshfind catalog exceeded the item limit')
  if (raw.data.length !== total) throw new Error('dshfind full catalog item count did not match its metadata')
  if (typeof raw.data_version !== 'string' || !DATA_VERSION_PATTERN.test(raw.data_version)) {
    throw new Error('dshfind catalog data_version is invalid')
  }
  const asOf = dateTime(raw.as_of, 'catalog as_of')
  return {
    data: raw.data,
    dataset: { dataVersion: raw.data_version, asOf, finalUrl },
  }
}

function repositoryFromItem(raw: Record<string, unknown>): {
  readonly repository: NonNullable<CatalogItem['repository']>
  readonly owner: string
} | undefined {
  if (typeof raw.repository_url !== 'string') return undefined
  try {
    const supplied = new URL(raw.repository_url)
    const segments = supplied.pathname.split('/').filter(Boolean)
    if (
      supplied.protocol !== 'https:'
      || supplied.hostname.toLowerCase() !== 'github.com'
      || supplied.username
      || supplied.password
      || supplied.search
      || supplied.hash
      || segments.length !== 2
    ) return undefined
    const owner = segments[0]!
    const repositoryName = segments[1]!.replace(/\.git$/iu, '')
    if (!GITHUB_OWNER_PATTERN.test(owner) || !GITHUB_REPOSITORY_PATTERN.test(repositoryName)) return undefined

    const fullName = typeof raw.full_name === 'string' ? raw.full_name.split('/') : []
    if (
      fullName.length !== 2
      || fullName[0]!.toLowerCase() !== owner.toLowerCase()
      || fullName[1]!.replace(/\.git$/iu, '').toLowerCase() !== repositoryName.toLowerCase()
    ) return undefined

    return {
      repository: normalizeRepositoryIdentity({ url: `https://github.com/${owner}/${repositoryName}` }),
      owner,
    }
  } catch {
    return undefined
  }
}

function keywords(value: unknown, languageValue: unknown): readonly string[] | undefined {
  const language = plainText(languageValue, 64)
  const tags = Array.isArray(value) ? value : []
  const result: string[] = []
  const seen = new Set<string>()
  const maximumTags = language === undefined ? 64 : 63
  for (const raw of tags) {
    const keyword = plainText(raw, 64)
    if (keyword === undefined || seen.has(keyword)) continue
    seen.add(keyword)
    result.push(keyword)
    if (result.length === maximumTags) break
  }
  if (language !== undefined && !seen.has(language)) result.push(language)
  return result.length === 0 ? undefined : result
}

/**
 * Convert only one provider-reviewed npm target into non-executable catalog
 * identity. dshfind's install.cmd semantics bind install.pkg_name, so a
 * target whose spec disagrees with a supplied pkg_name is self-contradictory
 * and is not trusted. The Host still revalidates the exact version against
 * the npm registry before it can create an install intent.
 */
function reviewedNpmTarget(
  install: Record<string, unknown> | undefined,
): { spec: string; revision: string } | undefined {
  if (install === undefined || !Array.isArray(install.methods)) return undefined
  const packageName = typeof install.pkg_name === 'string' ? install.pkg_name : undefined
  const targets = new Map<string, { spec: string; revision: string }>()
  for (const value of install.methods) {
    const method = record(value)
    if (method === undefined) continue
    if (
      method.kind !== 'npm'
      || method.verification !== 'verified'
      || method.code !== 'repository_backlink'
      || method.requiresBuildAllowance !== false
      || typeof method.spec !== 'string'
      || typeof method.revision !== 'string'
      || method.spec.length > MAX_NPM_PACKAGE_LENGTH
      || method.revision.length > MAX_NPM_VERSION_LENGTH
      || !NPM_PACKAGE_PATTERN.test(method.spec)
      || !STABLE_SEMVER_PATTERN.test(method.revision)
      || (packageName !== undefined && method.spec !== packageName)
    ) continue
    targets.set(`${method.spec}@${method.revision}`, { spec: method.spec, revision: method.revision })
  }
  return targets.size === 1 ? targets.values().next().value : undefined
}

function normalizeItem(value: unknown, context: CatalogFetchContext): CatalogItem | undefined {
  const raw = record(value)
  if (raw === undefined) return undefined
  // The normalized v1 contract cannot carry dshfind's risk warning. Omitting
  // an explicitly risky item is safer than displaying it without that warning.
  if (raw.is_risky === true) return undefined
  const id = plainText(raw.full_name, 160)
  const name = plainText(raw.name, 120)
  if (id === undefined || name === undefined || !IDENTIFIER_PATTERN.test(id)) return undefined
  const identity = repositoryFromItem(raw)
  if (identity === undefined) return undefined

  const description = plainText(raw.description, 5_000, true)
  const summaryCandidate = description === undefined ? undefined : Array.from(description).slice(0, 1_000).join('')
  const summary = summaryCandidate ? summaryCandidate : name
  const category = typeof raw.category === 'string' && CATEGORY_PATTERN.test(raw.category)
    ? raw.category
    : undefined
  const itemKeywords = keywords(raw.tags, raw.language)
  const suppliedOwner = plainText(raw.owner, 120)
  const owner = suppliedOwner?.toLowerCase() === identity.owner.toLowerCase()
    ? suppliedOwner
    : identity.owner
  const pushedAt = typeof raw.pushed_at === 'string' && Number.isFinite(Date.parse(raw.pushed_at))
    ? new Date(Date.parse(raw.pushed_at)).toISOString()
    : undefined
  const npmTarget = reviewedNpmTarget(record(raw.install))

  return {
    id,
    name,
    displayName: name,
    summary,
    ...(description === undefined ? {} : { description }),
    ...(category === undefined ? {} : { categories: [category] }),
    ...(itemKeywords === undefined ? {} : { keywords: [...itemKeywords] }),
    repository: identity.repository,
    publisher: {
      name: owner,
      url: `https://github.com/${identity.owner.toLowerCase()}`,
    },
    ...(pushedAt === undefined ? {} : { updatedAt: pushedAt }),
    // install.cmd and install.pkg_name stay non-executable catalog identity.
    // A package target is exposed only when the provider-reviewed
    // install.methods carry exactly one verified exact-version npm target;
    // the Host still rechecks that version against the npm registry itself
    // before it can create an install intent at preview time.
    ...(npmTarget === undefined ? {} : {
      package: { registry: 'npm' as const, name: npmTarget.spec },
      latestVersion: npmTarget.revision,
    }),
    provenance: {
      sourceRecordId: context.source.sourceRecordId,
      providerId: context.source.providerId,
      itemId: id,
    },
  }
}

function buildSnapshots(
  items: readonly CatalogItem[],
  dataset: DshfindDatasetIdentity,
  context: CatalogFetchContext,
  fetchedAt: string,
): readonly CatalogSnapshot[] {
  const snapshots: CatalogSnapshot[] = []
  for (let offset = 0; offset < items.length; offset += DSHFIND_PAGE_SIZE) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: '1.0.0',
      source: {
        sourceRecordId: context.source.sourceRecordId,
        providerId: context.source.providerId,
        adapterId: context.source.adapterId,
        registrationKind: context.source.registrationKind,
        fetchedAt,
        finalUrl: dataset.finalUrl,
        providerGeneratedAt: dataset.asOf,
        providerRevision: dataset.dataVersion,
      },
      items: items.slice(offset, offset + DSHFIND_PAGE_SIZE),
      page: { total: items.length },
    }))
  }
  if (snapshots.length === 0) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: '1.0.0',
      source: {
        sourceRecordId: context.source.sourceRecordId,
        providerId: context.source.providerId,
        adapterId: context.source.adapterId,
        registrationKind: context.source.registrationKind,
        fetchedAt,
        finalUrl: dataset.finalUrl,
        providerGeneratedAt: dataset.asOf,
        providerRevision: dataset.dataVersion,
      },
      items: [],
      page: { total: 0 },
    }))
  }
  return snapshots
}

function querySnapshot(query: CatalogQuery, snapshots: readonly CatalogSnapshot[]): CatalogSnapshot {
  const first = snapshots[0]
  if (first === undefined) throw new Error('dshfind scan did not produce a snapshot')
  const categories = new Set(query.category ?? [])
  const search = query.q?.toLocaleLowerCase('en-US')
  const hasUnsupportedCapabilities = (query.capability?.length ?? 0) > 0
  let items = snapshots.flatMap(snapshot => snapshot.items).filter(item => {
    if (hasUnsupportedCapabilities) return false
    if (categories.size > 0 && item.categories?.some(category => categories.has(category)) !== true) return false
    if (search === undefined) return true
    return [
      item.id,
      item.name,
      item.displayName,
      item.summary,
      item.description ?? '',
      item.publisher?.name ?? '',
      ...(item.keywords ?? []),
    ].join('\n').toLocaleLowerCase('en-US').includes(search)
  })
  if (query.sort === 'name') {
    items = [...items].sort((left, right) => left.displayName.localeCompare(
      right.displayName,
      query.locale ?? 'en',
      { sensitivity: 'base' },
    ))
  } else if (query.sort === 'updated') {
    items = [...items].sort((left, right) =>
      (Date.parse(right.updatedAt ?? '') || 0) - (Date.parse(left.updatedAt ?? '') || 0))
  }

  const rawCursor = query.cursor ?? '0'
  if (!/^\d+$/u.test(rawCursor)) throw new Error('dshfind cursor is invalid')
  const offset = Number(rawCursor)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > items.length) {
    throw new Error('dshfind cursor is invalid')
  }
  const limit = Math.min(query.limit ?? 50, DSHFIND_PAGE_SIZE)
  const end = Math.min(offset + limit, items.length)
  return parseCatalogSnapshot({
    schemaVersion: '1.0.0',
    source: first.source,
    items: items.slice(offset, end),
    page: {
      total: items.length,
      ...(end < items.length ? { nextCursor: String(end) } : {}),
    },
  })
}

export function createDshfindAdapter(options: DshfindAdapterOptions = {}): CatalogAdapter {
  const now = options.now ?? (() => new Date())

  const scanCatalog: NonNullable<CatalogAdapter['scanCatalog']> = async (_query, context) => {
    const items: CatalogItem[] = []
    const seen = new Set<string>()
    context.signal.throwIfAborted()
    const response = await context.http.getJson(
      DSHFIND_ENDPOINT,
      context.signal,
      { allowedOrigin: DSHFIND_ORIGIN },
    )
    context.signal.throwIfAborted()
    const { data: rawItems, dataset } = parseRawCatalog(
      response.value,
      assertFinalOrigin(response.finalUrl),
    )

    for (const rawItem of rawItems) {
      const raw = record(rawItem)
      const rawId = raw === undefined ? undefined : plainText(raw.full_name, 160)
      if (rawId !== undefined && IDENTIFIER_PATTERN.test(rawId)) {
        const duplicateKey = rawId.toLocaleLowerCase('en-US')
        if (seen.has(duplicateKey)) throw new Error('dshfind catalog contains duplicate item IDs')
        seen.add(duplicateKey)
      }
      const item = normalizeItem(rawItem, context)
      if (item !== undefined) items.push(item)
    }

    return buildSnapshots(items, dataset, context, now().toISOString())
  }

  return {
    adapterId: DSHFIND_ADAPTER_ID,
    async fetch(query, context) {
      return querySnapshot(query, await scanCatalog(query, context))
    },
    scanCatalog,
  }
}

export const dshfindAdapter = createDshfindAdapter()
