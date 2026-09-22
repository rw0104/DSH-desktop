/** Read-only inventory of Profile links that couple an installed runtime to a checkout. */
import { lstat, readdir, readlink, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

function within(root, path) {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

/** Inspect metadata only; never traverse a child link or import a Profile package. */
export async function auditRuntimeBoundary({ workspaceRoot, harnessHome }) {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(harnessHome)) throw new Error('Audit roots must be absolute')
  const workspace = await realpath(workspaceRoot)
  const profiles = join(harnessHome, 'profiles')
  const issues = []
  let examinedLinks = 0
  async function inspect(path) {
    const info = await lstat(path)
    if (info.isSymbolicLink()) {
      examinedLinks++
      const target = resolve(dirname(path), await readlink(path))
      let canonicalTarget
      try { canonicalTarget = await realpath(path) } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (within(resolve(workspaceRoot), target) || within(workspace, canonicalTarget ?? target)) {
        issues.push({ path, target, ...(canonicalTarget ? { canonicalTarget } : {}) })
      }
      return
    }
    if (!info.isDirectory()) return
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) await inspect(join(path, entry.name))
    }
  }
  let canonicalProfiles
  try { canonicalProfiles = await realpath(profiles) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { workspaceRoot: workspace, profiles, examinedLinks, issues }
  }
  if (within(workspace, canonicalProfiles)) issues.push({ path: profiles, target: canonicalProfiles })
  else await inspect(profiles)
  issues.sort((a, b) => a.path.localeCompare(b.path))
  return { workspaceRoot: workspace, profiles, examinedLinks, issues }
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
    console.log(`runtime-boundary: ${report.issues.length} checkout links among ${report.examinedLinks} inspected Profile links`)
    for (const issue of report.issues.slice(0, 5)) console.log(`  ${issue.path} -> ${issue.canonicalTarget ?? issue.target}`)
    if (report.issues.length) console.error('Protected Profile depends on this checkout. Review recovery before modifying linked runtime files. No files were changed.')
  }
  process.exitCode = report.issues.length ? 1 : 0
}
