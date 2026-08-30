/** Materialize only subprocess, CLI, and native consumers beside app.asar. */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, posix, sep } from 'node:path'
import { extractFile, listPackage, statFile } from '@electron/asar'

export const PHYSICAL_RUNTIME_MANIFEST = 'physical-runtime-manifest.json'

interface PathPrefixConsumer {
  readonly id: string
  readonly kind: 'path-prefix'
  readonly entries: readonly string[]
  readonly reason: string
}

interface PackageConsumer {
  readonly id: string
  readonly kind: 'package-closure' | 'package-tree'
  readonly roots: readonly string[]
  readonly reason: string
}

interface AsarUnpackedConsumer {
  readonly id: string
  readonly kind: 'asar-unpacked'
  readonly reason: string
}

interface ClientBundleConsumer {
  readonly id: string
  readonly kind: 'client-bundles'
  readonly reason: string
}

export type PhysicalRuntimeConsumer = PathPrefixConsumer | PackageConsumer | AsarUnpackedConsumer | ClientBundleConsumer

export interface PhysicalRuntimePolicy {
  readonly schemaVersion: 1
  readonly consumers: readonly PhysicalRuntimeConsumer[]
}

export interface PhysicalArchiveEntry {
  readonly path: string
  readonly size: number
  readonly unpacked: boolean
  readonly executable: boolean
}

export interface PhysicalRuntimeManifestFile {
  readonly path: string
  readonly size: number
  readonly sha256: string
  readonly consumers: readonly string[]
}

export interface PhysicalRuntimeManifest {
  readonly schemaVersion: 1
  readonly archiveEntries: number
  readonly packageRoots: readonly string[]
  readonly consumers: readonly {
    readonly id: string
    readonly kind: PhysicalRuntimeConsumer['kind']
    readonly reason: string
    readonly files: number
  }[]
  readonly files: readonly PhysicalRuntimeManifestFile[]
}

function normalizePath(filename: string): string {
  return filename.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '')
}

function nativeArchivePath(filename: string): string {
  return normalizePath(filename).split('/').join(sep)
}

/** Validate policy data before it controls filesystem materialization. */
export function parsePhysicalRuntimePolicy(value: unknown): PhysicalRuntimePolicy {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('physical runtime policy must be an object')
  }
  const policy = value as { schemaVersion?: unknown, consumers?: unknown }
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.consumers) || policy.consumers.length === 0) {
    throw new Error('physical runtime policy requires schemaVersion 1 and consumers')
  }
  const ids = new Set<string>()
  for (const raw of policy.consumers) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('physical runtime consumers must be objects')
    }
    const consumer = raw as Record<string, unknown>
    if (typeof consumer.id !== 'string' || consumer.id.length === 0 || ids.has(consumer.id)) {
      throw new Error('physical runtime consumer ids must be unique non-empty strings')
    }
    ids.add(consumer.id)
    if (typeof consumer.reason !== 'string' || consumer.reason.length === 0) {
      throw new Error(`physical runtime consumer ${consumer.id} requires a reason`)
    }
    if (consumer.kind === 'path-prefix') {
      if (!Array.isArray(consumer.entries) || consumer.entries.some(entry => typeof entry !== 'string' || entry.length === 0)) {
        throw new Error(`physical runtime consumer ${consumer.id} requires entries`)
      }
    } else if (consumer.kind === 'package-closure' || consumer.kind === 'package-tree') {
      if (!Array.isArray(consumer.roots) || consumer.roots.some(root => typeof root !== 'string' || root.length === 0)) {
        throw new Error(`physical runtime consumer ${consumer.id} requires package roots`)
      }
    } else if (consumer.kind !== 'asar-unpacked' && consumer.kind !== 'client-bundles') {
      throw new Error(`physical runtime consumer ${consumer.id} has unsupported kind ${String(consumer.kind)}`)
    }
  }
  return policy as PhysicalRuntimePolicy
}

/** Inspect ASAR file entries while preserving Electron Builder's native unpack decisions. */
export function physicalArchiveEntries(archivePath: string): readonly PhysicalArchiveEntry[] {
  const entries: PhysicalArchiveEntry[] = []
  for (const rawEntry of listPackage(archivePath, { isPack: false })) {
    const path = normalizePath(rawEntry)
    if (path.length === 0) continue
    const value = statFile(archivePath, nativeArchivePath(path))
    if (!('size' in value) || typeof value.size !== 'number') continue
    entries.push({
      path,
      size: value.size,
      unpacked: value.unpacked === true,
      executable: 'executable' in value && value.executable === true,
    })
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

function packageRootFromManifest(path: string): string {
  return path === 'package.json' ? '' : path.slice(0, -'/package.json'.length)
}

function resolveArchivePackageRoot(
  packageRoots: ReadonlySet<string>,
  fromRoot: string,
  packageName: string,
): string | undefined {
  const packageSegments = packageName.split('/')
  let current = fromRoot
  while (true) {
    const candidate = normalizePath(posix.join(current, 'node_modules', ...packageSegments))
    if (packageRoots.has(candidate)) return candidate
    if (current.length === 0) return undefined
    const parent = posix.dirname(current)
    current = parent === '.' ? '' : parent
  }
}

function pathBelongsToPackage(path: string, packageRoot: string): boolean {
  if (packageRoot.length === 0) return path.length > 0 && !path.startsWith('../')
  return path === `${packageRoot}/package.json` || path.startsWith(`${packageRoot}/`)
}

function clientExportPath(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  for (const key of ['default', 'import', 'require', 'node', 'browser']) {
    const path = clientExportPath(record[key])
    if (path !== undefined) return path
  }
  return undefined
}

function packageClientPath(packageRoot: string, manifest: Record<string, unknown>): string | undefined {
  const dsh = manifest.dsh
  if (dsh === null || typeof dsh !== 'object' || Array.isArray(dsh)) return undefined
  const client = (dsh as Record<string, unknown>).client
  if (client === null || typeof client !== 'object' || Array.isArray(client)) return undefined
  if ((client as Record<string, unknown>).platform !== 'web') return undefined
  const exports = manifest.exports
  if (exports === null || typeof exports !== 'object' || Array.isArray(exports)) return undefined
  const clientExport = clientExportPath((exports as Record<string, unknown>)['./client'])
  if (clientExport === undefined || !clientExport.startsWith('./')) return undefined
  const path = normalizePath(posix.join(packageRoot, clientExport.slice(2)))
  return pathBelongsToPackage(path, packageRoot) ? path : undefined
}

async function physicalFiles(root: string): Promise<readonly string[]> {
  if (!existsSync(root)) return []
  const files: string[] = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    if (directory === undefined) continue
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile()) files.push(normalizePath(filename.slice(root.length + 1)))
    }
  }
  return files.sort()
}

async function pruneUnselectedPhysicalFiles(root: string, selected: ReadonlySet<string>): Promise<void> {
  for (const path of await physicalFiles(root)) {
    if (selected.has(path)) continue
    await unlink(join(root, ...path.split('/')))
  }
}

/** Resolve one consumer policy to exact logical ASAR files. */
export async function selectPhysicalRuntimeFiles(
  entries: readonly PhysicalArchiveEntry[],
  policy: PhysicalRuntimePolicy,
  readArchiveFile: (path: string) => Promise<Buffer>,
): Promise<{
  readonly selected: ReadonlyMap<string, ReadonlySet<string>>
  readonly packageRoots: readonly string[]
}> {
  const entryByPath = new Map(entries.map(entry => [entry.path, entry]))
  const manifestPaths = entries.map(entry => entry.path).filter(path => path === 'package.json' || path.endsWith('/package.json'))
  const packageRoots = new Set(manifestPaths.map(packageRootFromManifest))
  const manifests = new Map<string, Record<string, unknown>>()
  const selected = new Map<string, Set<string>>()

  const select = (path: string, consumerId: string): void => {
    if (!entryByPath.has(path)) return
    const consumers = selected.get(path) ?? new Set<string>()
    consumers.add(consumerId)
    selected.set(path, consumers)
  }
  const selectPackageTree = (packageRoot: string, consumerId: string): void => {
    for (const entry of entries) {
      if (pathBelongsToPackage(entry.path, packageRoot)) select(entry.path, consumerId)
    }
  }
  const readManifest = async (packageRoot: string): Promise<Record<string, unknown>> => {
    const current = manifests.get(packageRoot)
    if (current !== undefined) return current
    const path = packageRoot.length === 0 ? 'package.json' : `${packageRoot}/package.json`
    const value: unknown = JSON.parse((await readArchiveFile(path)).toString('utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`physical runtime package manifest ${path} must be an object`)
    }
    manifests.set(packageRoot, value as Record<string, unknown>)
    return value as Record<string, unknown>
  }

  for (const consumer of policy.consumers) {
    if (consumer.kind === 'path-prefix') {
      for (const configured of consumer.entries) {
        const path = normalizePath(configured)
        const prefix = configured.endsWith('/') ? `${path}/` : undefined
        for (const entry of entries) {
          if (entry.path === path || (prefix !== undefined && entry.path.startsWith(prefix))) {
            select(entry.path, consumer.id)
          }
        }
      }
    } else if (consumer.kind === 'asar-unpacked') {
      for (const entry of entries) if (entry.unpacked) select(entry.path, consumer.id)
    } else if (consumer.kind === 'client-bundles') {
      for (const packageRoot of packageRoots) {
        const manifest = await readManifest(packageRoot)
        const clientPath = packageClientPath(packageRoot, manifest)
        if (clientPath === undefined) continue
        select(packageRoot.length === 0 ? 'package.json' : `${packageRoot}/package.json`, consumer.id)
        select(clientPath, consumer.id)
      }
    } else {
      const roots = consumer.roots.map((root) => {
        const resolved = resolveArchivePackageRoot(packageRoots, '', root)
        if (resolved === undefined) throw new Error(`physical runtime cannot resolve package root ${root}`)
        return resolved
      })
      if (consumer.kind === 'package-tree') {
        for (const root of roots) selectPackageTree(root, consumer.id)
        continue
      }
      const queue = [...roots]
      const visited = new Set<string>()
      while (queue.length > 0) {
        const packageRoot = queue.shift()
        if (packageRoot === undefined || visited.has(packageRoot)) continue
        visited.add(packageRoot)
        selectPackageTree(packageRoot, consumer.id)
        const manifest = await readManifest(packageRoot)
        for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
          const values = manifest[field]
          if (values === null || typeof values !== 'object' || Array.isArray(values)) continue
          for (const dependency of Object.keys(values as Record<string, unknown>).sort()) {
            const resolved = resolveArchivePackageRoot(packageRoots, packageRoot, dependency)
            if (resolved !== undefined && !visited.has(resolved)) queue.push(resolved)
          }
        }
      }
    }
  }
  return {
    selected,
    packageRoots: [...packageRoots].filter(root => root.length > 0).sort(),
  }
}

/** Build the exact physical runtime and write its integrity manifest. */
export async function materializePhysicalRuntime(
  archivePath: string,
  unpackedRoot: string,
  policyPath = new URL('../build/physical-runtime-policy.json', import.meta.url),
): Promise<PhysicalRuntimeManifest> {
  const policy = parsePhysicalRuntimePolicy(JSON.parse(await readFile(policyPath, 'utf8')) as unknown)
  const entries = physicalArchiveEntries(archivePath)
  const entryByPath = new Map(entries.map(entry => [entry.path, entry]))
  const readArchiveFile = async (path: string): Promise<Buffer> => {
    const physicalPath = join(unpackedRoot, ...normalizePath(path).split('/'))
    if (existsSync(physicalPath)) return await readFile(physicalPath)
    return extractFile(archivePath, nativeArchivePath(path))
  }
  const selection = await selectPhysicalRuntimeFiles(entries, policy, readArchiveFile)
  const manifestFiles: PhysicalRuntimeManifestFile[] = []
  await mkdir(unpackedRoot, { recursive: true })
  await pruneUnselectedPhysicalFiles(unpackedRoot, new Set(selection.selected.keys()))
  for (const [path, consumerIds] of [...selection.selected].sort(([left], [right]) => left.localeCompare(right))) {
    const entry = entryByPath.get(path)
    if (entry === undefined) throw new Error(`physical runtime selected missing ASAR entry ${path}`)
    const data = await readArchiveFile(path)
    const output = join(unpackedRoot, ...path.split('/'))
    await mkdir(dirname(output), { recursive: true })
    if (!existsSync(output)) await writeFile(output, data)
    if (entry.executable && process.platform !== 'win32') await chmod(output, 0o755)
    manifestFiles.push({
      path,
      size: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      consumers: [...consumerIds].sort(),
    })
  }
  const consumers = policy.consumers.map(consumer => ({
    id: consumer.id,
    kind: consumer.kind,
    reason: consumer.reason,
    files: manifestFiles.filter(file => file.consumers.includes(consumer.id)).length,
  }))
  const manifest: PhysicalRuntimeManifest = {
    schemaVersion: 1,
    archiveEntries: entries.length,
    packageRoots: selection.packageRoots,
    consumers,
    files: manifestFiles,
  }
  await writeFile(join(unpackedRoot, PHYSICAL_RUNTIME_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

/** Verify the generated manifest contents and physical hashes. */
export async function verifyPhysicalRuntimeManifest(
  unpackedRoot: string,
): Promise<PhysicalRuntimeManifest> {
  const manifestPath = join(unpackedRoot, PHYSICAL_RUNTIME_MANIFEST)
  const value: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('physical runtime manifest must be an object')
  }
  const manifest = value as Partial<PhysicalRuntimeManifest>
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.consumers)) {
    throw new Error('physical runtime manifest requires schemaVersion 1, files, and consumers')
  }
  const seen = new Set<string>()
  for (const file of manifest.files) {
    if (seen.has(file.path)) throw new Error(`physical runtime manifest repeats ${file.path}`)
    seen.add(file.path)
    const filename = join(unpackedRoot, ...normalizePath(file.path).split('/'))
    const data = await readFile(filename)
    const hash = createHash('sha256').update(data).digest('hex')
    if (data.length !== file.size || hash !== file.sha256) {
      throw new Error(`physical runtime integrity mismatch for ${file.path}`)
    }
  }
  const extras = (await physicalFiles(unpackedRoot))
    .filter(path => path !== PHYSICAL_RUNTIME_MANIFEST && !seen.has(path))
  if (extras.length > 0) {
    throw new Error(`physical runtime contains undeclared files: ${extras.slice(0, 8).join(', ')}`)
  }
  return manifest as PhysicalRuntimeManifest
}
