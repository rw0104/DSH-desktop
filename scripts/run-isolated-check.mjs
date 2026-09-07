/** Keep headless checks out of the user's Harness home and shared temp root. */
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { removeIsolatedTree } from './remove-isolated-tree.mjs'

export function runIsolatedCheck(args, { cwd = process.cwd(), env = process.env } = {}) {
  if (!args.length) throw new Error('Expected vitest, node:test, or a Node script, followed by its arguments')
  const vitestManifest = args[0] === 'vitest'
    ? createRequire(join(cwd, 'package.json')).resolve('vitest/package.json')
    : undefined
  const entry = args[0] === 'node:test' ? '--test' : vitestManifest
    ? resolve(dirname(vitestManifest), JSON.parse(readFileSync(vitestManifest, 'utf8')).bin.vitest)
    : resolve(cwd, args[0])
  const tempParent = realpathSync(tmpdir())
  const stateRoot = mkdtempSync(join(tempParent, 'dsh-check-'))
  const temporary = join(stateRoot, 'tmp')
  const harnessHome = join(stateRoot, 'harness-home')
  mkdirSync(temporary)
  mkdirSync(harnessHome)
  try {
    const result = spawnSync(process.execPath, [entry, ...args.slice(1)], {
      cwd,
      env: { ...env, TMPDIR: temporary, TMP: temporary, TEMP: temporary, DSH_HOME: harnessHome },
      stdio: 'inherit',
      windowsHide: true,
    })
    if (result.error) throw result.error
    return result.status ?? 1
  } finally {
    // Only remove the new directory owned by this invocation. Keep traversal
    // explicit: Electron's patched recursive rm differs from the Node runtime.
    const child = relative(tempParent, stateRoot)
    if (isAbsolute(child) || child.startsWith(`..${sep}`) || dirname(stateRoot) !== tempParent
      || !basename(stateRoot).startsWith('dsh-check-') || lstatSync(stateRoot).isSymbolicLink()
      || realpathSync(stateRoot) !== stateRoot) {
      throw new Error(`Refusing to clean a replaced or escaped check directory: ${stateRoot}`)
    }
    removeIsolatedTree(stateRoot)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runIsolatedCheck(process.argv.slice(2))
}
