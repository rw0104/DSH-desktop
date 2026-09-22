import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
it.each(['Node', 'Electron'])('preserves official Profile routing and Worker lifecycle in real %s', runtime => {
  const result = spawnSync(runtime === 'Electron' ? require('electron') as string : process.execPath, [
    fileURLToPath(new URL('./fixtures/profile-resolution-runtime.mjs', import.meta.url)),
  ], { encoding: 'utf8', windowsHide: true, timeout: 30_000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout.trim())).toMatchObject({ runtime: expect.stringContaining(runtime), status: 'passed' })
})
