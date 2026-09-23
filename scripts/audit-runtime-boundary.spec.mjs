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

test('detects a hard link that shares checkout bytes with the protected Profile', async () => fixture(async f => {
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
