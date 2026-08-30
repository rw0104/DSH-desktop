/** Derive package-name exclusions that correct linked-workspace dev leakage. */

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

function readManifest(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'))
}

function defaultResolvePackageManifest(packageName, parentManifestPath) {
  const require = createRequire(parentManifestPath)
  try {
    return require.resolve(`${packageName}/package.json`)
  } catch (manifestCause) {
    for (const searchPath of require.resolve.paths(packageName) ?? []) {
      const candidate = join(searchPath, ...packageName.split('/'), 'package.json')
      if (existsSync(candidate)) return candidate
    }
    let directory
    try {
      directory = dirname(require.resolve(packageName))
    } catch {
      throw manifestCause
    }
    while (true) {
      const candidate = join(directory, 'package.json')
      if (existsSync(candidate)) {
        const manifest = readManifest(candidate)
        if (manifest.name === packageName) return candidate
      }
      const parent = dirname(directory)
      if (parent === directory) throw manifestCause
      directory = parent
    }
  }
}

/** Return package names reachable only through production and optional edges. */
export function collectProductionPackageNames(
  rootManifestPath,
  resolvePackageManifest = defaultResolvePackageManifest,
  loadManifest = readManifest,
) {
  const root = loadManifest(rootManifestPath)
  const names = new Set([root.name])
  const queue = Object.keys(root.dependencies ?? {}).sort().map(name => ({ name, parent: rootManifestPath }))
  const visitedManifests = new Set()
  while (queue.length > 0) {
    const next = queue.shift()
    let manifestPath
    try {
      manifestPath = resolvePackageManifest(next.name, next.parent)
    } catch (cause) {
      const optional = loadManifest(next.parent).optionalDependencies?.[next.name] !== undefined
      if (optional) continue
      throw cause
    }
    const realManifest = existsSync(manifestPath) ? realpathSync(manifestPath) : manifestPath
    names.add(next.name)
    if (visitedManifests.has(realManifest)) continue
    visitedManifests.add(realManifest)
    const manifest = loadManifest(realManifest)
    for (const name of [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ].sort()) {
      queue.push({ name, parent: realManifest })
    }
  }
  return names
}

function scanPackageDirectory(packageDirectory, names, visited) {
  const realDirectory = realpathSync(packageDirectory)
  if (visited.has(realDirectory)) return
  visited.add(realDirectory)
  const manifestPath = join(realDirectory, 'package.json')
  if (!existsSync(manifestPath)) return
  const manifest = readManifest(manifestPath)
  if (typeof manifest.name === 'string') names.add(manifest.name)
  scanNodeModules(join(realDirectory, 'node_modules'), names, visited)
}

function scanNodeModules(nodeModules, names, visited) {
  if (!existsSync(nodeModules) || !lstatSync(nodeModules).isDirectory()) return
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name === '.bin') continue
    const path = join(nodeModules, entry.name)
    if (entry.name.startsWith('@')) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      for (const scoped of readdirSync(path, { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          scanPackageDirectory(join(path, scoped.name), names, visited)
        }
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      scanPackageDirectory(path, names, visited)
    }
  }
}

/** Return package names physically installed below all reachable node_modules trees. */
export function collectInstalledPackageNames(packageRoot) {
  const names = new Set()
  scanNodeModules(join(resolve(packageRoot), 'node_modules'), names, new Set())
  return names
}

/** Build exact nested node_modules globs for packages that are development-only. */
export function productionPackageExclusionGlobs(packageRoot) {
  const root = resolve(packageRoot)
  const production = collectProductionPackageNames(join(root, 'package.json'))
  const installed = collectInstalledPackageNames(root)
  const excluded = [...installed].filter(name => !production.has(name)).sort()
  return {
    production,
    installed,
    excluded,
    globs: excluded.map(name => `!**/node_modules/${name}/**`),
  }
}
