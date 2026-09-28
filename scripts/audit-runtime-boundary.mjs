/** Read-only inventory of Profile links that couple an installed runtime to a checkout. */
import { lstat, readdir, readlink, realpath, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function within(root, path) {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

function withinWindows(root, path) {
  const child = win32.relative(root, path)
  return child === '' || (!win32.isAbsolute(child) && child !== '..' && !child.startsWith('..\\'))
}

/** fsutil returns volume-relative paths. A suffix match alone is not file identity. */
export async function inspectWindowsHardLinks(path, workspace, {
  platform = process.platform,
  execute = execFileAsync,
  canonicalize = realpath,
  metadata = path => stat(path, { bigint: true }),
} = {}) {
  if (platform !== 'win32') return { status: 'unavailable', reason: 'hard-link peer enumeration is unavailable on this platform' }
  try {
    const source = await canonicalize(path)
    const identity = await metadata(source)
    const { stdout } = await execute('fsutil', ['hardlink', 'list', source], {
      encoding: 'utf8', windowsHide: true,
    })
    const peers = stdout.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
    if (peers.length < 2) return { status: 'unavailable', reason: 'fsutil returned an incomplete hard-link inventory' }
    const verifiedPeers = []
    const unresolvedPeers = []
    for (const peer of peers) {
      if (!win32.isAbsolute(peer)) {
        unresolvedPeers.push(peer)
        continue
      }
      // For a volume-relative name, try the canonical source volume first.
      // The workspace root also permits an alternative mounted-volume alias;
      // dev + ino equality is required before trusting any candidate.
      const roots = new Set([win32.parse(source).root, win32.parse(workspace).root])
      const candidates = /^[\\/](?![\\/])/u.test(peer)
        ? [...roots].map(root => win32.join(root, peer))
        : [peer]
      let verified = false
      for (const candidate of candidates) {
        try {
          const canonical = await canonicalize(candidate)
          const info = await metadata(canonical)
          if (info.dev !== identity.dev || info.ino !== identity.ino) continue
          verified = true
          verifiedPeers.push(canonical)
        } catch (error) {
          if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
        }
      }
      if (!verified) unresolvedPeers.push(peer)
    }
    const workspacePeer = verifiedPeers.find(peer => withinWindows(workspace, peer))
    return {
      status: unresolvedPeers.length ? 'unavailable' : 'complete',
      ...(unresolvedPeers.length ? { reason: 'could not verify every fsutil peer against source volume and file identity', unresolvedPeers } : {}),
      peers: [...new Set(verifiedPeers)],
      ...(workspacePeer ? { workspacePeer } : {}),
    }
  } catch (error) {
    return { status: 'unavailable', reason: `hard-link inspection failed (${error.code ?? error.name ?? 'unknown error'})` }
  }
}

/** Inspect metadata only; never traverse a child link or import a Profile package. */
export async function auditRuntimeBoundary({ workspaceRoot, harnessHome }, { inspectHardLinks = inspectWindowsHardLinks } = {}) {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(harnessHome)) throw new Error('Audit roots must be absolute')
  const workspace = await realpath(workspaceRoot)
  const profiles = join(harnessHome, 'profiles')
  const issues = []
  const observations = []
  let examinedLinks = 0
  let examinedFiles = 0
  let hardLinks = 0
  let inspectedHardLinks = 0
  let unavailableHardLinks = 0
  let workspaceHardLinks = 0
  let checkoutLinks = 0
  let brokenLinks = 0
  let externalLinks = 0
  function report() {
    issues.sort((a, b) => a.path.localeCompare(b.path))
    return {
      workspaceRoot: workspace, profiles, examinedLinks, examinedFiles, hardLinks,
      inspectedHardLinks, unavailableHardLinks, workspaceHardLinks, checkoutLinks,
      brokenLinks, externalLinks,
      coupling: checkoutLinks || workspaceHardLinks ? 'detected' : unavailableHardLinks ? 'undetermined' : 'not-detected',
      hardLinkInspection: unavailableHardLinks ? 'unavailable' : hardLinks ? 'complete' : 'not-needed',
      scope: 'Profile metadata only; external directory links are observed but not traversed',
      issues, observations,
    }
  }
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
        observations.push({ path, kind: 'external-link-not-traversed', target, canonicalTarget })
      }
      return
    }
    if (info.isFile()) {
      examinedFiles++
      if (info.nlink > 1) {
        hardLinks++
        const result = await inspectHardLinks(path, workspace)
        if (result.workspacePeer) {
          workspaceHardLinks++
          issues.push({ path, kind: 'workspace-hardlink', linkCount: info.nlink, workspacePeer: result.workspacePeer })
        }
        if (result.status !== 'complete') {
          unavailableHardLinks++
          issues.push({ path, kind: 'hardlink-inspection-unavailable', reason: result.reason })
        } else inspectedHardLinks++
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
    return report()
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
  return report()
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
  const result = await auditRuntimeBoundary({ workspaceRoot, harnessHome })
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`runtime-boundary: coupling ${result.coupling}; ${result.checkoutLinks} checkout links, ${result.workspaceHardLinks} verified workspace hard links; ${result.brokenLinks} broken links; ${result.inspectedHardLinks}/${result.hardLinks} shared files inspected, ${result.unavailableHardLinks} unavailable; ${result.externalLinks} external links not traversed`)
    for (const issue of result.issues.slice(0, 5)) console.log(`  ${issue.kind}: ${issue.path} -> ${issue.canonicalTarget ?? issue.target ?? issue.workspacePeer ?? issue.reason ?? 'invalid metadata'}`)
    if (result.coupling === 'detected') console.error('Verified Profile links depend on this checkout. Review recovery before modifying linked runtime files.')
    if (result.unavailableHardLinks) console.error('Hard-link verification is incomplete; unavailable evidence is not a clean result.')
    if (result.brokenLinks) console.error('Broken Profile links need review; broken links alone do not prove coupling to this checkout.')
    console.log('No files were changed. External directory-link contents were not inspected.')
  }
  process.exitCode = result.issues.length ? 1 : 0
}
