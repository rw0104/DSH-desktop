/** Verify the product plugin versions and bundle patches used by the desktop shell. */

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const desktopManifest = readJson(join(packageRoot, 'package.json'))
const products = [
  { name: '@anionex/dsh-vision-toolkit', version: '0.1.24' },
  { name: 'dsh-better-sidebar', version: '0.12.3' },
]

for (const product of products) {
  const dependencySpec = desktopManifest.dependencies?.[product.name]
  if (!isPinnedDependency(product, dependencySpec)) {
    fail(`${product.name} dependency must be pinned to ${product.version}`)
  }
  const manifestPath = require.resolve(`${product.name}/package.json`)
  const manifest = readJson(manifestPath)
  if (manifest.version !== product.version) {
    fail(`${product.name} resolved to ${manifest.version}, expected ${product.version}`)
  }
  const patchPath = join(dirname(manifestPath), 'cordis.patch.yml')
  if (!existsSync(patchPath)) fail(`${product.name} is missing cordis.patch.yml`)
  if (product.name === '@anionex/dsh-vision-toolkit' && isPatchedDependency(dependencySpec)) {
    verifyVisionStartupPatch(dirname(manifestPath))
  }
}

process.stdout.write(`verify-product-plugins: ${products.length} pinned plugins are installed\n`)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function fail(message) {
  throw new Error(`verify-product-plugins: ${message}`)
}

function isPinnedDependency(product, value) {
  if (value === product.version) return true
  if (product.name !== '@anionex/dsh-vision-toolkit' || typeof value !== 'string') return false
  return value.startsWith(`patch:${product.name}@npm%3A${product.version}#`)
    && decodeURIComponent(value).includes('../patches/@anionex-dsh-vision-toolkit-npm-0.1.24.patch')
}

function isPatchedDependency(value) {
  return typeof value === 'string' && value.startsWith('patch:@anionex/dsh-vision-toolkit@npm%3A0.1.24#')
}

function verifyVisionStartupPatch(pluginRoot) {
  const entry = readFileSync(join(pluginRoot, 'lib', 'index.js'), 'utf8')
  const web = readFileSync(join(pluginRoot, 'lib', 'web.js'), 'utf8')
  if (!entry.includes('const initialization = manager.initialize(settings.get()).then')) {
    fail('Vision Toolkit patch must initialize its Python runtime asynchronously')
  }
  if (entry.includes('await manager.initialize(settings.get())')) {
    fail('Vision Toolkit patch must not await Python runtime initialization during boot')
  }
  if (!entry.includes('new VisionToolkitWebBackend(ctx, manager, artifacts, ensureOperational, undefined, initialization)')
    || !entry.includes('await initialization')) {
    fail('Vision Toolkit Settings updates must wait for the initial runtime generation')
  }
  if (!web.includes('waitForInitialRuntime') || !web.includes('await this.waitForInitialRuntime')) {
    fail('Vision Toolkit Web Settings save must wait for the initial runtime generation')
  }
}
