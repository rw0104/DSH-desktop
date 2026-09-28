/** Explicit graphical development launch with disposable state created before runtime imports. */
import { spawn } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditRuntimeBoundary } from './audit-runtime-boundary.mjs'
import { removeIsolatedTree } from './remove-isolated-tree.mjs'

function childExit(executable, args, options) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(executable, args, { ...options, stdio: 'inherit', windowsHide: true })
    const forward = signal => { child.kill(signal) }
    const interrupt = () => forward('SIGINT')
    const terminate = () => forward('SIGTERM')
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    const release = () => {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', terminate)
    }
    child.once('error', error => { release(); reject(error) })
    child.once('close', (code, signal) => { release(); resolveExit(code ?? (signal === 'SIGINT' ? 130 : 1)) })
  })
}

export async function runIsolatedDevelopment(args = [], {
  workspaceRoot = fileURLToPath(new URL('../', import.meta.url)),
  env = process.env,
} = {}) {
  if (!args.every(arg => arg === '--build' || arg === '--upstream-diagnostic')) {
    throw new Error('Supported development arguments: --build, --upstream-diagnostic. State paths are always disposable.')
  }
  const workspace = realpathSync(workspaceRoot)
  const incomingHome = env.DSH_HOME || join(homedir(), '.dsh')
  if (!isAbsolute(incomingHome)) throw new Error('Incoming DSH_HOME must be absolute for the read-only boundary audit')
  const boundary = await auditRuntimeBoundary({ workspaceRoot: workspace, harnessHome: incomingHome })
  if (boundary.coupling !== 'not-detected') {
    throw new Error(`Development launch refused: Profile coupling is ${boundary.coupling}. Run check:runtime-boundary and review recovery before building or launching.`)
  }
  if (boundary.brokenLinks || boundary.externalLinks) {
    console.error(`Development boundary: no verified links into this checkout; ${boundary.brokenLinks} broken links and ${boundary.externalLinks} untraversed external links require separate review.`)
  }
  const tempParent = realpathSync(tmpdir())
  const stateRoot = mkdtempSync(join(tempParent, 'dsh-dev-'))
  const temporary = join(stateRoot, 'tmp')
  const harnessHome = join(stateRoot, 'harness-home')
  const userData = join(stateRoot, 'electron-user-data')
  const workingDirectory = join(stateRoot, 'workspace')
  for (const path of [temporary, harnessHome, userData, workingDirectory]) mkdirSync(path)
  const childEnv = { ...env }
  // Discard inherited runtime path/config overrides as well as Electron's Node mode.
  for (const key of Object.keys(childEnv)) {
    const upper = key.toUpperCase()
    if (upper.startsWith('DSH_') || ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH', 'TEMP', 'TMP', 'TMPDIR'].includes(upper)) delete childEnv[key]
  }
  Object.assign(childEnv, { DSH_HOME: harnessHome, TEMP: temporary, TMP: temporary, TMPDIR: temporary, DSH_DESKTOP_ISOLATED_DEV: '1' })
  try {
    console.log(`Isolated DSH development state: ${stateRoot} (removed when the application exits)`)
    if (args.includes('--build')) {
      const yarnEntry = env.npm_execpath
      if (!yarnEntry || !isAbsolute(yarnEntry) || !lstatSync(yarnEntry).isFile()) {
        throw new Error('Run development builds through corepack yarn dev so the root Yarn release is available')
      }
      const code = await childExit(process.execPath, [yarnEntry, 'run', 'build'], { cwd: workspace, env: childEnv })
      if (code !== 0) return code
    }
    // Requiring electron only returns its executable path. No application package
    // is imported into this process; main.js sees isolated state from process start.
    const requireDesktop = createRequire(join(workspace, 'dsh-plugin-desktop', 'package.json'))
    const electron = requireDesktop('electron')
    if (typeof electron !== 'string' || !isAbsolute(electron)) throw new Error('Electron did not provide an absolute executable path')
    const main = join(workspace, 'dsh-plugin-desktop', 'lib', 'main.js')
    if (!lstatSync(main).isFile()) throw new Error('Desktop build is missing; run corepack yarn dev')
    let diagnostic = args.includes('--upstream-diagnostic')
    for (;;) {
      const launchArgs = [main, `--user-data-dir=${userData}`, ...(diagnostic ? ['--upstream-diagnostic'] : [])]
      const code = await childExit(electron, launchArgs, { cwd: workingDirectory, env: childEnv })
      // Development main returns a restart intent after its normal shutdown.
      // Keep one state root until the final successor exits; never let Electron
      // spawn a detached relaunch which would outlive this cleanup owner.
      if (code !== 75 && code !== 76) return code
      diagnostic = code === 76
    }
  } finally {
    const child = relative(tempParent, stateRoot)
    if (isAbsolute(child) || child.startsWith(`..${sep}`) || dirname(stateRoot) !== tempParent
      || !basename(stateRoot).startsWith('dsh-dev-') || lstatSync(stateRoot).isSymbolicLink()
      || realpathSync(stateRoot) !== stateRoot) {
      throw new Error(`Refusing to clean a replaced or escaped development directory: ${stateRoot}`)
    }
    removeIsolatedTree(stateRoot)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runIsolatedDevelopment(process.argv.slice(2)) }
  catch (error) {
    console.error(`isolated-development: ${error.message}`)
    process.exitCode = 1
  }
}
