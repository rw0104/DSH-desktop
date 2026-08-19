/** Build an unsigned unpacked application for the current host platform. */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const builderCli = require.resolve('electron-builder/cli.js')
const electronDist = join(dirname(require.resolve('electron/package.json')), 'dist')
const electronDistArgs = existsSync(electronDist)
  ? [`--config.electronDist=${electronDist}`]
  : []
const result = spawnSync(process.execPath, [
  builderCli,
  '--dir',
  '--publish',
  'never',
  '--config.npmRebuild=false',
  ...electronDistArgs,
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
