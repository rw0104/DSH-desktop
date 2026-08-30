/** Bridge CommonJS client-package discovery to the selected packaged app. */

import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { unpackedAsarPath } from './packaged-runtime-path.ts'

const PHYSICAL_RUNTIME_MANIFEST = 'physical-runtime-manifest.json'
const CLIENT_BUNDLES_CONSUMER = 'client-bundles'
const NODE_MODULES_PREFIX = 'node_modules/'
const DESKTOP_PACKAGE_NAME = 'dsh-plugin-desktop'

interface ManifestFile {
  readonly path: string
  readonly consumers: readonly string[]
}

interface PhysicalManifest {
  readonly schemaVersion: number
  readonly files: readonly ManifestFile[]
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '')
}

/** Extract npm package names whose package.json is in the client bundle closure. */
export function clientFallbackPackageNames(manifest: unknown): readonly string[] {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('dsh-plugin-desktop: physical runtime manifest must be an object')
  }
  const value = manifest as Partial<PhysicalManifest>
  if (value.schemaVersion !== 1 || !Array.isArray(value.files)) {
    throw new Error('dsh-plugin-desktop: physical runtime manifest schema is unsupported')
  }
  const names = new Set<string>()
  for (const file of value.files) {
    if (file === null || typeof file !== 'object' || typeof file.path !== 'string' || !Array.isArray(file.consumers)) continue
    if (!file.consumers.includes(CLIENT_BUNDLES_CONSUMER)) continue
    const path = normalizePath(file.path)
    if (!path.startsWith(NODE_MODULES_PREFIX) || !path.endsWith('/package.json')) continue
    const segments = path.slice(NODE_MODULES_PREFIX.length, -'/package.json'.length).split('/')
    const name = segments[0]?.startsWith('@') === true
      ? segments.slice(0, 2).join('/')
      : segments[0]
    if (name !== undefined && name.length > 0) names.add(name)
  }
  return [...names].sort()
}

function ensureJunction(link: string, target: string): void {
  let current
  try {
    current = lstatSync(link)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
  }
  if (current !== undefined) {
    if (!current.isSymbolicLink()) {
      throw new Error(`dsh-plugin-desktop: client fallback path is not a symlink: ${link}`)
    }
    if (resolve(dirname(link), readlinkSync(link)) === resolve(target)) return
    unlinkSync(link)
  }
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(target, link, 'junction')
}

/** Install only package roots needed by ClientModuleRegistry's CommonJS resolver. */
export function ensurePackagedClientModuleFallback(
  installationAnchor: string,
  home: string,
): readonly string[] {
  const physicalPackageRoot = dirname(unpackedAsarPath(installationAnchor))
  const manifestPath = join(physicalPackageRoot, PHYSICAL_RUNTIME_MANIFEST)
  if (!existsSync(manifestPath)) {
    throw new Error(`dsh-plugin-desktop: packaged client fallback manifest is missing: ${manifestPath}`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
  const names = new Set(clientFallbackPackageNames(manifest))
  // The desktop package is the one client bundle that lives at the app root,
  // not below app.asar/node_modules. ClientModuleRegistry still discovers it
  // through CommonJS package resolution from the profile anchor.
  const rootManifestPath = join(physicalPackageRoot, 'package.json')
  const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8')) as {
    name?: unknown
    dsh?: { client?: unknown }
  }
  if (rootManifest.name !== DESKTOP_PACKAGE_NAME || rootManifest.dsh?.client === undefined) {
    throw new Error(`dsh-plugin-desktop: packaged client fallback root is not ${DESKTOP_PACKAGE_NAME}`)
  }
  names.add(DESKTOP_PACKAGE_NAME)
  const fallbackRoot = join(home, 'profiles', 'node_modules')
  for (const name of [...names].sort()) {
    const target = name === DESKTOP_PACKAGE_NAME
      ? physicalPackageRoot
      : join(physicalPackageRoot, 'node_modules', ...name.split('/'))
    if (!existsSync(join(target, 'package.json'))) {
      throw new Error(`dsh-plugin-desktop: client fallback target is missing: ${target}`)
    }
    ensureJunction(join(fallbackRoot, ...name.split('/')), target)
  }
  return [...names].sort()
}
