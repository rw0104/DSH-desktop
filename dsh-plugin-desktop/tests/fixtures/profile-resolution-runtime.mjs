import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker, getEnvironmentData } from 'node:worker_threads'
import { Context } from '@deepseek-ai/cordis'
import { boot, PluginPackages } from '@deepseek-ai/dsh-app-boot'
import { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import { installProfilePackageResolver } from '../../lib/module-resolution.js'

const root = mkdtempSync(join(tmpdir(), 'profile-resolution-runtime-'))
const profilesDir = join(root, 'profiles')
const profileDir = join(profilesDir, 'active')
const anchor = join(root, 'installation/package.json')
const profileAnchor = join(profileDir, 'package.json')
const key = '@deepseek-ai/dsh-app-boot/profile-resolution'
const file = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
const json = (path, data) => file(path, JSON.stringify(data))
const url = path => pathToFileURL(path).href
const entry = (name, scope = 'installation') => ({
  name, scope, version: '1.0.0', declarer: anchor,
  packageDir: join(root, 'installation/node_modules', name),
})
function pkg(dir, name, marker, extra = {}) {
  json(join(dir, 'package.json'), { name, version: '1.0.0', type: 'module',
    exports: { import: './index.js', require: './index.cjs' }, ...extra })
  file(join(dir, 'index.js'), `export const marker = ${JSON.stringify(marker + '-esm')}`)
  file(join(dir, 'index.cjs'), `exports.marker = ${JSON.stringify(marker + '-cjs')}`)
}
json(anchor, { name: 'installation', private: true })
json(profileAnchor, { private: true, imports: { '#shared': 'fixture-shared', '#local': './relative.cjs' } })
file(join(profileDir, 'relative.cjs'), 'exports.marker = "relative"')
for (const name of ['fixture-shared', 'fixture-local', 'fixture-broken', 'fixture-profile']) {
  pkg(entry(name).packageDir, name, 'installation')
}
pkg(join(profileDir, 'node_modules/fixture-local'), 'fixture-local', 'local')
pkg(join(profileDir, 'node_modules/fixture-broken'), 'fixture-broken', 'broken', { exports: './absent.js' })
// Stale shared projections must not override the in-memory generation.
pkg(join(profilesDir, 'node_modules/fixture-shared'), 'fixture-shared', 'stale')
const importerPath = join(profileDir, 'entry.mjs')
file(importerPath, 'export const load = name => import(name); export const resolve = name => import.meta.resolve(name)')
const importer = await import(url(importerPath))
const local = createRequire(profileAnchor)
const originalFilename = createRequire(import.meta.url)('node:module')._resolveFilename
const previousWorker = getEnvironmentData(key)
// Existing Desktop hooks must still be chained, including after disposal.
let hookCalls = 0
const sentinel = registerHooks({ resolve(s, c, next) { hookCalls++; return next(s, c) } })
const generation = { profilesDir, profileDir, localPackageNames: [],
  entries: ['fixture-shared', 'fixture-local', 'fixture-broken'].map(name => entry(name)).concat(entry('fixture-profile', 'profile')) }
const ctx = new Context()
await ctx.plugin(PluginPackages, { generation })
assert.ok(ctx.pluginPackages)
try {
  assert.equal((await importer.load('fixture-shared')).marker, 'installation-esm')
  assert.equal(local('fixture-shared').marker, 'installation-cjs')
  assert.equal((await importer.load('#shared')).marker, 'installation-esm')
  assert.equal(local('#shared').marker, 'installation-cjs')
  assert.equal(local('#local').marker, 'relative')
  assert.equal((await importer.load('fixture-local')).marker, 'local-esm')
  assert.equal(local('fixture-local').marker, 'local-cjs')
  assert.equal(importer.resolve('fixture-shared'), importer.resolve('fixture-shared'))
  assert.equal(ctx.pluginPackages.packageOf('fixture-shared/private', url(importerPath)).dir, entry('fixture-shared').packageDir)
  // Desktop lacks the private loader: client discovery must use Profile metadata,
  // including third-party plugins that intentionally do not export package.json.
  const registry = { ctx: { loader: {}, get: name => ctx.get(name) } }
  assert.deepEqual(ClientModuleRegistry.prototype.locatePkgJson.call(registry, 'fixture-local', url(importerPath)), {
    path: join(profileDir, 'node_modules/fixture-local/package.json'), packageName: 'fixture-local',
  })
  assert.equal(ClientModuleRegistry.prototype.locatePkgJson.call(registry, 'fixture-missing', url(importerPath)), undefined)
  assert.throws(() => local.resolve('fixture-shared/private'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  await assert.rejects(importer.load('fixture-broken'), { code: 'ERR_MODULE_NOT_FOUND' })
  assert.throws(() => local.resolve('fixture-broken'), { code: 'MODULE_NOT_FOUND' })
  assert.equal(local.resolve('node:fs'), 'node:fs')
  assert.throws(() => createRequire(join(root, 'unrelated/package.json')).resolve('fixture-shared'), { code: 'MODULE_NOT_FOUND' })
  const other = createRequire(join(profilesDir, 'other/package.json'))
  assert.equal(other('fixture-shared').marker, 'installation-cjs')
  assert.throws(() => other.resolve('fixture-profile'), { code: 'MODULE_NOT_FOUND' })
  pkg(join(root, 'explicit/node_modules/fixture-shared'), 'fixture-shared', 'explicit')
  assert.equal(local(local.resolve('fixture-shared', { paths: [join(root, 'explicit'), profileDir] })).marker, 'explicit-cjs')
  assert.throws(() => local.resolve('fixture-added'), { code: 'MODULE_NOT_FOUND' })
  pkg(entry('fixture-added').packageDir, 'fixture-added', 'added')
  const nextGeneration = { ...generation, entries: [...generation.entries, entry('fixture-added')] }
  ctx.pluginPackages.replace(nextGeneration)
  assert.equal(local('fixture-added').marker, 'added-cjs')
  assert.equal((await importer.load('fixture-added')).marker, 'added-esm')
  assert.throws(() => ctx.pluginPackages.replace(generation), /requires a process restart/)
  // The bundled Worker bootstrap must use the same Electron backend.
  const workerPath = join(profileDir, 'worker.mjs')
  file(workerPath, `import ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-app-boot/worker/profile-resolution-bootstrap'))};
    import { parentPort } from 'node:worker_threads';
    import { createRequire } from 'node:module';
    const esm = await import('fixture-added');
    parentPort.postMessage([esm.marker, createRequire(import.meta.url)('fixture-shared').marker]);`)
  const worker = new Worker(pathToFileURL(workerPath))
  const result = await new Promise((resolve, reject) => {
    let message
    worker.once('message', value => { message = value })
    worker.once('error', reject)
    worker.once('exit', code => code === 0 ? resolve(message) : reject(new Error(`Worker exit ${code}`)))
  })
  assert.deepEqual(result, ['added-esm', 'installation-cjs'])
} finally {
  await ctx.fiber.dispose()
}
assert.equal(createRequire(import.meta.url)('node:module')._resolveFilename, originalFilename)
assert.deepEqual(getEnvironmentData(key), previousWorker)
assert.throws(() => local.resolve('fixture-added'), { code: 'MODULE_NOT_FOUND' })
assert.throws(() => importer.resolve('fixture-added'), { code: 'ERR_MODULE_NOT_FOUND' })
// Verify mode must reject a stale disk projection, rather than silently enforcing.
const verify = new Context()
await verify.plugin(PluginPackages, { generation, behavior: 'verify' })
try {
  assert.throws(() => local.resolve('fixture-shared'), /profile resolution mismatch/)
  assert.throws(() => importer.resolve('fixture-shared'), /profile resolution mismatch/)
  assert.throws(() => verify.pluginPackages.packageOf('fixture-shared', url(importerPath)), /profile resolution mismatch/)
} finally {
  await verify.fiber.dispose()
  sentinel.deregister()
}
assert.ok(hookCalls > 0)

// Exercise the actual no-internals Loader path used by packaged Electron. A
// locally installed package with the same name must not split a mounted Host
// from the client package whose manifest the registry subsequently discovers.
const collisionName = 'fixture-desktop-client-collision'
// Node caches package scopes. This installation must have its final self-export
// manifest before any resolution, independently from the earlier resolver cases.
const collisionAnchor = join(root, 'collision-installation/package.json')
const collisionEntry = name => ({
  name, scope: 'installation', version: '1.0.0', declarer: collisionAnchor,
  packageDir: join(dirname(collisionAnchor), 'node_modules', name),
})
json(collisionAnchor, { name: 'installation', private: true, type: 'module', exports: {
  '.': './index.js', './client': './client.js',
}, dsh: { client: { platform: 'web' } } })
for (const [dir, marker] of [
  [collisionEntry(collisionName).packageDir, 'installation'],
  [join(profileDir, 'node_modules', collisionName), 'profile-local'],
]) {
  pkg(dir, collisionName, marker, { dsh: { client: { platform: 'web' } }, exports: {
    '.': './index.js', './client': './client.js',
  } })
  file(join(dir, 'index.js'), `export const marker = ${JSON.stringify(marker)}; export function apply(ctx) { ctx.provide('fixtureCollisionOwner', marker) }`)
  file(join(dir, 'client.js'), `export const marker = ${JSON.stringify(marker)}`)
}
const localClientName = 'fixture-desktop-local-client'
const localClientDir = join(profileDir, 'node_modules', localClientName)
pkg(localClientDir, localClientName, 'profile-only', { dsh: { client: { platform: 'web' } }, exports: {
  '.': './index.js', './client': './client.js',
} })
file(join(localClientDir, 'index.js'), `import { marker } from '${collisionName}'; export function apply(ctx) { ctx.provide('fixturePrivateOwner', marker) }`)
file(join(localClientDir, 'client.js'), 'export const marker = "profile-only"')
pkg(join(localClientDir, 'node_modules', collisionName), collisionName, 'private')
file(join(dirname(collisionAnchor), 'index.js'), 'export function apply(ctx) { ctx.provide("fixtureApplicationOwner", "installation-root") }')
file(join(dirname(collisionAnchor), 'client.js'), 'export const marker = "installation-root"')
pkg(join(profileDir, 'node_modules/installation'), 'installation', 'profile-root-collision')
const collisionGeneration = { profilesDir, profileDir, localPackageNames: [collisionName, localClientName, 'installation'],
  entries: [collisionEntry(collisionName), { ...collisionEntry('installation'), packageDir: dirname(collisionAnchor) }] }
const rootConfig = join(profileDir, 'cordis.yml')
file(rootConfig, '[]\n')
const releaseDesktopResolver = installProfilePackageResolver(url(profileAnchor), url(collisionAnchor))
let collisionContext
try {
  collisionContext = await boot('desktop-client-collision', rootConfig, [{ insert: [
    { id: 'collision', name: collisionName }, { id: 'profile-only', name: localClientName }, { id: 'app-root', name: 'installation' },
  ] }], async host => {
    host.loader.internal = undefined
    host.provide('profileContext', { installAnchor: collisionAnchor, dir: profileDir })
    await host.plugin(PluginPackages, { generation: collisionGeneration })
  }, url(profileAnchor))
  assert.equal(collisionContext.get('fixtureCollisionOwner'), 'installation', 'The real Desktop Loader must select the shipped Host')
  assert.equal(collisionContext.get('fixturePrivateOwner'), 'private-esm', 'Profile plugins retain their private dependency versions')
  assert.equal(collisionContext.get('fixtureApplicationOwner'), 'installation-root', 'The application self-export remains installation-owned')
  const registry = { ctx: collisionContext }
  assert.deepEqual(ClientModuleRegistry.prototype.locatePkgJson.call(registry, collisionName, url(profileAnchor)), {
    path: join(collisionEntry(collisionName).packageDir, 'package.json'), packageName: collisionName,
  }, 'Client metadata must belong to the same package as the Host actually loaded')
  assert.deepEqual(ClientModuleRegistry.prototype.locatePkgJson.call(registry, localClientName, url(profileAnchor)), {
    path: join(localClientDir, 'package.json'), packageName: localClientName,
  }, 'A Profile-only Host retains its own client manifest')
  assert.deepEqual(ClientModuleRegistry.prototype.locatePkgJson.call(registry, 'installation', url(profileAnchor)), {
    path: collisionAnchor, packageName: 'installation',
  }, 'Application self-export metadata cannot be replaced by a Profile package of the same name')
} finally {
  await collisionContext?.fiber.dispose()
  releaseDesktopResolver()
}
console.log(JSON.stringify({ runtime: process.versions.electron ? `Electron ${process.versions.electron}` : `Node ${process.versions.node}`, status: 'passed' }))
