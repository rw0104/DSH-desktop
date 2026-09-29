// Real-Electron regression driver for the Windows subprocess runner fix
// (spec windows-subprocess-runner-fix, tasks 8.1 / 7 / 8.2 / 8.3 / 8.4).
//
// The property tests in `windows-subprocess-runner-electron.spec.ts` and
// `ptc-node-executable.spec.ts` prove the injection logic in-process under plain Node
// (Electron simulated by stubbing `process.versions.electron`). This spec closes the
// loop with the *actual Host runtime form*: it launches the Electron binary as a real
// main (browser) process running `fixtures/windows-subprocess-runner-electron.mjs`
// (NOT the desktop `main.ts`), which
//   - Phase 0: proves it runs as real Electron (`process.type === 'browser'`,
//     `process.versions.electron` defined, execPath is the Electron binary) — req 9.1;
//   - Phase 1 (task 8.2): reproduces the alpha.2 field failure by launching the runner
//     WITHOUT `ELECTRON_RUN_AS_NODE` (the runner boots as a desktop app and exits 0
//     without the IPC handshake), so the parent's `settleRange()` predicate throws
//     "Windows Job runner exited with exit code 0 before proving its managed range
//     empty" — req 9.2;
//   - task 7 (A1/A2): shows glob/grep are the *same origin* as pwsh — ripgrep is the
//     packaged binary (A2) and its unpatched launch fails identically to pwsh (A1);
//   - Phase 2 (task 8.3, A3/A4/A6): drives the PATCHED `LocalSubprocessRuntime` and the
//     search tools through the real Windows Job runner (containment === 'windows-job',
//     proving koffi/@deepseek-ai/dsh-win32-process load under Electron — A4; the runner
//     entry resolves and exists — A3) to confirm pwsh echo/non-zero exit, a
//     Target_Command env free of `ELECTRON_RUN_AS_NODE`, glob returning the known file,
//     grep returning file+line and an empty non-match, the ptc Electron-as-Node
//     mechanism (A6), and that the Host `process.env` is never mutated.
//
// The Electron GUI-subsystem process on Windows does not attach stdout to the parent,
// so the fixture writes its findings to `--result-file`; this spec reads and asserts
// them. Isolation: a disposable root under the isolated TEMP (established by
// `scripts/run-isolated-check.mjs`), a unique `--user-data-dir`, an isolated
// `--work-dir` seeded with the glob/grep targets, and cleanup in `afterAll`. Electron's
// binary is reused from the machine-level cache (resolved via `require('electron')`,
// prepared by the win32 globalSetup) — nothing is downloaded here.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const fixturePath = fileURLToPath(new URL('./fixtures/windows-subprocess-runner-electron.mjs', import.meta.url))
const reproFixturePath = fileURLToPath(new URL('./fixtures/windows-subprocess-runner-repro-runner.mjs', import.meta.url))

// The known file that must match `--glob-pattern` and the token the grep must locate.
const GLOB_PATTERN = '*.needle'
const KNOWN_FILE = 'known-file.needle'
const GREP_FILE = 'haystack.txt'
const GREP_TOKEN = 'NEEDLE_TOKEN'

// Every check the fixture records; each becomes its own assertion so a single failure
// is attributed to the exact behavior it guards.
const CHECKS = [
  'host_is_real_electron', // req 9.1: Host is a real Electron browser process.
  'repro_pwsh_field_error', // req 9.2 / task 8.2: unpatched pwsh launch reproduces the field error.
  'repro_pwsh_runner_booted_as_desktop_app', // the runner booted as a desktop app (process.type === 'browser').
  'a2_ripgrep_binary_present', // A2: glob/grep run the packaged ripgrep binary.
  'a1_glob_grep_same_origin', // A1: ripgrep's unpatched launch fails identically to pwsh.
  'a3_runner_entry_present', // A3: the runner entry resolves and physically exists.
  'a4_windows_job_containment', // A4: the Windows Job runner (not the fallback) executes the commands.
  'fixed_pwsh_echo_hello', // req 3.3: pwsh echo -> exit 0 + stdout.
  'fixed_nonzero_exit_passthrough', // req 3.4: non-zero exit passthrough.
  'fixed_target_env_no_run_as_node', // req 4.3: Target_Command env carries no ELECTRON_RUN_AS_NODE.
  'fixed_glob_returns_file', // req 6.3: glob returns the known file.
  'fixed_grep_returns_file_and_line', // req 6.4: grep returns file + matched line.
  'fixed_grep_no_match_empty', // req 6.5: a non-match returns an empty result, not a failure.
  'ptc_electron_interpreter_runs_as_node', // A6 / req 7: the Electron interpreter runs as Node with the injected env.
  'host_env_unchanged', // req 4.1: the Host process.env is never mutated.
] as const

interface FixtureResult {
  ok?: boolean
  host?: Record<string, unknown>
  checks: Record<string, boolean>
  evidence: Record<string, unknown>
  errors: string[]
  fatal?: string
}

describe.skipIf(process.platform !== 'win32')('windows-subprocess-runner-fix: real-Electron regression', () => {
  let root: string
  let result: FixtureResult | undefined
  let launch: ReturnType<typeof spawnSync>

  beforeAll(() => {
    // Disposable root inside the isolated TEMP (run-isolated-check.mjs owns TEMP/TMP/
    // TMPDIR/DSH_HOME for this run and removes its own dsh-check-* tree afterward).
    root = mkdtempSync(join(tmpdir(), 'wsr-regression-'))
    const workDir = join(root, 'work')
    mkdirSync(workDir)
    // Preseed the isolated work dir: a known file matching the glob, and a haystack
    // whose line carries the grep token.
    writeFileSync(join(workDir, KNOWN_FILE), 'the needle we expect glob to discover\n')
    writeFileSync(join(workDir, GREP_FILE), `first line\nline carrying ${GREP_TOKEN} here\nlast line\n`)

    const resultFile = join(root, 'result.json')
    const electron = require('electron') as string
    launch = spawnSync(electron, [
      fixturePath,
      `--user-data-dir=${join(root, 'user-data')}`,
      `--result-file=${resultFile}`,
      `--work-dir=${workDir}`,
      `--repro-runner-fixture=${reproFixturePath}`,
      `--repro-marker-file=${join(root, 'repro-marker.json')}`,
      `--repro-user-data-dir=${join(root, 'repro-user-data')}`,
      `--glob-pattern=${GLOB_PATTERN}`,
      `--known-file=${KNOWN_FILE}`,
      `--grep-file=${GREP_FILE}`,
      `--grep-token=${GREP_TOKEN}`,
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
      // Inherit the isolated DSH_HOME/TEMP/TMP/TMPDIR so the Electron child stays in the
      // same disposable run; the fixture never consumes Profile/session/install state.
      env: { ...process.env },
    })

    if (existsSync(resultFile)) result = JSON.parse(readFileSync(resultFile, 'utf8')) as FixtureResult
  }, 120_000)

  afterAll(() => {
    // Remove only this spec's own disposable root; never traverse into anything else.
    if (root !== undefined && existsSync(root)) rmSync(root, { recursive: true, force: true })
  })

  it('launches the Electron Host fixture and produces a complete result file', () => {
    expect(launch.error, `Electron launch error: ${launch.error?.message ?? 'none'}`).toBeUndefined()
    expect(result, `no result file was written; exit=${String(launch.status)}; stderr=${launch.stderr}`).toBeDefined()
    // The fixture exits 0 only when every recorded check passed.
    expect(
      launch.status,
      `fixture exit ${String(launch.status)}; failures=${JSON.stringify(result?.errors)}; fatal=${result?.fatal ?? 'none'}`,
    ).toBe(0)
    expect(result?.ok).toBe(true)
    // Every expected check must be present (guards against a silently shortened run).
    for (const check of CHECKS) {
      expect(Object.prototype.hasOwnProperty.call(result?.checks ?? {}, check), `missing check: ${check}`).toBe(true)
    }
  })

  it.each(CHECKS)('check %s holds under the real Electron Host', check => {
    expect(result, 'fixture did not produce a result file').toBeDefined()
    expect(
      result?.checks[check],
      `check ${check} failed; evidence=${JSON.stringify(result?.evidence?.[check])}`,
    ).toBe(true)
  })
})
