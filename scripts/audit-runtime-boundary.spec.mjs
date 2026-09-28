import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, link, rename, readlink, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { auditRuntimeBoundary } from './audit-runtime-boundary.mjs'
import { removeIsolatedTree } from './remove-isolated-tree.mjs'

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), 'runtime-boundary-'))
  const workspaceRoot = join(root, 'checkout'), harnessHome = join(root, 'user-home')
  const modules = join(harnessHome, 'profiles', 'node_modules')
  await mkdir(workspaceRoot)
  await mkdir(modules, { recursive: true })
  try { await callback({ root, workspaceRoot, harnessHome, modules }) }
  finally { removeIsolatedTree(root) }
}

test('detects the real shared-Profile junction pattern without changing its target or data', async () => fixture(async f => {
  const target = join(f.workspaceRoot, 'node_modules', 'kernel')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'marker'), 'unchanged')
  const link = join(f.modules, 'kernel')
  await symlink(target, link, 'junction')
  const before = await readlink(link)
  const report = await auditRuntimeBoundary(f)
  assert.equal(report.issues.length, 1)
  assert.equal(report.issues[0].path, link)
  assert.equal(await readlink(link), before)
  assert.equal(await readFile(join(target, 'marker'), 'utf8'), 'unchanged')
}))

test('resolves link chains and distinguishes a sibling with a matching path prefix', async () => fixture(async f => {
  const sibling = f.workspaceRoot + '-other'
  await mkdir(sibling)
  await symlink(sibling, join(f.modules, 'unrelated'), 'junction')
  const intermediate = join(f.root, 'intermediate')
  await symlink(f.workspaceRoot, intermediate, 'junction')
  await symlink(intermediate, join(f.modules, 'indirect'), 'junction')
  const report = await auditRuntimeBoundary(f)
  assert.equal(report.examinedLinks, 2)
  assert.deepEqual(report.issues.map(issue => issue.path), [join(f.modules, 'indirect')])
}))

test('finds a broken link into disposable checkout staging', async () => fixture(async f => {
  const target = join(f.workspaceRoot, 'removed-staging')
  await mkdir(target)
  await symlink(target, join(f.modules, 'stale'), 'junction')
  removeIsolatedTree(target)
  assert.equal((await auditRuntimeBoundary(f)).issues.length, 1)
}))

test('detects a hard link that shares checkout bytes with the protected Profile', { skip: process.platform !== 'win32' }, async () => fixture(async f => {
  const source = join(f.workspaceRoot, 'shared.js')
  const profileCopy = join(f.modules, 'shared.js')
  await writeFile(source, 'shared bytes')
  await link(source, profileCopy)
  const report = await auditRuntimeBoundary(f)
  assert.equal(report.hardLinks, 1)
  assert.equal(report.workspaceHardLinks, 1)
  assert.ok(report.issues.some(issue => issue.kind === 'workspace-hardlink' && issue.path === profileCopy))
  assert.equal(await readFile(source, 'utf8'), 'shared bytes')
}))

test('does not recurse through external links or link cycles', async () => fixture(async f => {
  await symlink(f.harnessHome, join(f.modules, 'cycle'), 'junction')
  const report = await auditRuntimeBoundary(f)
  assert.equal(report.examinedLinks, 1)
  assert.equal(report.issues.length, 0)
}))

test('an absent Profile tree is a clean read-only result', async () => fixture(async f => {
  assert.deepEqual((await auditRuntimeBoundary({ ...f, harnessHome: join(f.root, 'absent') })).issues, [])
}))

test('audits a checkout-targeting Profile root junction before resolving its contents', async () => fixture(async f => {
  const profiles = join(f.harnessHome, 'profiles')
  await rename(profiles, join(f.harnessHome, 'profiles-real'))
  await symlink(f.workspaceRoot, profiles, 'junction')
  const report = await auditRuntimeBoundary(f)
  assert.ok(report.issues.some(issue => issue.path === profiles && issue.kind === 'checkout-link'))
}))

test('reports a dangling Profile root junction instead of treating it as absent', async () => fixture(async f => {
  const profiles = join(f.harnessHome, 'profiles')
  await rename(profiles, join(f.harnessHome, 'profiles-real'))
  await symlink(join(f.root, 'removed-checkout'), profiles, 'junction')
  const report = await auditRuntimeBoundary(f)
  assert.ok(report.issues.some(issue => issue.path === profiles && issue.kind === 'broken-link'))
}))

test('a normal package-store hard link is observed without claiming checkout coupling', async () => fixture(async f => {
  const store = join(f.root, 'pnpm-store')
  await mkdir(store)
  await writeFile(join(store, 'shared.js'), 'store bytes')
  await link(join(store, 'shared.js'), join(f.modules, 'shared.js'))
  const report = await auditRuntimeBoundary(f)
  assert.equal(report.hardLinks, 1)
  assert.equal(report.workspaceHardLinks, 0)
  if (process.platform === 'win32') {
    assert.equal(report.hardLinkInspection, 'complete')
    assert.equal(report.coupling, 'not-detected')
    assert.deepEqual(report.issues, [])
  } else assert.equal(report.coupling, 'undetermined')
}))

test('unavailable hard-link enumeration cannot be reported as a clean audit', async () => fixture(async f => {
  const source = join(f.workspaceRoot, 'shared.js')
  await writeFile(source, 'shared bytes')
  await link(source, join(f.modules, 'shared.js'))
  const report = await auditRuntimeBoundary(f, {
    inspectHardLinks: async () => ({ status: 'unavailable', reason: 'permission denied' }),
  })
  assert.equal(report.workspaceHardLinks, 0)
  assert.equal(report.inspectedHardLinks, 0)
  assert.equal(report.unavailableHardLinks, 1)
  assert.equal(report.coupling, 'undetermined')
  assert.equal(report.issues[0].kind, 'hardlink-inspection-unavailable')
}))

test('broken links alone are not evidence that this checkout is coupled', async () => fixture(async f => {
  await symlink(join(f.root, 'missing-package'), join(f.modules, 'broken'), 'junction')
  const report = await auditRuntimeBoundary(f)
  assert.equal(report.brokenLinks, 1)
  assert.equal(report.coupling, 'not-detected')
  assert.equal(report.checkoutLinks, 0)
}))

const { inspectWindowsHardLinks } = await import('./audit-runtime-boundary.mjs')

function windowsInspectorFixture(files, output) {
  return {
    platform: 'win32',
    execute: async () => ({ stdout: output }),
    canonicalize: async path => {
      if (!(path in files)) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      return path
    },
    metadata: async path => files[path],
  }
}

test('fsutil volume-relative peers cannot match a same-suffix file on a different volume', async () => {
  const files = {
    'C:\\profile\\shared.js': { dev: 1n, ino: 41n },
    'C:\\repo\\shared.js': { dev: 1n, ino: 41n },
    'D:\\repo\\shared.js': { dev: 2n, ino: 41n },
  }
  const result = await inspectWindowsHardLinks('C:\\profile\\shared.js', 'D:\\repo',
    windowsInspectorFixture(files, '\\profile\\shared.js\n\\repo\\shared.js\n'))
  assert.equal(result.status, 'complete')
  assert.equal(result.workspacePeer, undefined)
  assert.deepEqual(result.peers, ['C:\\profile\\shared.js', 'C:\\repo\\shared.js'])
})

test('a mounted volume alias counts only after volume and inode identity agree', async () => {
  const files = {
    'C:\\profile\\shared.js': { dev: 7n, ino: 41n },
    'C:\\repo\\shared.js': { dev: 7n, ino: 41n },
    'D:\\repo\\shared.js': { dev: 7n, ino: 41n },
  }
  const result = await inspectWindowsHardLinks('C:\\profile\\shared.js', 'D:\\repo',
    windowsInspectorFixture(files, '\\profile\\shared.js\n\\repo\\shared.js\n'))
  assert.equal(result.status, 'complete')
  assert.equal(result.workspacePeer, 'D:\\repo\\shared.js')
})

test('same-volume but different inode does not prove a shared file', async () => {
  const files = {
    'C:\\profile\\shared.js': { dev: 7n, ino: 41n },
    'C:\\repo\\shared.js': { dev: 7n, ino: 42n },
  }
  const result = await inspectWindowsHardLinks('C:\\profile\\shared.js', 'C:\\repo',
    windowsInspectorFixture(files, '\\profile\\shared.js\n\\repo\\shared.js\n'))
  assert.equal(result.status, 'unavailable')
  assert.equal(result.workspacePeer, undefined)
})

test('unsupported platform and fsutil failure are explicit unavailable results', async () => {
  assert.equal((await inspectWindowsHardLinks('/profile/a', '/repo', { platform: 'linux' })).status, 'unavailable')
  const options = windowsInspectorFixture({ 'C:\\profile\\shared.js': { dev: 7n, ino: 41n } }, '')
  options.execute = async () => { throw Object.assign(new Error('permission denied'), { code: 'EPERM' }) }
  const result = await inspectWindowsHardLinks('C:\\profile\\shared.js', 'C:\\repo', options)
  assert.equal(result.status, 'unavailable')
  assert.match(result.reason, /EPERM/)
})
