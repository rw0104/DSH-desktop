/** Read-only inventory of Profile links that couple an installed runtime to a checkout. */
import { lstat, readdir, readlink, realpath } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function within(root, path) {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

function workspaceSuffix(root) {
  return resolve(root).replaceAll('/', '\\').replace(/^[A-Za-z]:/u, '').toLowerCase().replace(/[\\]+$/u, '')
}

function matchesWorkspacePath(value, suffix) {
  const normalized = value.trim().replaceAll('/', '\\').toLowerCase().replace(/[\\]+$/u, '')
  return normalized === suffix || normalized.startsWith(`${suffix}\\`)
}

async function hardLinkPaths(path) {
  if (process.platform !== 'win32') return []
  try {
    const { stdout } = await execFileAsync('fsutil', ['hardlink', 'list', path], {
      encoding: 'utf8', windowsHide: true,
    })
    return stdout.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/** Inspect metadata only; never traverse a child link or import a Profile package. */
export async function auditRuntimeBoundary({ workspaceRoot, harnessHome }) {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(harnessHome)) throw new Error('Audit roots must be absolute')
  const workspace = await realpath(workspaceRoot)
  const profiles = join(harnessHome, 'profiles')
  const issues = []
  let examinedLinks = 0
  let examinedFiles = 0
  let hardLinks = 0
  let workspaceHardLinks = 0
  let checkoutLinks = 0
  let brokenLinks = 0
  let externalLinks = 0
  async function inspect(path) {
    const info = await lstat(path)
    if (info.isSymbolicLink()) {
      examinedLinks++
      const target = resolve(dirname(path), await readlink(path))
      let canonicalTarget
      try { canonicalTarget = await realpath(path) } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error
        brokenLinks++
        issues.push({ path, kind: 'broken-link', target })
        return
      }
      if (within(resolve(workspaceRoot), target) || within(workspace, canonicalTarget)) {
        checkoutLinks++
        issues.push({ path, kind: 'checkout-link', target, canonicalTarget })
      } else {
        externalLinks++
      }
      return
    }
    if (info.isFile()) {
      examinedFiles++
      if (info.nlink > 1) {
        hardLinks++
        const peers = await hardLinkPaths(path)
        const workspacePeer = peers.find(peer => matchesWorkspacePath(peer, workspaceSuffix(workspace)))
        if (workspacePeer !== undefined) {
          workspaceHardLinks++
          issues.push({ path, kind: 'workspace-hardlink', linkCount: info.nlink, workspacePeer })
        }
      }
      return
    }
    if (!info.isDirectory()) return
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink() || entry.isFile()) await inspect(join(path, entry.name))
    }
  }
  let profileInfo
  try { profileInfo = await lstat(profiles) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { workspaceRoot: workspace, profiles, examinedLinks, examinedFiles, hardLinks, workspaceHardLinks, checkoutLinks, brokenLinks, externalLinks, issues }
  }
  // Inspect the Profile root itself before resolving it. A dangling or
  // checkout-targeting junction here must never be mistaken for an absent tree.
  if (profileInfo.isSymbolicLink()) await inspect(profiles)
  else if (profileInfo.isDirectory()) {
    const canonicalProfiles = await realpath(profiles)
    if (within(workspace, canonicalProfiles)) {
      checkoutLinks++
      issues.push({ path: profiles, kind: 'checkout-link', target: canonicalProfiles })
    } else await inspect(profiles)
  } else issues.push({ path: profiles, kind: 'invalid-profile-root' })
  issues.sort((a, b) => a.path.localeCompare(b.path))
  return { workspaceRoot: workspace, profiles, examinedLinks, examinedFiles, hardLinks, workspaceHardLinks, checkoutLinks, brokenLinks, externalLinks, issues }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let workspaceRoot = fileURLToPath(new URL('../', import.meta.url))
  let harnessHome = join(homedir(), '.dsh')
  let json = false
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--json') { json = true; continue }
    if (arg !== '--home' && arg !== '--workspace') throw new Error(`Unknown audit argument: ${arg}`)
    const value = args[++index]
    if (!value || !isAbsolute(value)) throw new Error(`${arg} requires an absolute path`)
    if (arg === '--home') harnessHome = value
    else workspaceRoot = value
  }
  const report = await auditRuntimeBoundary({ workspaceRoot, harnessHome })
  if (json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`runtime-boundary: ${report.issues.length} boundary issues; ${report.checkoutLinks} checkout links, ${report.brokenLinks} broken links, ${report.workspaceHardLinks} workspace hard links (${report.hardLinks} shared files inspected); ${report.externalLinks} valid external links also inspected`)
    for (const issue of report.issues.slice(0, 5)) console.log(`  ${issue.kind}: ${issue.path} -> ${issue.canonicalTarget ?? issue.target ?? `hardlink x${issue.linkCount}`}`)
    if (report.issues.length) console.error('Protected Profile depends on this checkout. Review recovery before modifying linked runtime files. No files were changed.')
  }
  process.exitCode = report.issues.length ? 1 : 0
}
