import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const workspaceRoot = resolve(packageRoot, '..')
const isWindows = process.platform === 'win32'
const yarn = isWindows ? 'yarn.cmd' : 'yarn'
const checks = [
  ['layout', ['check:layout']],
  ['typecheck', ['workspace', 'dsh-plugin-desktop', 'typecheck']],
  ['focused tests', [
    'workspace', 'dsh-plugin-desktop', 'exec', 'vitest', 'run',
    'tests/client-environment.spec.ts',
    'tests/profile.spec.ts',
    'tests/vision-consent.spec.ts',
    '--testTimeout=20000',
  ]],
  ['runtime closure', ['workspace', 'dsh-plugin-desktop', 'verify:closure']],
  ['CLI smoke', ['workspace', 'dsh-plugin-desktop', 'verify:cli']],
  ['Loader smoke', ['workspace', 'dsh-plugin-desktop', 'verify:loader']],
  ['Profile smoke', ['workspace', 'dsh-plugin-desktop', 'verify:profile']],
  ['product plugin closure', ['workspace', 'dsh-plugin-desktop', 'verify:product-plugins']],
  ['Vision runtime', ['workspace', 'dsh-plugin-desktop', 'verify:vision-runtime']],
  ['package footprint', ['workspace', 'dsh-plugin-desktop', 'verify:package-footprint']],
]

for (const [label, args] of checks) {
  process.stdout.write(`\n[release-readiness] ${label}\n`)
  const command = isWindows ? process.env.ComSpec ?? 'cmd.exe' : yarn
  const commandArgs = isWindows
    ? ['/d', '/s', '/c', [yarn, ...args].join(' ')]
    : args
  const result = spawnSync(command, commandArgs, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`[release-readiness] ${label} failed with ${String(result.status)}`)
  }
}

process.stdout.write('\n[release-readiness] all headless gates passed\n')
