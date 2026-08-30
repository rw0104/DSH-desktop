/** Electron Builder config with generated linked-workspace dev exclusions. */

import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { productionPackageExclusionGlobs } from './production-package-closure.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const exclusion = productionPackageExclusionGlobs(packageRoot)
const platformFilters = process.platform === 'win32'
  ? [
      '!**/node_modules/node-pty/{build,src,third_party}/**',
      '!**/node_modules/**/prebuilds/win32-arm64/**',
      '!**/node_modules/*win32-arm64*/**',
      '!**/node_modules/@*/*win32-arm64*/**',
    ]
  : []

if (process.env.DSH_PACKAGE_DEBUG_CLOSURE === '1') {
  process.stderr.write(
    `electron-builder config: excluding ${exclusion.excluded.length} development-only package names.\n`,
  )
}

export default {
  ...manifest.build,
  files: [
    ...manifest.build.files,
    ...exclusion.globs,
    ...platformFilters,
  ],
}
