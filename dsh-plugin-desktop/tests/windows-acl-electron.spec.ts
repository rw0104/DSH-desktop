import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
describe.skipIf(process.platform !== 'win32')('real Electron Node-mode restricted PowerShell', () => {
  it.each(['read-only', 'workspace-write'] as const)('executes under %s without weakening its write boundary', mode => {
    const root = mkdtempSync(join(tmpdir(), 'electron-acl-contract-'))
    const workspace = join(root, 'workspace'), temp = join(root, 'private-temp')
    mkdirSync(workspace); mkdirSync(temp)
    const inside = join(workspace, 'inside.txt'), outside = join(root, 'outside.txt')
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'"
    const command = `$ErrorActionPreference='Stop'; Write-Output 'ACL_PROCESS_READY'; `
      + `try { Set-Content -LiteralPath ${quote(inside)} -Value 'inside' -NoNewline; Write-Output 'INSIDE_ALLOWED' } catch { Write-Output 'INSIDE_DENIED' }; `
      + `try { Set-Content -LiteralPath ${quote(outside)} -Value 'outside' -NoNewline; Write-Output 'OUTSIDE_ALLOWED' } catch { Write-Output 'OUTSIDE_DENIED' }`
    try {
      const result = spawnSync(require('electron'), [
        fileURLToPath(new URL('../lib/windows-acl-runner.js', import.meta.url)), require.resolve('@deepseek-ai/dsh-sandbox-windows-acl/runner'),
        '--workspace', workspace, '--temp', temp, '--mode', mode, '--',
        join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command,
      ], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30_000, windowsHide: true })
      expect(result.error).toBeUndefined()
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
      expect(result.stdout).toContain('ACL_PROCESS_READY')
      expect(result.stdout).toContain(mode === 'workspace-write' ? 'INSIDE_ALLOWED' : 'INSIDE_DENIED')
      expect(result.stdout).toContain('OUTSIDE_DENIED')
      expect(existsSync(outside)).toBe(false)
      if (mode === 'workspace-write') expect(readFileSync(inside, 'utf8')).toBe('inside')
      else expect(existsSync(inside)).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
