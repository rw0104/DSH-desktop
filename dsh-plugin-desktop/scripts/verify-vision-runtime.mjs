import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIN_PYTHON = { major: 3, minor: 11 }

export function parsePythonVersion(output) {
  const match = /Python\s+(\d+)\.(\d+)\.(\d+)/u.exec(output)
  if (match === null) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function isSupportedPython(version) {
  return version !== undefined
    && (version.major > MIN_PYTHON.major
      || version.major === MIN_PYTHON.major && version.minor >= MIN_PYTHON.minor)
}

export function defaultBrowserPaths(platform, environment = process.env) {
  const paths = []
  for (const key of ['DSH_VISION_BROWSER', 'CHROME_PATH', 'CHROMIUM_PATH', 'EDGE_PATH']) {
    if (environment[key] !== undefined) paths.push(environment[key])
  }
  if (platform === 'win32') {
    const localAppData = environment.LOCALAPPDATA
    const programFiles = environment.ProgramFiles
    const programFilesX86 = environment['ProgramFiles(x86)']
    for (const root of [localAppData, programFiles, programFilesX86]) {
      if (root === undefined) continue
      paths.push(`${root}\\Google\\Chrome\\Application\\chrome.exe`)
      paths.push(`${root}\\Microsoft\\Edge\\Application\\msedge.exe`)
      paths.push(`${root}\\Chromium\\Application\\chrome.exe`)
    }
  } else if (platform === 'darwin') {
    paths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    )
  } else {
    paths.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge')
  }
  return [...new Set(paths)]
}

export function probeVisionRuntime(options = {}) {
  const platform = options.platform ?? process.platform
  const environment = options.environment ?? process.env
  const run = options.run ?? runCommand
  const browserExists = options.browserExists ?? existsSync
  const python = probePython(environment, run)
  const browser = probeBrowser(
    options.browserPaths ?? defaultBrowserPaths(platform, environment),
    browserExists,
  )
  return {
    python,
    browser,
    overall: python.status === 'ok' ? 'ok' : 'error',
  }
}

function probePython(environment, run) {
  const candidates = []
  let unsupported
  if (environment.DSH_VISION_PYTHON !== undefined) {
    candidates.push({ command: environment.DSH_VISION_PYTHON, args: ['--version'] })
  }
  candidates.push(
    { command: 'python', args: ['--version'] },
    { command: 'python3', args: ['--version'] },
    { command: 'py', args: ['-3', '--version'] },
  )
  for (const candidate of candidates) {
    const result = run(candidate.command, candidate.args)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const version = parsePythonVersion(output)
    if (result.status === 0 && isSupportedPython(version)) {
      return {
        status: 'ok',
        executable: candidate.command,
        version: `${version.major}.${version.minor}.${version.patch}`,
      }
    }
    if (version !== undefined && !isSupportedPython(version)) {
      unsupported = { candidate, version }
    }
  }
  if (unsupported !== undefined) {
    return {
      status: 'error',
      executable: unsupported.candidate.command,
      version: `${unsupported.version.major}.${unsupported.version.minor}.${unsupported.version.patch}`,
      detail: 'Python 3.11 or newer is required',
    }
  }
  return { status: 'error', detail: 'Python 3.11 or newer was not found' }
}

function probeBrowser(paths, browserExists) {
  const executable = paths.find(path => browserExists(path))
  return executable === undefined
    ? {
        status: 'warning',
        detail: 'Chrome, Chromium or Edge was not found; HTML screenshots are unavailable',
      }
    : { status: 'ok', executable }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = probeVisionRuntime()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.overall !== 'ok' || process.argv.includes('--require-browser') && report.browser.status !== 'ok') {
    process.exitCode = 1
  }
}
