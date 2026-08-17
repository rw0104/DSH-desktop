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
  if (desktopManifest.dependencies?.[product.name] !== product.version) {
    fail(`${product.name} dependency must be pinned to ${product.version}`)
  }
  const manifestPath = require.resolve(`${product.name}/package.json`)
  const manifest = readJson(manifestPath)
  if (manifest.version !== product.version) {
    fail(`${product.name} resolved to ${manifest.version}, expected ${product.version}`)
  }
  const patchPath = join(dirname(manifestPath), 'cordis.patch.yml')
  if (!existsSync(patchPath)) fail(`${product.name} is missing cordis.patch.yml`)
}

process.stdout.write(`verify-product-plugins: ${products.length} pinned plugins are installed\n`)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function fail(message) {
  throw new Error(`verify-product-plugins: ${message}`)
}
