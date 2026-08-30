/** Build an unsigned unpacked application for the current host platform. */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPackageFootprint } from './verify-package-footprint.mjs'
import { verifyPackagedProfile } from './verify-packaged-profile.mjs'

const require = createRequire(import.meta.url)
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const builderCli = require.resolve('electron-builder/cli.js')
const builderConfig = fileURLToPath(new URL('./electron-builder.config.mjs', import.meta.url))
// Match release packaging: published node-pty prebuilds are part of the
// dependency closure, so smoke packaging must not invoke a machine-specific
// MSBuild toolchain and silently produce a different native runtime.
const result = spawnSync(process.execPath, [
  builderCli,
  '--dir',
  '--config',
  builderConfig,
  '--config.npmRebuild=false',
], {
  cwd: packageRoot,
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
  stdio: 'inherit',
})

if (result.error !== undefined) throw result.error
if (result.status !== 0) {
  throw new Error(`electron-builder --dir exited with ${String(result.status)}`)
}
if (process.platform === 'win32') {
  const report = await verifyPackageFootprint(join(packageRoot, 'dist', 'win-unpacked'))
  process.stdout.write(
    `package-dir: footprint verified at ${report.physical.fileCount} files and ${report.physical.bytes} bytes.\n`,
  )
  const packagedProfile = verifyPackagedProfile(join(packageRoot, 'dist', 'win-unpacked'))
  process.stdout.write(
    `package-dir: packaged Profile verified with DSH ${packagedProfile.cliVersion} and pnpm ${packagedProfile.pnpmVersion}.\n`,
  )
}
