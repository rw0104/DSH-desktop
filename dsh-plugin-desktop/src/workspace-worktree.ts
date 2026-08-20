import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { SessionWorkspaceBinding } from './workspace-workbench.ts'

const execFileAsync = promisify(execFile)

export type WorkspaceWorktreeErrorCode =
  | 'git-unavailable'
  | 'repository-not-found'
  | 'invalid-binding'
  | 'branch-invalid'
  | 'branch-exists'
  | 'repository-dirty'
  | 'path-outside-managed-root'
  | 'worktree-in-use'

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

export interface CreateManagedWorktreeInput {
  readonly sessionId: string
  readonly profileName: string
  readonly repositoryRoot: string
  readonly branch: string
}

export interface ManagedWorktreeRecord {
  readonly sessionId: string
  readonly repositoryRoot: string
  readonly worktreePath: string
  readonly branch: string
  readonly createdAt: string
}

/** Read-only discovery boundary for a Session's Git checkout and worktrees. */
export class WorkspaceWorktreeService {
  private readonly managed = new Map<string, ManagedWorktreeRecord>()
  private readonly creating = new Set<string>()

  constructor(
    private readonly run: WorkspaceWorktreeRunner = defaultGitRunner,
    private readonly managedRoot = join(homedir(), 'DSH Desktop', 'worktrees'),
  ) {}

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
      ownership: [...this.managed.values()].some(item => samePath(item.worktreePath, checkoutPath)) ? 'managed' : 'unmanaged',
      worktrees,
    }
  }

  /** Create a clean, Host-named worktree below the fixed managed root. */
  async createManaged(input: CreateManagedWorktreeInput, now = new Date()): Promise<SessionWorkspaceBinding & { worktreePath: string; repositoryRoot: string; branch: string }> {
    if (input.sessionId.trim() === '' || input.profileName.trim() === '') throw new WorkspaceWorktreeError('invalid-binding', 'managed worktree requires sessionId and profileName')
    const branch = input.branch.trim()
    if (branch === '' || branch.includes('\0')) throw new WorkspaceWorktreeError('branch-invalid', 'managed worktree branch is invalid')
    if (this.managed.has(input.sessionId) || this.creating.has(input.sessionId)) throw new WorkspaceWorktreeError('worktree-in-use', `Session ${input.sessionId} already owns a managed worktree`)
    this.creating.add(input.sessionId)
    try {
      return await this.createManagedInternal(input, now)
    } finally {
      this.creating.delete(input.sessionId)
    }
  }

  private async createManagedInternal(input: CreateManagedWorktreeInput, now: Date): Promise<SessionWorkspaceBinding & { worktreePath: string; repositoryRoot: string; branch: string }> {
    const repositoryRoot = absoluteBindingPath(input.repositoryRoot)
    const branch = input.branch.trim()
    try {
      const discovered = (await this.run(['-C', repositoryRoot, 'rev-parse', '--show-toplevel'])).trim()
      if (!samePath(discovered, repositoryRoot)) throw new WorkspaceWorktreeError('repository-not-found', 'repository root does not match Git checkout')
      if ((await this.run(['-C', repositoryRoot, 'status', '--porcelain'])).trim() !== '') {
        throw new WorkspaceWorktreeError('repository-dirty', 'source checkout must be clean before creating a managed worktree')
      }
      try {
        await this.run(['-C', repositoryRoot, 'check-ref-format', '--branch', branch])
      } catch (error) {
        throw new WorkspaceWorktreeError('branch-invalid', `branch ${branch} is invalid`, { cause: error })
      }
      try {
        await this.run(['-C', repositoryRoot, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
        throw new WorkspaceWorktreeError('branch-exists', `branch ${branch} already exists`)
      } catch (error) {
        if (error instanceof WorkspaceWorktreeError && error.code === 'branch-exists') throw error
      }
      const entries = parseWorktreeList(await this.run(['-C', repositoryRoot, 'worktree', 'list', '--porcelain']))
      if (entries.some(entry => entry.branch === branch)) throw new WorkspaceWorktreeError('branch-exists', `branch ${branch} is already checked out`)
    } catch (error) {
      if (error instanceof WorkspaceWorktreeError) throw error
      throw new WorkspaceWorktreeError('repository-not-found', `cannot inspect repository ${repositoryRoot}`, { cause: error })
    }
    mkdirSync(this.managedRoot, { recursive: true })
    const target = resolve(this.managedRoot, `${safeSegment(input.sessionId)}-${randomUUID().slice(0, 8)}`)
    if (!isWithin(this.managedRoot, target)) throw new WorkspaceWorktreeError('path-outside-managed-root', 'managed worktree target escaped its root')
    try {
      await this.run(['-C', repositoryRoot, 'worktree', 'add', '-b', branch, target, 'HEAD'])
    } catch (error) {
      throw new WorkspaceWorktreeError('git-unavailable', `could not create managed worktree for ${input.sessionId}`, { cause: error })
    }
    const record: ManagedWorktreeRecord = { sessionId: input.sessionId, repositoryRoot, worktreePath: target, branch, createdAt: now.toISOString() }
    this.managed.set(input.sessionId, record)
    return {
      sessionId: input.sessionId,
      profileName: input.profileName,
      cwd: target,
      repositoryRoot,
      worktreePath: target,
      branch,
      createdAt: record.createdAt,
      updatedAt: record.createdAt,
    }
  }

  /** Remove only a clean worktree previously created by this Host service. */
  async removeManaged(binding: SessionWorkspaceBinding): Promise<void> {
    const record = this.managed.get(binding.sessionId)
    const target = binding.worktreePath === undefined ? undefined : absoluteBindingPath(binding.worktreePath)
    if (record === undefined || target === undefined || !samePath(record.worktreePath, target) || !isWithin(this.managedRoot, target)) {
      throw new WorkspaceWorktreeError('path-outside-managed-root', 'Session does not own this managed worktree')
    }
    const dirty = (await this.run(['-C', target, 'status', '--porcelain'])).trim()
    if (dirty !== '') throw new WorkspaceWorktreeError('worktree-in-use', 'managed worktree has uncommitted changes')
    try {
      await this.run(['-C', record.repositoryRoot, 'worktree', 'remove', '--', target])
    } catch (error) {
      throw new WorkspaceWorktreeError('git-unavailable', `could not remove managed worktree ${target}`, { cause: error })
    }
    this.managed.delete(binding.sessionId)
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
  const normalizedLeft = canonicalPath(left)
  const normalizedRight = canonicalPath(right)
  return process.platform === 'win32' ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase() : normalizedLeft === normalizedRight
}

/** Git may return a full path while Node receives an equivalent 8.3 short path on Windows. */
function canonicalPath(value: string): string {
  const normalized = resolve(value)
  try {
    return realpathSync.native(normalized)
  } catch {
    return normalized
  }
}

function isWithin(root: string, target: string): boolean {
  const child = relative(resolve(root), resolve(target))
  return child === '' || child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

function safeSegment(value: string): string {
  const segment = value.trim().replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return segment === '' ? 'session' : segment.slice(0, 80)
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
