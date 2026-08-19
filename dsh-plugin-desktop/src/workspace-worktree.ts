import { execFile } from 'node:child_process'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { SessionWorkspaceBinding } from './workspace-workbench.ts'

const execFileAsync = promisify(execFile)

export type WorkspaceWorktreeErrorCode = 'git-unavailable' | 'repository-not-found' | 'invalid-binding'

export class WorkspaceWorktreeError extends Error {
  constructor(public readonly code: WorkspaceWorktreeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'WorkspaceWorktreeError'
  }
}

export interface WorkspaceWorktreeEntry {
  readonly path: string
  readonly head: string
  readonly branch?: string
  readonly detached: boolean
  readonly bare: boolean
}

export interface WorkspaceCheckout {
  readonly sessionId: string
  readonly repositoryRoot: string
  readonly checkoutPath: string
  readonly commonGitDir: string
  readonly branch?: string
  readonly head: string
  readonly detached: boolean
  readonly ownership: 'managed' | 'unmanaged'
  readonly worktrees: readonly WorkspaceWorktreeEntry[]
}

export type WorkspaceWorktreeRunner = (args: readonly string[]) => Promise<string>

/** Read-only discovery boundary for a Session's Git checkout and worktrees. */
export class WorkspaceWorktreeService {
  constructor(private readonly run: WorkspaceWorktreeRunner = defaultGitRunner) {}

  async inspect(binding: SessionWorkspaceBinding): Promise<WorkspaceCheckout> {
    const checkoutPath = absoluteBindingPath(binding.worktreePath ?? binding.cwd)
    const results = await Promise.allSettled([
      this.run(['-C', checkoutPath, 'rev-parse', '--show-toplevel']),
      this.run(['-C', checkoutPath, 'rev-parse', '--git-common-dir']),
      this.run(['-C', checkoutPath, 'rev-parse', '--verify', 'HEAD']),
      this.run(['-C', checkoutPath, 'branch', '--show-current']),
      this.run(['-C', checkoutPath, 'worktree', 'list', '--porcelain']),
    ])
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (rejected !== undefined) {
      if (rejected.reason instanceof WorkspaceWorktreeError) throw rejected.reason
      throw new WorkspaceWorktreeError('repository-not-found', `Git checkout is unavailable at ${checkoutPath}`, { cause: rejected.reason })
    }
    const values = results.map(result => (result as PromiseFulfilledResult<string>).value.trim())
    const [topLevel = '', commonGitDir = '', head = '', branch = '', worktreeRaw = ''] = values
    if (topLevel === '' || commonGitDir === '' || head === '') {
      throw new WorkspaceWorktreeError('repository-not-found', `Git checkout is incomplete at ${checkoutPath}`)
    }
    const absoluteCommonGitDir = resolve(checkoutPath, commonGitDir)
    const repositoryRoot = basename(absoluteCommonGitDir).toLowerCase() === '.git'
      ? dirname(absoluteCommonGitDir)
      : resolve(topLevel)
    const worktrees = parseWorktreeList(worktreeRaw)
    const current = worktrees.find(item => samePath(item.path, checkoutPath))
    const currentBranch = current?.branch ?? (branch === '' ? undefined : branch)
    return {
      sessionId: binding.sessionId,
      repositoryRoot,
      checkoutPath,
      commonGitDir: absoluteCommonGitDir,
      ...currentBranch === undefined ? {} : { branch: currentBranch },
      head,
      detached: current?.detached ?? branch === '',
      ownership: 'unmanaged',
      worktrees,
    }
  }
}

function absoluteBindingPath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '' || !isAbsolute(trimmed)) throw new WorkspaceWorktreeError('invalid-binding', 'Session workspace path must be absolute')
  return resolve(trimmed)
}

function parseWorktreeList(raw: string): readonly WorkspaceWorktreeEntry[] {
  const entries: WorkspaceWorktreeEntry[] = []
  let current: { path?: string; head?: string; branch?: string; detached: boolean; bare: boolean } | undefined
  const flush = (): void => {
    if (current?.path !== undefined && current.head !== undefined) {
      entries.push({
        path: resolve(current.path),
        head: current.head,
        ...current.branch === undefined ? {} : { branch: current.branch },
        detached: current.detached,
        bare: current.bare,
      })
    }
    current = undefined
  }
  for (const line of raw.split(/\r?\n/u)) {
    if (line === '') {
      flush()
      continue
    }
    const [key, ...rest] = line.split(' ')
    const value = rest.join(' ').trim()
    if (key === 'worktree') {
      flush()
      current = { path: value, detached: false, bare: false }
    } else if (current !== undefined && key === 'HEAD') current.head = value
    else if (current !== undefined && key === 'branch') current.branch = value.replace(/^refs\/heads\//u, '')
    else if (current !== undefined && key === 'detached') current.detached = true
    else if (current !== undefined && key === 'bare') current.bare = true
  }
  flush()
  return entries
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)
  return process.platform === 'win32' ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase() : normalizedLeft === normalizedRight
}

async function defaultGitRunner(args: readonly string[]): Promise<string> {
  try {
    const result = await execFileAsync('git', [...args], {
      shell: false,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    return result.stdout
  } catch (error) {
    throw new WorkspaceWorktreeError('git-unavailable', 'Git is unavailable for this checkout', { cause: error })
  }
}

export { parseWorktreeList, samePath }
