/** Headless RunAsNode smoke for the packaged Windows subprocess tools (pwsh/glob/grep).
 *
 * Extends the packaged-runtime verification (see verify-packaged-runtime.ts static checks
 * and verify-packaged-profile.mjs's RunAsNode CLI/pnpm/Profile smoke) with the runtime
 * behavior the windows-subprocess-runner-fix restores: a real `pwsh echo hello` plus
 * `glob`/`grep` driven through the PACKAGED `LocalSubprocessRuntime` and the packaged
 * ripgrep binary. It:
 *   1. reads the packaged binary's `RunAsNode` fuse (assumption A5); a disabled fuse is a
 *      release blocker (B3, requirement 10.6) and the smoke stops before launching;
 *   2. launches the built `DSH Desktop.exe` (NOT the installed app) with
 *      `ELECTRON_RUN_AS_NODE=1`, a disposable absolute DSH_HOME/TEMP/TMP/TMPDIR, an
 *      isolated user-data dir and an isolated work dir preseeded with a known glob file
 *      and grep token, and asserts exit 0 + `hello`, glob/grep hits, and a clean run;
 *   3. records the artifact path, sha256 hashes, isolation dirs, per-tool results and
 *      timings, then removes its own disposable root.
 *
 * Run through the Isolated_Runner, e.g. from dsh-plugin-desktop/:
 *   node ../scripts/run-isolated-check.mjs scripts/verify-packaged-subprocess.mjs dist/win-unpacked
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// @electron/fuses ships CommonJS; import the namespace and destructure to avoid the
// unreliable named-export interop under Node's ESM loader.
import electronFuses from '@electron/fuses'

const { FuseV1Options, getCurrentFuseWire } = electronFuses

// FuseState is defined in @electron/fuses' internal ./constants module and is NOT
// re-exported from the package entry, so we mirror its stable sentinel values (the
// ASCII codes the fuse wire stores) rather than reach into an internal subpath.
const FUSE_STATE = { DISABLE: 48, ENABLE: 49, REMOVED: 114, INHERIT: 144 }

const fixturePath = fileURLToPath(new URL('../tests/fixtures/windows-subprocess-runner-packaged.mjs', import.meta.url))

const GLOB_PATTERN = '*.needle'
const KNOWN_FILE = 'known-file.needle'
const GREP_FILE = 'haystack.txt'
const GREP_TOKEN = 'NEEDLE_TOKEN'

// Every check the fixture must report as true for the smoke to pass.
const REQUIRED_CHECKS = [
  'host_is_packaged_electron_run_as_node',
  'a2_ripgrep_binary_present',
  'a3_runner_entry_present',
  'a4_windows_job_containment',
  'packaged_pwsh_echo_hello', // requirement 10.3
  'packaged_nonzero_exit_passthrough',
  'packaged_glob_returns_file', // requirement 10.4
  'packaged_grep_returns_file_and_line', // requirement 10.4
  'packaged_grep_no_match_empty',
  'host_env_unchanged',
]

/** Stream a sha256 so a ~150MB executable does not have to sit in memory. */
function sha256File(filename) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filename)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}

/**
 * Read the RunAsNode fuse from a packaged Electron binary (assumption A5 / blocker B3).
 * @param exePath - the packaged `DSH Desktop.exe`.
 * @returns { enabled, state, raw } where `enabled` is true only when the fuse is ENABLE.
 */
export async function readRunAsNodeFuse(exePath) {
  const wire = await getCurrentFuseWire(exePath)
  const state = wire[FuseV1Options.RunAsNode]
  const stateName = { [FUSE_STATE.ENABLE]: 'ENABLE', [FUSE_STATE.DISABLE]: 'DISABLE', [FUSE_STATE.REMOVED]: 'REMOVED', [FUSE_STATE.INHERIT]: 'INHERIT' }[state] ?? `UNKNOWN(${String(state)})`
  return { enabled: state === FUSE_STATE.ENABLE, state: stateName, fuseVersion: wire.version }
}

/** Resolve the packaged binary/archive locations from a completed app output directory. */
export function resolvePackagedPaths(appOutDir) {
  const root = resolve(appOutDir)
  const exePath = join(root, 'DSH Desktop.exe')
  const asarPath = join(root, 'resources', 'app.asar')
  return { root, exePath, asarPath }
}

/** Launch the packaged exe as Node and drive pwsh/glob/grep; returns the fixture result. */
export function runPackagedSubprocessSmoke(exePath, asarPath, environment = process.env) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-packaged-subprocess-'))
  const workDir = join(root, 'work')
  const userDataDir = join(root, 'user-data')
  const resultFile = join(root, 'result.json')
  mkdirSync(workDir)
  mkdirSync(userDataDir)
  // Preseed the isolated work dir: a file matching the glob and a line carrying the token.
  writeFileSync(join(workDir, KNOWN_FILE), 'the needle we expect glob to discover\n')
  writeFileSync(join(workDir, GREP_FILE), `first line\nline carrying ${GREP_TOKEN} here\nlast line\n`)

  const started = Date.now()
  const launch = spawnSync(exePath, [
    fixturePath,
    `--asar=${asarPath}`,
    `--work-dir=${workDir}`,
    `--result-file=${resultFile}`,
    `--user-data-dir=${userDataDir}`,
    `--glob-pattern=${GLOB_PATTERN}`,
    `--known-file=${KNOWN_FILE}`,
    `--grep-file=${GREP_FILE}`,
    `--grep-token=${GREP_TOKEN}`,
  ], {
    cwd: workDir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    env: {
      ...environment,
      // Drive the packaged desktop exe as a Node interpreter. This is only possible when
      // the RunAsNode fuse is enabled, and it makes process.execPath the desktop exe with
      // process.versions.electron defined — exactly the Host form the fix targets.
      ELECTRON_RUN_AS_NODE: '1',
      // Redirect any Electron user-data write to the disposable dir (protected-location
      // isolation): Windows Electron user-data lives under %APPDATA%\<productName>.
      APPDATA: userDataDir,
    },
  })

  let result
  if (existsSync(resultFile)) {
    try { result = JSON.parse(readFileSync(resultFile, 'utf8')) } catch (error) { result = { parseError: String(error && error.message || error) } }
  }
  return {
    root,
    workDir,
    userDataDir,
    resultFile,
    launchStatus: launch.status,
    launchSignal: launch.signal,
    launchError: launch.error ? String(launch.error.message || launch.error) : null,
    launchStderr: (launch.stderr ?? '').slice(-4000),
    elapsedMs: Date.now() - started,
    result,
  }
}

/** Verify a completed Windows package's subprocess runtime; throws on any failure. */
export async function verifyPackagedSubprocess(appOutDir, environment = process.env) {
  const { root, exePath, asarPath } = resolvePackagedPaths(appOutDir)
  if (!existsSync(exePath)) throw new Error(`packaged executable not found: ${exePath}`)
  if (!existsSync(asarPath)) throw new Error(`packaged archive not found: ${asarPath}`)

  const [exeHash, asarHash] = await Promise.all([sha256File(exePath), sha256File(asarPath)])
  const exeStat = statSync(exePath)
  const asarStat = statSync(asarPath)
  const fuse = await readRunAsNodeFuse(exePath)

  const summary = {
    appOutDir: root,
    exePath,
    exeBytes: exeStat.size,
    exeSha256: exeHash,
    asarPath,
    asarBytes: asarStat.size,
    asarSha256: asarHash,
    runAsNodeFuse: fuse,
  }

  // A5 / B3: a disabled RunAsNode fuse breaks the Run_As_Node_Variable approach. Stop and
  // report the blocker before launching anything (requirement 10.6).
  if (!fuse.enabled) {
    summary.blocked = 'B3'
    process.stdout.write(`PACKAGED_SMOKE_RESULT=${JSON.stringify({ ...summary, ok: false })}\n`)
    throw new Error(
      `B3 blocker: packaged RunAsNode fuse is ${fuse.state} (not ENABLE) in ${exePath}. `
      + 'The Run_As_Node_Variable fix cannot drive the Job runner as Node without it. '
      + 'Alternatives to raise with the user before continuing: (a) enable the RunAsNode fuse '
      + 'in build.electronFuses and rebuild; (b) ship an independent Node runtime as the runner '
      + 'interpreter instead of relying on ELECTRON_RUN_AS_NODE. Do not silently change the fuse.',
    )
  }

  const smoke = runPackagedSubprocessSmoke(exePath, asarPath, environment)
  try {
    const checks = smoke.result?.checks ?? {}
    const missing = REQUIRED_CHECKS.filter(name => checks[name] !== true)
    const combined = {
      ...summary,
      launchStatus: smoke.launchStatus,
      launchElapsedMs: smoke.elapsedMs,
      host: smoke.result?.host,
      timings: smoke.result?.timings,
      evidence: smoke.result?.evidence,
      failingChecks: missing,
      ok: smoke.launchStatus === 0 && smoke.result?.ok === true && missing.length === 0,
    }
    process.stdout.write(`PACKAGED_SMOKE_RESULT=${JSON.stringify(combined)}\n`)
    if (!combined.ok) {
      throw new Error(
        `packaged subprocess smoke failed: launchStatus=${String(smoke.launchStatus)} `
        + `error=${smoke.launchError ?? 'none'} failingChecks=${JSON.stringify(missing)} `
        + `fatal=${smoke.result?.fatal ?? 'none'} stderr=${smoke.launchStderr}`,
      )
    }
    return combined
  } finally {
    // Remove only this smoke's own disposable root; never traverse into anything else.
    if (smoke.root && existsSync(smoke.root) && basename(smoke.root).startsWith('dsh-packaged-subprocess-')) {
      rmSync(smoke.root, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appOutDir = process.argv[2] ?? fileURLToPath(new URL('../dist/win-unpacked', import.meta.url))
  verifyPackagedSubprocess(appOutDir)
    .then(summary => {
      process.stdout.write(
        `verify-packaged-subprocess: pwsh/glob/grep restored in ${basename(summary.appOutDir)}; `
        + `RunAsNode fuse ${summary.runAsNodeFuse.state}; `
        + `pwsh ${summary.timings?.pwsh_echo_hello_ms}ms, glob ${summary.timings?.glob_ms}ms, grep ${summary.timings?.grep_ms}ms.\n`,
      )
    })
    .catch(error => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
