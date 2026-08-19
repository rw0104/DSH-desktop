import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { SessionWorkspaceBinding } from './workspace-workbench.ts'
import { parseWorkspaceDiff, type WorkspaceChangeFile, type WorkspaceChangeHunk } from './workspace-changes.ts'

const execFileAsync = promisify(execFile)

export type WorkspaceChangesScope = 'unstaged' | 'staged' | 'last-turn'
export type WorkspaceHunkAction = 'stage' | 'unstage' | 'revert'

/** Stable error classes exposed by the Host route instead of raw Git text. */
export type WorkspaceChangesErrorCode =
  | 'git-unavailable'
  | 'git-conflict'
  | 'invalid-path'
  | 'hunk-not-found'
  | 'unsupported-hunk-action'

export class WorkspaceChangesError extends Error {
  constructor(public readonly code: WorkspaceChangesErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'WorkspaceChangesError'
  }
}

/** Injectable Git command boundary; production uses argv and never a shell. */
export type WorkspaceGitRunner = (args: readonly string[], input?: string) => Promise<string>

/** One file in the unified Changes projection. */
export interface WorkspaceChangeEntry extends WorkspaceChangeFile {
  readonly xy: string
  readonly staged: boolean
  readonly unstaged: boolean
  readonly stagedHunks: readonly WorkspaceChangeFile['hunks'][number][]
}

export interface WorkspaceChangesSnapshotOptions {
  readonly scope?: WorkspaceChangesScope
  readonly lastTurnPaths?: readonly string[]
  readonly lastTurnSeq?: number
  readonly lastTurnAvailable?: boolean
}

/** A checkout-scoped Changes snapshot. */
export interface WorkspaceChangesSnapshot {
  readonly sessionId: string
  readonly repositoryRoot: string | undefined
  readonly branch: string
  readonly scope: WorkspaceChangesScope
  readonly lastTurnSeq?: number
  readonly lastTurnAvailable?: boolean
  readonly entries: readonly WorkspaceChangeEntry[]
}

export interface WorkspaceHunkMutation {
  readonly scope: Exclude<WorkspaceChangesScope, 'last-turn'>
  readonly path: string
  readonly hunkId: string
  readonly action: WorkspaceHunkAction
}

/** Host-owned Changes/Review service for one structured Git checkout. */
export class WorkspaceChangesService {
  constructor(private readonly run: WorkspaceGitRunner = defaultGitRunner) {}

  async snapshot(binding: SessionWorkspaceBinding, options: WorkspaceChangesSnapshotOptions = {}): Promise<WorkspaceChangesSnapshot> {
    const scope = options.scope ?? 'unstaged'
    const cwd = binding.worktreePath ?? binding.cwd
    const results = await Promise.allSettled([
      this.run(['-C', cwd, 'rev-parse', '--show-toplevel']),
      this.run(['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']),
      this.run(['-C', cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=normal']),
      this.run(['-C', cwd, 'diff', '--no-ext-diff', '--no-color', '-U3']),
      this.run(['-C', cwd, 'diff', '--cached', '--no-ext-diff', '--no-color', '-U3']),
    ])
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (rejected !== undefined) {
      if (rejected.reason instanceof WorkspaceChangesError) throw rejected.reason
      throw new WorkspaceChangesError('git-unavailable', `Git could not inspect checkout ${cwd}`, { cause: rejected.reason })
    }
    const fulfilled = results as PromiseFulfilledResult<string>[]
    const [root, branch, statusRaw, unstagedRaw, stagedRaw] = fulfilled.map(result => result.value) as [string, string, string, string, string]
    const unstagedFiles = parseWorkspaceDiff(unstagedRaw)
    const stagedFiles = parseWorkspaceDiff(stagedRaw)
    const stagedByPath = new Map(stagedFiles.map(file => [file.path, file]))
    const unstagedByPath = new Map(unstagedFiles.map(file => [file.path, file]))
    const status = parseStatus(statusRaw)
    const paths = new Set([...status.keys(), ...stagedByPath.keys(), ...unstagedByPath.keys()])
    const lastTurnPaths = new Set(options.lastTurnPaths ?? [])
    const entries = [...paths].sort().flatMap(path => {
      const statusValue = status.get(path) ?? '  '
      const staged = statusValue[0] !== ' ' && statusValue[0] !== '?'
      const unstaged = statusValue === '??' || (statusValue[1] !== undefined && statusValue[1] !== ' ' && statusValue[1] !== '?')
      if (scope === 'staged' && !staged) return []
      if (scope === 'unstaged' && !unstaged) return []
      if (scope === 'last-turn' && !lastTurnPaths.has(path)) return []
      const unstagedFile = unstagedByPath.get(path)
      const stagedFile = stagedByPath.get(path)
      return [{
        ...(unstagedFile ?? stagedFile ?? { path, status: 'unknown' as const, hunks: [] }),
        xy: statusValue,
        staged,
        unstaged,
        hunks: unstagedFile?.hunks ?? [],
        stagedHunks: stagedFile?.hunks ?? [],
      }]
    })
    return {
      sessionId: binding.sessionId,
      repositoryRoot: root.trim() === '' ? binding.repositoryRoot : root.trim(),
      branch: branch.trim() || binding.branch || 'HEAD',
      scope,
      ...options.lastTurnSeq === undefined ? {} : { lastTurnSeq: options.lastTurnSeq },
      ...scope === 'last-turn' ? { lastTurnAvailable: options.lastTurnAvailable ?? options.lastTurnPaths !== undefined } : {},
      entries,
    }
  }

  async stage(binding: SessionWorkspaceBinding, path?: string): Promise<void> {
    await this.mutate(binding, ['add', '-A', ...(path === undefined ? [] : ['--', safePath(path)])])
  }

  async unstage(binding: SessionWorkspaceBinding, path?: string): Promise<void> {
    await this.mutate(binding, ['reset', '-q', ...(path === undefined ? [] : ['--', safePath(path)])])
  }

  async revert(binding: SessionWorkspaceBinding, path: string): Promise<void> {
    await this.mutate(binding, ['checkout', '--', safePath(path)])
  }

  /** Re-read both index and worktree diffs before accepting a review anchor. */
  async findHunk(binding: SessionWorkspaceBinding, path: string, hunkId: string): Promise<WorkspaceChangeHunk | undefined> {
    const safe = safePath(path)
    const [unstaged, staged] = await Promise.all([
      this.snapshot(binding, { scope: 'unstaged' }),
      this.snapshot(binding, { scope: 'staged' }),
    ])
    for (const entry of [...unstaged.entries, ...staged.entries]) {
      if (entry.path !== safe) continue
      const hunk = [...entry.hunks, ...entry.stagedHunks].find(candidate => candidate.id === hunkId)
      if (hunk !== undefined) return hunk
    }
    return undefined
  }

  /** Apply exactly one freshly validated hunk to the index or worktree. */
  async mutateHunk(binding: SessionWorkspaceBinding, mutation: WorkspaceHunkMutation): Promise<void> {
    const path = safePath(mutation.path)
    const sourceScope = mutation.scope
    if (mutation.action === 'revert' && sourceScope !== 'unstaged') {
      throw new WorkspaceChangesError('unsupported-hunk-action', 'revert only accepts an unstaged hunk')
    }
    if (mutation.action === 'stage' && sourceScope !== 'unstaged') {
      throw new WorkspaceChangesError('unsupported-hunk-action', 'stage only accepts an unstaged hunk')
    }
    if (mutation.action === 'unstage' && sourceScope !== 'staged') {
      throw new WorkspaceChangesError('unsupported-hunk-action', 'unstage only accepts a staged hunk')
    }
    const snapshot = await this.snapshot(binding, { scope: sourceScope })
    const entry = snapshot.entries.find(candidate => candidate.path === path)
    const hunk = entry === undefined
      ? undefined
      : (sourceScope === 'staged' ? entry.stagedHunks : entry.hunks).find(candidate => candidate.id === mutation.hunkId)
    if (entry === undefined || hunk === undefined) {
      throw new WorkspaceChangesError('hunk-not-found', `hunk ${mutation.hunkId} is stale or no longer exists`)
    }
    const patch = renderHunkPatch(entry, hunk)
    const args = ['-C', binding.worktreePath ?? binding.cwd, 'apply', '--recount', '--whitespace=nowarn']
    if (mutation.action !== 'revert') args.push('--cached')
    if (mutation.action === 'revert' || mutation.action === 'unstage') args.push('--reverse')
    try {
      await this.run(args, patch)
    } catch (error) {
      throw new WorkspaceChangesError('git-conflict', `Git could not apply hunk ${mutation.hunkId}; refresh and retry`, { cause: error })
    }
  }

  private async mutate(binding: SessionWorkspaceBinding, args: readonly string[]): Promise<void> {
    try {
      await this.run(['-C', binding.worktreePath ?? binding.cwd, ...args])
    } catch (error) {
      throw new WorkspaceChangesError('git-conflict', 'Git could not update the checkout; refresh and retry', { cause: error })
    }
  }
}

/** Render the smallest valid patch accepted by `git apply` for one hunk. */
export function renderHunkPatch(entry: WorkspaceChangeEntry, hunk: WorkspaceChangeHunk): string {
  const oldPath = entry.oldPath ?? entry.path
  const oldHeader = entry.status === 'added' ? '/dev/null' : `a/${oldPath}`
  const newHeader = entry.status === 'deleted' ? '/dev/null' : `b/${entry.path}`
  const mode = entry.status === 'added' ? 'new file mode 100644\n' : entry.status === 'deleted' ? 'deleted file mode 100644\n' : ''
  return `diff --git a/${oldPath} b/${entry.path}\n${mode}--- ${oldHeader}\n+++ ${newHeader}\n${hunk.header}\n${hunk.lines.join('\n')}\n`
}

function safePath(path: string): string {
  const value = path.trim()
  const normalized = value.replaceAll('\\', '/')
  if (value === '' || value.includes('\0') || normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized)) {
    throw new WorkspaceChangesError('invalid-path', `invalid checkout-relative path: ${path}`)
  }
  return value
}

function parseStatus(raw: string): Map<string, string> {
  const result = new Map<string, string>()
  const tokens = raw.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token === '') continue
    const xy = token.slice(0, 2)
    const path = token.slice(3)
    result.set(path, xy)
    if ((xy[0] === 'R' || xy[0] === 'C') && tokens[index + 1] !== undefined) index += 1
  }
  return result
}

async function defaultGitRunner(args: readonly string[], input?: string): Promise<string> {
  if (input === undefined) {
    try {
      const result = await execFileAsync('git', [...args], {
        shell: false,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      })
      return result.stdout
    } catch (error) {
      throw new WorkspaceChangesError('git-unavailable', 'Git is unavailable for this checkout', { cause: error })
    }
  }
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('git', [...args], {
      shell: false,
      windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', error => reject(new WorkspaceChangesError('git-unavailable', 'Git is unavailable for this checkout', { cause: error })))
    child.once('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `git apply exited with code ${String(code)}`))
    })
    child.stdin.end(input)
  })
}
