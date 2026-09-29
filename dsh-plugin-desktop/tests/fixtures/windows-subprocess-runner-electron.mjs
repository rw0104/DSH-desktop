// Real Electron Host regression fixture for the Windows subprocess runner fix
// (spec windows-subprocess-runner-fix, tasks 8.1/8.2/7/8.3).
//
// This script is launched by `windows-subprocess-runner-electron.spec.ts` as a real
// Electron *main* (browser) process — WITHOUT `ELECTRON_RUN_AS_NODE` — so that
// `process.execPath` is the Electron binary and `process.versions.electron` is
// defined, faithfully reproducing the Host runtime form. It is NOT the desktop
// `main.ts`: it composes only the real `LocalSubprocessRuntime` (no mocked
// child_process) and never consumes Profile/session/install state. It stays headless
// (no BrowserWindow) and writes its findings to `--result-file` because an Electron
// GUI-subsystem process on Windows does not attach its stdout to the parent.
//
// Isolation: the spec owns a disposable root under the isolated TEMP (set by
// scripts/run-isolated-check.mjs) and passes a unique `--user-data-dir`, an isolated
// `--work-dir`, and per-child user-data dirs; cleanup happens in the spec's finally.
import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argValue = name => {
  const prefix = `--${name}=`
  const hit = process.argv.find(a => a.startsWith(prefix))
  return hit === undefined ? undefined : hit.slice(prefix.length)
}

const resultFile = argValue('result-file')
const workDir = argValue('work-dir')
const reproFixture = argValue('repro-runner-fixture')
const reproMarker = argValue('repro-marker-file')
const reproUserData = argValue('repro-user-data-dir')
const globPattern = argValue('glob-pattern') ?? '*.needle'
const knownFile = argValue('known-file') ?? 'known-file.needle'
const grepFile = argValue('grep-file') ?? 'haystack.txt'
const grepToken = argValue('grep-token') ?? 'NEEDLE_TOKEN'

// The exact field error text (requirements problem statement), without the
// "subprocess-local: " module prefix the compiled provider prepends.
const FIELD_ERROR = 'Windows Job runner exited with exit code 0 before proving its managed range empty'

const result = { host: {}, checks: {}, evidence: {}, errors: [] }
const record = (name, pass, detail) => {
  result.checks[name] = Boolean(pass)
  if (detail !== undefined) result.evidence[name] = detail
  if (!pass) result.errors.push(name)
}
const flush = () => { if (resultFile) writeFileSync(resultFile, JSON.stringify(result, null, 2)) }

const psExe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout:${label}`)), ms) }),
  ])
}

/**
 * Reproduce the *unpatched* alpha.2 Windows Job runner launch: spawn
 * `[process.execPath (Electron), <repro runner>, '--', ...targetArgv]` with a runner
 * env that carries NO ELECTRON_RUN_AS_NODE and an IPC channel at fd 3, then apply the
 * exact `settleRange()` predicate copied from the compiled provider's windows-job.ts
 * (fact F-C). The repro runner boots as a desktop app (browser) and exits 0 without
 * IPC, so the predicate throws the field error.
 */
function reproduceUnpatchedLaunch(label, targetArgv) {
  return new Promise(resolve => {
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key]
    }
    const child = spawn(process.execPath, [
      reproFixture,
      `--user-data-dir=${reproUserData}-${label}`,
      `--marker-file=${reproMarker}.${label}`,
      '--', ...targetArgv,
    ], { cwd: workDir, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })

    let directResultType
    let runnerSpawned = false
    let runnerExit
    let ipcDisconnected = false
    let finished = false
    const finish = errorMessage => {
      if (finished) return
      finished = true
      resolve({
        errorMessage,
        exitCode: runnerExit ? runnerExit.exitCode : null,
        signal: runnerExit ? runnerExit.signal : null,
        ipcDisconnected,
        directResultType: directResultType ?? null,
      })
    }
    const settle = () => {
      if (!runnerSpawned || runnerExit === undefined) return
      const { exitCode, signal } = runnerExit
      if (exitCode === 0 && signal === null) {
        if (directResultType !== undefined) return finish(null)
        if (!ipcDisconnected) return
      }
      const status = signal !== null ? `signal ${signal}` : exitCode === null ? 'without an exit status' : `exit code ${String(exitCode)}`
      finish(`subprocess-local: Windows Job runner exited with ${status} before proving its managed range empty`)
    }
    child.on('message', () => { if (directResultType === undefined) directResultType = 'target-exit'; settle() })
    child.once('spawn', () => {
      runnerSpawned = true
      // Mirror the alpha.2 parent, which sends the runner its start message. The
      // desktop-app stand-in never listens, so no direct result is ever returned.
      try { child.send?.({ type: 'start', cwd: workDir, env: {} }, () => {}) } catch { /* ignore */ }
    })
    child.once('error', error => finish(`spawn-error:${String(error && error.message || error)}`))
    child.once('exit', (code, signal) => { runnerExit = { exitCode: code, signal }; settle() })
    child.once('disconnect', () => { ipcDisconnected = true; settle() })
    setTimeout(() => finish(`timeout-no-ipc-result (exit=${runnerExit ? runnerExit.exitCode : 'pending'})`), 20_000)
  })
}

async function main() {
  // ---- Phase 0: Host runtime form (requirement 9.1) ----
  result.host = {
    processType: process.type ?? null,
    execPath: process.execPath,
    execPathIsElectron: /electron(\.exe)?$/i.test(process.execPath),
    electron: process.versions.electron ?? null,
    node: process.versions.node ?? null,
    runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
  }
  record('host_is_real_electron', result.host.execPathIsElectron && result.host.electron !== null && result.host.processType === 'browser', result.host)

  const hostEnvBefore = process.env.ELECTRON_RUN_AS_NODE ?? null

  // ---- Phase 1: original-failure reproduction (task 8.2, requirement 9.2) ----
  // pwsh as the Target_Command.
  const reproPwsh = await reproduceUnpatchedLaunch('pwsh', [psExe, '-NoProfile', '-Command', 'Write-Output hello'])
  const reproMarkerPwsh = safeReadJson(`${reproMarker}.pwsh`)
  result.evidence.repro_pwsh = { ...reproPwsh, standInProcessType: reproMarkerPwsh?.processType ?? null }
  record('repro_pwsh_field_error',
    typeof reproPwsh.errorMessage === 'string' && reproPwsh.errorMessage.includes(FIELD_ERROR) && reproPwsh.exitCode === 0,
    result.evidence.repro_pwsh)
  record('repro_pwsh_runner_booted_as_desktop_app', reproMarkerPwsh?.processType === 'browser', reproMarkerPwsh)

  // ---- Phase (task 7): glob/grep are the same origin as pwsh (A1) ----
  // ripgrep as the Target_Command: identical unpatched launch, identical failure,
  // because the runner never proceeds far enough to spawn its target argv.
  let rgPath = null
  try {
    const mod = await import('@deepseek-ai/dsh-tool-fs-search')
    rgPath = await mod.resolveRgPath()
  } catch (error) {
    result.evidence.resolveRgPath_error = String(error && error.message || error)
  }
  record('a2_ripgrep_binary_present', typeof rgPath === 'string' && existsSync(rgPath), { rgPath, exists: rgPath ? existsSync(rgPath) : false })

  const reproRg = await reproduceUnpatchedLaunch('rg', [rgPath ?? psExe, '--files'])
  result.evidence.repro_rg = reproRg
  record('a1_glob_grep_same_origin',
    typeof reproRg.errorMessage === 'string' && reproRg.errorMessage.includes(FIELD_ERROR) && reproRg.exitCode === 0
      && reproPwsh.errorMessage === reproRg.errorMessage,
    { pwsh: reproPwsh.errorMessage, rg: reproRg.errorMessage })

  // ---- Phase 2: fixed behavior through the patched runtime (tasks 8.3, A3/A4) ----
  const { Context } = await import('@deepseek-ai/cordis')
  const { LocalSubprocessRuntime } = await import('@deepseek-ai/dsh-subprocess-local')
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  const subprocess = ctx.get('subprocess')

  try {
    // A3: the runner entry physically exists and is resolvable.
    let runnerEntry = null
    try { runnerEntry = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-subprocess-local/runner')) } catch { /* recorded below */ }
    record('a3_runner_entry_present', typeof runnerEntry === 'string' && existsSync(runnerEntry), { runnerEntry, exists: runnerEntry ? existsSync(runnerEntry) : false })

    // Confirm the Windows Job runner containment (NOT the weaker fallback) is what
    // executes our commands — otherwise pwsh success would not prove the runner path.
    // A4: koffi/@deepseek-ai/dsh-win32-process load under Electron for this to be true.
    let containment = null
    try { containment = subprocess.selectContainmentMode('ordinary') } catch (error) { result.evidence.containment_error = String(error && error.message || error) }
    record('a4_windows_job_containment', containment === 'windows-job', { containment })

    const runManaged = async (argv, extra = {}) => {
      const handle = subprocess.spawn({
        argv,
        cwd: workDir,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 1 << 20 }, stderr: { maxBytes: 1 << 20 } },
        graceMs: 3_000,
        ...extra,
      })
      const outcome = await withTimeout(handle.done, 30_000, 'runManaged')
      const stdout = handle.collected.stdout?.readFrom(0)?.text ?? ''
      const stderr = handle.collected.stderr?.readFrom(0)?.text ?? ''
      return { exitCode: outcome.exitCode, signal: outcome.signal, stdout, stderr }
    }

    // 3.3: pwsh echo hello -> exit 0 + stdout hello.
    const echo = await runManaged([psExe, '-NoProfile', '-NonInteractive', '-Command', 'Write-Output hello'])
    record('fixed_pwsh_echo_hello', echo.exitCode === 0 && /hello/.test(echo.stdout), { exitCode: echo.exitCode, stdout: echo.stdout.trim(), stderr: echo.stderr.trim() })

    // 3.4: non-zero exit code passthrough.
    const bad = await runManaged([psExe, '-NoProfile', '-NonInteractive', '-Command', 'exit 7'])
    record('fixed_nonzero_exit_passthrough', bad.exitCode === 7, { exitCode: bad.exitCode })

    // 4.3: Target_Command environment carries no ELECTRON_RUN_AS_NODE.
    const envRead = await runManaged([psExe, '-NoProfile', '-NonInteractive', '-Command', "[Console]::Out.Write('[' + $env:ELECTRON_RUN_AS_NODE + ']')"])
    record('fixed_target_env_no_run_as_node', envRead.stdout.trim() === '[]', { stdout: envRead.stdout.trim() })

    // 6.3: glob returns the known file path.
    const search = await import('@deepseek-ai/dsh-tool-fs-search')
    const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: workDir } } } }
    const glob = await search.runRipgrep(ctx, exec, 'glob', search.buildGlobCommand({ pattern: globPattern }), 1 << 20, 3_000, 1 << 16)
    record('fixed_glob_returns_file', !glob.noMatches && glob.stdout.includes(knownFile), { noMatches: glob.noMatches, stdout: glob.stdout.trim() })

    // 6.4: grep returns file and line.
    const grep = await search.runRipgrep(ctx, exec, 'grep', search.buildGrepCommand({ pattern: grepToken }), 1 << 20, 3_000, 1 << 16)
    const matches = search.parseGrepMatches(grep.stdout)
    const grepHit = matches.find(m => m.path.includes(grepFile) && m.line.includes(grepToken))
    record('fixed_grep_returns_file_and_line', !grep.noMatches && grepHit !== undefined, { noMatches: grep.noMatches, match: grepHit ?? null, matchCount: matches.length })

    // 6.5: a non-matching grep pattern returns an empty result, not a provider failure.
    let noMatchOk = false
    let noMatchDetail = {}
    try {
      const empty = await search.runRipgrep(ctx, exec, 'grep', search.buildGrepCommand({ pattern: 'ZZ_NO_SUCH_TOKEN_ZZ_' + Date.now() }), 1 << 20, 3_000, 1 << 16)
      noMatchOk = empty.noMatches === true && search.parseGrepMatches(empty.stdout).length === 0
      noMatchDetail = { noMatches: empty.noMatches }
    } catch (error) {
      noMatchDetail = { threw: String(error && error.message || error) }
    }
    record('fixed_grep_no_match_empty', noMatchOk, noMatchDetail)

    // ptc mechanism (task 8.3, A6): ptc-runtime-node spawns [nodeExecutable, bootstrap]
    // where nodeExecutable defaults to process.execPath (Electron). The ptc Desktop_Patch
    // injects ELECTRON_RUN_AS_NODE into that child env so the Electron interpreter runs as
    // Node. Demonstrate the mechanism end-to-end at the runtime level: an Electron binary
    // as the Target_Command runs as Node when its env carries the variable.
    let ptcDetail = {}
    try {
      const ptc = await runManaged([process.execPath, '-e', 'process.stdout.write("PTC:"+(process.type||"node"))'], { env: { ELECTRON_RUN_AS_NODE: '1' } })
      ptcDetail = { exitCode: ptc.exitCode, stdout: ptc.stdout.trim() }
      record('ptc_electron_interpreter_runs_as_node', ptc.exitCode === 0 && ptc.stdout.includes('PTC:node'), ptcDetail)
    } catch (error) {
      record('ptc_electron_interpreter_runs_as_node', false, { threw: String(error && error.message || error) })
    }

    // 4.1: Host process.env is never mutated by any of the above.
    const hostEnvAfter = process.env.ELECTRON_RUN_AS_NODE ?? null
    record('host_env_unchanged', hostEnvBefore === hostEnvAfter, { before: hostEnvBefore, after: hostEnvAfter })
  } finally {
    await ctx.fiber.dispose().catch(() => {})
  }

  result.ok = result.errors.length === 0
}

function safeReadJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

const start = () => main().then(() => { flush(); app.exit(result.ok ? 0 : 1) }).catch(error => {
  result.ok = false
  result.fatal = String(error && error.stack || error)
  flush()
  app.exit(2)
})

if (app.isReady()) start()
else app.whenReady().then(start).catch(error => { result.fatal = String(error); flush(); app.exit(2) })
