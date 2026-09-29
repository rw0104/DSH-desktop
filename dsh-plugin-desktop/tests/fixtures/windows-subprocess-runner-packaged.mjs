// Packaged RunAsNode smoke fixture for the Windows subprocess runner fix
// (spec windows-subprocess-runner-fix, task 9 Packaged_Smoke).
//
// This script is launched by `scripts/verify-packaged-subprocess.mjs` as the entry of the
// PACKAGED `DSH Desktop.exe` running with `ELECTRON_RUN_AS_NODE=1` — the same launch shape
// the repo already uses in `scripts/verify-packaged-profile.mjs`. In that mode
// `process.execPath` is the packaged desktop executable and `process.versions.electron`
// is defined, so the subprocess-local Desktop_Patch's `withElectronRunAsNode` fires and
// injects `ELECTRON_RUN_AS_NODE=1` into the Windows Job runner it spawns
// (`[process.execPath, <runner>]`). The runner therefore runs as Node, which is only
// possible when the packaged binary's `RunAsNode` fuse is enabled — so an end-to-end
// `pwsh echo hello` success is also live proof of A3 (runner entry executable from the
// packaged tree), A4 (koffi/@deepseek-ai/dsh-win32-process load under the packaged
// Electron) and A5 (the fuse is on).
//
// It composes ONLY the PACKAGED `LocalSubprocessRuntime` and search tools, resolved from
// `resources/app.asar` via a `createRequire` anchored at the archive manifest; it never
// consumes Profile/session/install state and opens no window. The Windows GUI-subsystem
// exe does not reliably attach stdout to the parent, so findings are written to
// `--result-file`; the verifier reads and asserts them.

import { createRequire } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const argValue = name => {
  const prefix = `--${name}=`
  const hit = process.argv.find(a => a.startsWith(prefix))
  return hit === undefined ? undefined : hit.slice(prefix.length)
}

const asar = argValue('asar')
const workDir = argValue('work-dir')
const resultFile = argValue('result-file')
const globPattern = argValue('glob-pattern') ?? '*.needle'
const knownFile = argValue('known-file') ?? 'known-file.needle'
const grepFile = argValue('grep-file') ?? 'haystack.txt'
const grepToken = argValue('grep-token') ?? 'NEEDLE_TOKEN'

const result = { host: {}, checks: {}, evidence: {}, timings: {}, errors: [] }
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

async function main() {
  // Resolve the packaged runtime from the ASAR archive, not the build workspace.
  const req = createRequire(join(asar, 'package.json'))

  // ---- Host runtime form: packaged desktop exe running as Node (RunAsNode) ----
  result.host = {
    execPath: process.execPath,
    execPathIsDesktopExe: /DSH Desktop\.exe$/i.test(process.execPath),
    processType: process.type ?? null, // undefined under ELECTRON_RUN_AS_NODE
    electron: process.versions.electron ?? null,
    node: process.versions.node ?? null,
    runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
    asar,
  }
  record('host_is_packaged_electron_run_as_node',
    result.host.execPathIsDesktopExe && result.host.electron !== null && result.host.runAsNode === '1',
    result.host)

  const hostEnvBefore = process.env.ELECTRON_RUN_AS_NODE ?? null

  const { Context } = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')).href)
  const { LocalSubprocessRuntime } = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-subprocess-local')).href)
  const search = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-tool-fs-search')).href)

  // A2: the packaged ripgrep binary that glob/grep launch physically exists.
  let rgPath = null
  try { rgPath = await search.resolveRgPath() } catch (error) { result.evidence.resolveRgPath_error = String(error && error.message || error) }
  record('a2_ripgrep_binary_present', typeof rgPath === 'string' && existsSync(rgPath), { rgPath, exists: rgPath ? existsSync(rgPath) : false })

  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  const subprocess = ctx.get('subprocess')
  try {
    // A3: the runner entry resolves and physically exists in the packaged tree.
    let runnerEntry = null
    try { runnerEntry = req.resolve('@deepseek-ai/dsh-subprocess-local/runner') } catch { /* recorded below */ }
    record('a3_runner_entry_present', typeof runnerEntry === 'string' && existsSync(runnerEntry), { runnerEntry, exists: runnerEntry ? existsSync(runnerEntry) : false })

    // A4: the real Windows Job runner (not the weaker fallback) executes the commands,
    // which requires koffi/@deepseek-ai/dsh-win32-process to load under the packaged exe.
    let containment = null
    try { containment = subprocess.selectContainmentMode('ordinary') } catch (error) { result.evidence.containment_error = String(error && error.message || error) }
    record('a4_windows_job_containment', containment === 'windows-job', { containment })

    const runManaged = async (argv, extra = {}) => {
      const start = Date.now()
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
      return { exitCode: outcome.exitCode, signal: outcome.signal, stdout, stderr, elapsedMs: Date.now() - start }
    }

    // req 10.3: pwsh echo hello -> exit 0 + stdout hello within 30s.
    const echo = await runManaged([psExe, '-NoProfile', '-NonInteractive', '-Command', 'Write-Output hello'])
    result.timings.pwsh_echo_hello_ms = echo.elapsedMs
    record('packaged_pwsh_echo_hello',
      echo.exitCode === 0 && /hello/.test(echo.stdout) && echo.elapsedMs < 30_000,
      { exitCode: echo.exitCode, stdout: echo.stdout.trim(), stderr: echo.stderr.trim(), elapsedMs: echo.elapsedMs })

    // Supporting: non-zero exit passthrough (req 3.4 parity in packaged form).
    const bad = await runManaged([psExe, '-NoProfile', '-NonInteractive', '-Command', 'exit 7'])
    result.timings.pwsh_nonzero_ms = bad.elapsedMs
    record('packaged_nonzero_exit_passthrough', bad.exitCode === 7, { exitCode: bad.exitCode, elapsedMs: bad.elapsedMs })

    // Informational only: because this smoke launches the Host itself under
    // ELECTRON_RUN_AS_NODE (the only way to drive a packaged app as Node), the Target
    // command may observe the ambient variable. The faithful browser-mode Target-env
    // cleanliness assertion (req 4.x) is covered by the task-8 real-Electron regression.
    const envRead = await runManaged([psExe, '-NoProfile', '-NonInteractive', '-Command', "[Console]::Out.Write('[' + $env:ELECTRON_RUN_AS_NODE + ']')"])
    result.evidence.target_env_run_as_node = envRead.stdout.trim()

    // req 10.4: glob returns the preseeded known file.
    const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: workDir } } } }
    const globStart = Date.now()
    const glob = await search.runRipgrep(ctx, exec, 'glob', search.buildGlobCommand({ pattern: globPattern }), 1 << 20, 3_000, 1 << 16)
    result.timings.glob_ms = Date.now() - globStart
    record('packaged_glob_returns_file', !glob.noMatches && glob.stdout.includes(knownFile), { noMatches: glob.noMatches, stdout: glob.stdout.trim(), elapsedMs: result.timings.glob_ms })

    // req 10.4: grep returns the preseeded file and line.
    const grepStart = Date.now()
    const grep = await search.runRipgrep(ctx, exec, 'grep', search.buildGrepCommand({ pattern: grepToken }), 1 << 20, 3_000, 1 << 16)
    result.timings.grep_ms = Date.now() - grepStart
    const matches = search.parseGrepMatches(grep.stdout)
    const grepHit = matches.find(m => m.path.includes(grepFile) && m.line.includes(grepToken))
    record('packaged_grep_returns_file_and_line', !grep.noMatches && grepHit !== undefined, { noMatches: grep.noMatches, match: grepHit ?? null, matchCount: matches.length, elapsedMs: result.timings.grep_ms })

    // Supporting: a non-matching grep returns an empty result, not a provider failure.
    let noMatchOk = false
    let noMatchDetail = {}
    try {
      const empty = await search.runRipgrep(ctx, exec, 'grep', search.buildGrepCommand({ pattern: 'ZZ_NO_SUCH_TOKEN_ZZ_' + Date.now() }), 1 << 20, 3_000, 1 << 16)
      noMatchOk = empty.noMatches === true && search.parseGrepMatches(empty.stdout).length === 0
      noMatchDetail = { noMatches: empty.noMatches }
    } catch (error) {
      noMatchDetail = { threw: String(error && error.message || error) }
    }
    record('packaged_grep_no_match_empty', noMatchOk, noMatchDetail)

    // The Host process.env is never mutated by the injection (req 4.1 parity).
    const hostEnvAfter = process.env.ELECTRON_RUN_AS_NODE ?? null
    record('host_env_unchanged', hostEnvBefore === hostEnvAfter, { before: hostEnvBefore, after: hostEnvAfter })
  } finally {
    await ctx.fiber.dispose().catch(() => {})
  }

  result.ok = result.errors.length === 0
}

main().then(() => { flush(); process.exit(result.ok ? 0 : 1) }).catch(error => {
  result.ok = false
  result.fatal = String(error && error.stack || error)
  flush()
  process.exit(2)
})
