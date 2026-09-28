/** Read-only assertions around disposable historical Profile contamination. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'

export const POLLUTED_RUNTIME_PACKAGES = [
  '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-goal', '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-command-feedback', '@deepseek-ai/dsh-typert-loader',
  '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-layout',
  'zod', 'dsh-profile-private-value',
] as const

/** Give the copied Host consumer a genuine private package with both Node entry conditions. */
export function seedPrivateHostDependency(hostServicePluginDir: string): void {
  const privateDir = join(hostServicePluginDir, 'node_modules', 'dsh-profile-private-value')
  mkdirSync(privateDir, { recursive: true })
  writeFileSync(join(privateDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-private-value',
    version: '1.0.0', type: 'module', exports: { import: './index.js', require: './index.cjs' } }))
  writeFileSync(join(privateDir, 'index.js'), 'export const marker = "profile-private-esm"\n')
  writeFileSync(join(privateDir, 'index.cjs'), 'exports.marker = "profile-private-cjs"\n')
}

/** Snapshot every directory, byte and link without following any link target. */
export function snapshotTree(root: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  function visit(path: string): void {
    const stat = lstatSync(path, { bigint: true })
    const row: Record<string, unknown> = {
      path: relative(root, path), dev: String(stat.dev), ino: String(stat.ino),
      mode: String(stat.mode), nlink: String(stat.nlink), size: String(stat.size),
      mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs), birthtime: String(stat.birthtimeNs),
    }
    if (stat.isSymbolicLink()) row.link = readlinkSync(path)
    else if (stat.isFile()) row.sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    rows.push(row)
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name))
    }
  }
  visit(root)
  return rows
}

/** All targets are new files in this test's disposable home, never a real checkout. */
export function seedPollutedSharedProfile(home: string): { assertUnchanged: () => void, shared: string } {
  assert.ok(isAbsolute(home), 'Contamination fixtures require an absolute disposable home')
  const shared = join(home, 'profiles', 'node_modules')
  const targets = join(home, 'contamination-targets')
  assert.equal(existsSync(shared), false, 'Seed before any Profile preparation')
  mkdirSync(shared, { recursive: true })
  mkdirSync(targets)
  for (const [index, name] of POLLUTED_RUNTIME_PACKAGES.entries()) {
    const version = index % 2 === 0 ? '0.1.2-rc.1' : '0.1.6-alpha.2'
    const target = join(targets, version, ...name.split('/'))
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name, version, type: 'module',
      exports: { '.': { import: './index.js', require: './index.cjs' }, './package.json': './package.json', './client': './client.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    }))
    const failure = `throw new Error(${JSON.stringify(`Contaminated shared runtime loaded: ${name}@${version}`)})\n`
    writeFileSync(join(target, 'index.js'), failure)
    writeFileSync(join(target, 'index.cjs'), failure)
    writeFileSync(join(target, 'client.js'), failure)
    writeFileSync(join(target, 'cordis.patch.yml'), '- insert:\n    - id: contaminated-runtime\n      name: contaminated-runtime\n')
    const link = join(shared, ...name.split('/'))
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  }
  // A missing historical checkout must also remain untouched, not repaired or traversed.
  symlinkSync(join(targets, 'removed-checkout'), join(shared, 'dsh-missing-checkout'), process.platform === 'win32' ? 'junction' : 'dir')
  const unknown = join(shared, '@deepseek-ai', 'dsh-client-ui-shared-only-fixture')
  mkdirSync(unknown, { recursive: true })
  writeFileSync(join(unknown, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-client-ui-shared-only-fixture',
    version: '0.1.2-rc.1', type: 'module', main: 'index.js', dsh: { client: { platform: 'web' } } }))
  writeFileSync(join(unknown, 'index.js'), 'throw new Error("Shared-only optional plugin must not load")\n')
  const before = snapshotTree(shared)
  const targetBefore = snapshotTree(targets)
  return { shared, assertUnchanged() {
    assert.deepEqual(snapshotTree(shared), before, 'Shared Profile tree changed: links, bytes or metadata')
    assert.deepEqual(snapshotTree(targets), targetBefore, 'A shared Profile link target was mutated')
  } }
}
