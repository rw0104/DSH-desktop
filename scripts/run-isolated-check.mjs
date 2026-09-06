/** Keep headless checks out of the user's Harness home and shared temp root. */
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export function runIsolatedCheck(args, { cwd = process.cwd(), env = process.env } = {}) {
  if (!args.length) throw new Error('Expected vitest or a Node script, followed by its arguments')
  const vitestManifest = args[0] === 'vitest'
    ? createRequire(join(cwd, 'package.json')).resolve('vitest/package.json')
    : undefined
  const entry = vitestManifest
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
    })
    if (result.error) throw result.error
    return result.status ?? 1
  } finally {
    // Only remove the new directory owned by this invocation. Node removes
    // directory links themselves, so fixtures may safely link to kept files.
    const child = relative(tempParent, stateRoot)
    if (isAbsolute(child) || child.startsWith(`..${sep}`) || dirname(stateRoot) !== tempParent
      || !basename(stateRoot).startsWith('dsh-check-') || lstatSync(stateRoot).isSymbolicLink()
      || realpathSync(stateRoot) !== stateRoot) {
      throw new Error(`Refusing to clean a replaced or escaped check directory: ${stateRoot}`)
    }
    rmSync(stateRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runIsolatedCheck(process.argv.slice(2))
}
