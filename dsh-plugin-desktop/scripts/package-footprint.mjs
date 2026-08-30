/** Inspect an Electron package without expanding app.asar. */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listPackage, statFile } from '@electron/asar'

export const WINDOWS_PACKAGE_FOOTPRINT_BUDGET = Object.freeze({
  physicalFiles: 18_000,
  physicalBytes: 650 * 1024 * 1024,
  sourceMaps: 0,
  declarations: 0,
  testFiles: 0,
  exampleFiles: 0,
  documentationFiles: 0,
})

const TEST_SEGMENTS = new Set(['test', 'tests', '__tests__', 'fixture', 'fixtures', 'benchmark', 'benchmarks'])
const EXAMPLE_SEGMENTS = new Set(['example', 'examples'])
const DOCUMENT_SEGMENTS = new Set(['docs', 'documentation'])
const DOCUMENT_BASENAMES = /^(?:readme|changelog|changes|history)(?:\.(?:md|markdown|txt|rst|adoc))?$/iu
const LICENSE_BASENAMES = /^(?:licen[cs]e|notice|copying|copyright)(?:\.|$)/iu
const DECLARATION_SUFFIXES = ['.d.ts', '.d.mts', '.d.cts']

function normalizePath(filename) {
  return filename.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '')
}

function nativeArchivePath(filename) {
  return normalizePath(filename).split('/').join(sep)
}

/** Classify one logical production path into mutually useful audit categories. */
export function classifyProductionPath(filename) {
  const normalized = normalizePath(filename)
  const lower = normalized.toLowerCase()
  const segments = lower.split('/')
  const name = basename(lower)
  const license = LICENSE_BASENAMES.test(name)
  return {
    sourceMap: lower.endsWith('.map'),
    declaration: DECLARATION_SUFFIXES.some(suffix => lower.endsWith(suffix)),
    test: segments.some(segment => TEST_SEGMENTS.has(segment)),
    example: segments.some(segment => EXAMPLE_SEGMENTS.has(segment)),
    documentation: !license && (
      segments.some(segment => DOCUMENT_SEGMENTS.has(segment))
      || DOCUMENT_BASENAMES.test(name)
    ),
    license,
  }
}

/** Resolve the closest npm package owner for one nested node_modules path. */
export function packageOwner(filename) {
  const segments = normalizePath(filename).split('/')
  let owner
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] !== 'node_modules') continue
    const first = segments[index + 1]
    if (first === undefined) continue
    owner = first.startsWith('@') && segments[index + 2] !== undefined
      ? `${first}/${segments[index + 2]}`
      : first
  }
  return owner ?? '(application)'
}

function emptyCategories() {
  return {
    sourceMaps: 0,
    declarations: 0,
    testFiles: 0,
    exampleFiles: 0,
    documentationFiles: 0,
    licenseFiles: 0,
  }
}

function addCategories(categories, filename) {
  const value = classifyProductionPath(filename)
  if (value.sourceMap) categories.sourceMaps += 1
  if (value.declaration) categories.declarations += 1
  if (value.test) categories.testFiles += 1
  if (value.example) categories.exampleFiles += 1
  if (value.documentation) categories.documentationFiles += 1
  if (value.license) categories.licenseFiles += 1
}

function topPackages(rows, limit = 30) {
  const packages = new Map()
  for (const row of rows) {
    const owner = packageOwner(row.path)
    const current = packages.get(owner) ?? { package: owner, files: 0, bytes: 0 }
    current.files += 1
    current.bytes += row.bytes
    packages.set(owner, current)
  }
  return [...packages.values()]
    .sort((left, right) => right.files - left.files || right.bytes - left.bytes || left.package.localeCompare(right.package))
    .slice(0, limit)
}

async function physicalRows(root) {
  const rows = []
  const pending = [resolve(root)]
  while (pending.length > 0) {
    const directory = pending.pop()
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const filename = join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(filename)
      } else if (entry.isFile()) {
        const value = await stat(filename)
        rows.push({
          path: normalizePath(relative(root, filename)),
          bytes: value.size,
        })
      }
    }
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path))
}

function archiveRows(archivePath) {
  const rows = []
  for (const rawEntry of listPackage(archivePath)) {
    const path = normalizePath(rawEntry)
    if (path.length === 0) continue
    const value = statFile(archivePath, nativeArchivePath(path))
    if (typeof value.size !== 'number') continue
    rows.push({ path, bytes: value.size, unpacked: value.unpacked === true })
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path))
}

function summarize(rows) {
  const categories = emptyCategories()
  let bytes = 0
  for (const row of rows) {
    bytes += row.bytes
    addCategories(categories, row.path)
  }
  return {
    fileCount: rows.length,
    bytes,
    categories,
    topPackages: topPackages(rows),
  }
}

function allowlistPaths(allowlist) {
  const result = new Map()
  for (const [category, entries] of Object.entries(allowlist)) {
    if (category === 'schemaVersion') continue
    if (!Array.isArray(entries)) throw new Error(`package footprint allowlist ${category} must be an array`)
    for (const entry of entries) {
      if (entry === null || typeof entry !== 'object') {
        throw new Error(`package footprint allowlist ${category} entries must be objects`)
      }
      const { path, consumer, reason } = entry
      if (typeof path !== 'string' || path.length === 0
        || typeof consumer !== 'string' || consumer.length === 0
        || typeof reason !== 'string' || reason.length === 0) {
        throw new Error(`package footprint allowlist ${category} entries require path, consumer, and reason`)
      }
      result.set(`${category}:${normalizePath(path)}`, entry)
    }
  }
  return result
}

/** Return disallowed logical development artifacts across ASAR and physical files. */
export function productionArtifactViolations(archive, physical, unpackedRoot, allowlist) {
  const allowed = allowlistPaths(allowlist)
  const rows = new Map()
  for (const row of archive) rows.set(row.path, row)
  const unpackedPrefix = normalizePath(relative(resolve(unpackedRoot, '..', '..'), unpackedRoot))
  for (const row of physical) {
    const path = normalizePath(row.path)
    const logical = path.startsWith(`${unpackedPrefix}/`)
      ? path.slice(unpackedPrefix.length + 1)
      : path
    if (!rows.has(logical)) rows.set(logical, { ...row, path: logical })
  }
  const violations = {
    sourceMaps: [],
    declarations: [],
    testPaths: [],
    examplePaths: [],
    documentationPaths: [],
  }
  for (const row of rows.values()) {
    const categories = classifyProductionPath(row.path)
    for (const [category, matches] of [
      ['sourceMaps', categories.sourceMap],
      ['declarations', categories.declaration],
      ['testPaths', categories.test],
      ['examplePaths', categories.example],
      ['documentationPaths', categories.documentation],
    ]) {
      if (matches && !allowed.has(`${category}:${row.path}`)) violations[category].push(row.path)
    }
  }
  for (const values of Object.values(violations)) values.sort()
  return violations
}

/** Analyze one completed unpacked Electron application directory. */
export async function analyzePackageFootprint(appOutDir, options = {}) {
  const root = resolve(appOutDir)
  const archivePath = resolve(options.archivePath ?? join(root, 'resources', 'app.asar'))
  const unpackedRoot = resolve(options.unpackedRoot ?? `${archivePath}.unpacked`)
  const allowlistPath = resolve(options.allowlistPath ?? fileURLToPath(new URL('../build/production-artifact-allowlist.json', import.meta.url)))
  if (!existsSync(root)) throw new Error(`package footprint root does not exist: ${root}`)
  if (!existsSync(archivePath)) throw new Error(`package footprint ASAR does not exist: ${archivePath}`)
  const [physical, allowlist] = await Promise.all([
    physicalRows(root),
    readFile(allowlistPath, 'utf8').then(text => JSON.parse(text)),
  ])
  if (allowlist.schemaVersion !== 1) throw new Error('package footprint allowlist schemaVersion must be 1')
  const archive = archiveRows(archivePath)
  const unpackedPrefix = normalizePath(relative(root, unpackedRoot))
  const unpacked = physical
    .filter(row => row.path === unpackedPrefix || row.path.startsWith(`${unpackedPrefix}/`))
    .map(row => ({
      ...row,
      path: row.path === unpackedPrefix ? '' : row.path.slice(unpackedPrefix.length + 1),
    }))
    .filter(row => row.path.length > 0)
  const violations = productionArtifactViolations(archive, physical, unpackedRoot, allowlist)
  const digest = createHash('sha256')
  for (const row of physical) digest.update(`${row.path}\0${String(row.bytes)}\n`)
  return {
    schemaVersion: 1,
    root,
    archivePath,
    unpackedRoot,
    treeDigest: digest.digest('hex'),
    budgets: WINDOWS_PACKAGE_FOOTPRINT_BUDGET,
    physical: summarize(physical),
    archive: {
      ...summarize(archive),
      unpackedEntries: archive.filter(row => row.unpacked).length,
    },
    unpacked: summarize(unpacked),
    violations,
  }
}

/** Convert one footprint result into fail-loud budget messages. */
export function packageFootprintFailures(report, budget = WINDOWS_PACKAGE_FOOTPRINT_BUDGET) {
  const failures = []
  if (report.physical.fileCount > budget.physicalFiles) {
    failures.push(`physical files ${report.physical.fileCount} exceed ${budget.physicalFiles}`)
  }
  if (report.physical.bytes > budget.physicalBytes) {
    failures.push(`physical bytes ${report.physical.bytes} exceed ${budget.physicalBytes}`)
  }
  for (const [key, budgetKey] of [
    ['sourceMaps', 'sourceMaps'],
    ['declarations', 'declarations'],
    ['testPaths', 'testFiles'],
    ['examplePaths', 'exampleFiles'],
    ['documentationPaths', 'documentationFiles'],
  ]) {
    const count = report.violations[key].length
    if (count > budget[budgetKey]) {
      failures.push(`${key} ${count} exceed ${budget[budgetKey]}: ${report.violations[key].slice(0, 8).join(', ')}`)
    }
  }
  return failures
}
