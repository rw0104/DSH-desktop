/** Validate the classic scripts served by ClientModuleRegistry without materializing factories. */
import { readFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import type { PhysicalRuntimeManifest } from './physical-runtime.ts'

/** Parse an entire combo before accepting exactly its advertised registrations. */
export function verifyClientRegistrations(source: string, expected: readonly string[], filename: string): void {
  const registered: string[] = []
  const script = new Script(source, { filename })
  script.runInNewContext({
    window: {
      __ModuleLoader__: {
        load(value: { id?: unknown; factory?: unknown }) {
          if (typeof value?.id !== 'string' || typeof value.factory !== 'function') {
            throw new Error(`invalid client registration in ${filename}`)
          }
          registered.push(value.id)
        },
      },
    },
  }, { timeout: 1000 })
  const actual = [...registered].sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`client registrations in ${filename}: expected ${wanted.join(', ')}, received ${actual.join(', ')}`)
  }
}

/** Check every projected Web client export, including the Desktop app-root client. */
export function verifyPackagedClientBundles(unpackedRoot: string): number {
  const physical = JSON.parse(readFileSync(join(unpackedRoot, 'physical-runtime-manifest.json'), 'utf8')) as PhysicalRuntimeManifest
  if (physical.schemaVersion !== 1) throw new Error('unsupported physical runtime manifest')
  const present = new Set(physical.files.map(file => file.path))
  const clients = physical.files.filter(file => file.consumers.includes('client-bundles')
    && (file.path === 'package.json' || file.path.endsWith('/package.json')))
  if (clients.length === 0) throw new Error('packaged runtime has no client manifests')
  for (const file of clients) {
    const manifest = JSON.parse(readFileSync(join(unpackedRoot, file.path), 'utf8')) as {
      name: string; exports?: Record<string, string | { default?: string }>
    }
    const exported = manifest.exports?.['./client']
    const target = typeof exported === 'string' ? exported : exported?.default
    if (target === undefined || !target.startsWith('./')) {
      throw new Error(`missing ./client export in ${file.path}`)
    }
    const relativePath = posix.join(posix.dirname(file.path), target)
    if (!present.has(relativePath)) throw new Error(`unprojected client export: ${relativePath}`)
    const filename = join(unpackedRoot, relativePath)
    verifyClientRegistrations(readFileSync(filename, 'utf8'), [manifest.name], filename)
  }
  return clients.length
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../dist/win-unpacked/resources/app.asar.unpacked')
  console.log(`verify-client-bundles: ${verifyPackagedClientBundles(root)} packaged clients parsed and registered.`)
}
