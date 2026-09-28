/** Distinguish installed Profile packages from historical runtime projections. */
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

function canonicalEntry(path: string): string {
  return join(realpathSync(dirname(path)), basename(path))
}

/** Locate only an actual selected-Profile package, never its shared parent tree. */
export function localProfilePackageManifest(profileDir: string, specifier: string): string | undefined {
  const parts = specifier.split('/')
  const name = parts[0]?.startsWith('@') === true ? parts.slice(0, 2).join('/') : parts[0]!
  if (!name || name.startsWith('.') || name.includes('\\') || name.includes(':')) return undefined
  const packageDir = join(profileDir, 'node_modules', name)
  const manifestPath = join(packageDir, 'package.json')
  try {
    const info = lstatSync(packageDir)
    if (info.isSymbolicLink()) {
      const target = resolve(dirname(packageDir), readlinkSync(packageDir))
      const projected = join(profileDir, '.dsh-module-fallback', 'node_modules', name)
      if (target === resolve(projected)) return undefined
      if (existsSync(dirname(projected)) && canonicalEntry(target) === canonicalEntry(projected)) return undefined
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dsh?: { moduleFallback?: unknown } }
    if (manifest.dsh?.moduleFallback !== undefined) return undefined
    return manifestPath
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw cause
  }
}
