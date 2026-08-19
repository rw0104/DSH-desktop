import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SessionWorkspaceBinding } from './workspace-workbench.ts'
import { parseWorkspaceDiff, type WorkspaceChangeFile } from './workspace-changes.ts'

const execFileAsync = promisify(execFile)

/** Injectable Git command boundary; production uses execFile with no shell. */
export type WorkspaceGitRunner = (args: readonly string[]) => Promise<string>

/** One file in the unified Changes projection. */
export interface WorkspaceChangeEntry extends WorkspaceChangeFile {
  readonly xy: string
  readonly staged: boolean
  readonly unstaged: boolean
  readonly stagedHunks: readonly WorkspaceChangeFile['hunks'][number][]
}

/** A checkout-scoped Changes snapshot. */
export interface WorkspaceChangesSnapshot {
  readonly sessionId: string
  readonly repositoryRoot: string | undefined
  readonly branch: string
  readonly entries: readonly WorkspaceChangeEntry[]
}

/** Host-owned Changes/Review service for one structured Git checkout. */
export class WorkspaceChangesService {
  constructor(private readonly run: WorkspaceGitRunner = defaultGitRunner) {}

  async snapshot(binding: SessionWorkspaceBinding): Promise<WorkspaceChangesSnapshot> {
    const cwd = binding.worktreePath ?? binding.cwd
    const [root, branch, statusRaw, unstagedRaw, stagedRaw] = await Promise.all([
      this.run(['-C', cwd, 'rev-parse', '--show-toplevel']).catch(() => ''),
      this.run(['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
      this.run(['-C', cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=normal']).catch(() => ''),
      this.run(['-C', cwd, 'diff', '--no-ext-diff', '--no-color', '-U3']).catch(() => ''),
      this.run(['-C', cwd, 'diff', '--cached', '--no-ext-diff', '--no-color', '-U3']).catch(() => ''),
    ])
    const unstagedFiles = parseWorkspaceDiff(unstagedRaw)
    const stagedFiles = parseWorkspaceDiff(stagedRaw)
    const stagedByPath = new Map(stagedFiles.map(file => [file.path, file]))
    const unstagedByPath = new Map(unstagedFiles.map(file => [file.path, file]))
    const status = parseStatus(statusRaw)
    const paths = new Set([...status.keys(), ...stagedByPath.keys(), ...unstagedByPath.keys()])
    const entries = [...paths].sort().map(path => {
      const statusValue = status.get(path) ?? '  '
      const staged = statusValue[0] !== ' ' && statusValue[0] !== '?'
      const unstaged = statusValue === '??' || (statusValue[1] !== undefined && statusValue[1] !== ' ' && statusValue[1] !== '?')
      const unstagedFile = unstagedByPath.get(path)
      const stagedFile = stagedByPath.get(path)
      return {
        ...(unstagedFile ?? stagedFile ?? { path, status: 'unknown' as const, hunks: [] }),
        xy: statusValue,
        staged,
        unstaged,
        hunks: unstagedFile?.hunks ?? [],
        stagedHunks: stagedFile?.hunks ?? [],
      }
    })
    return {
      sessionId: binding.sessionId,
      repositoryRoot: root.trim() === '' ? undefined : root.trim(),
      branch: branch.trim() || 'HEAD',
      entries,
    }
  }

  async stage(binding: SessionWorkspaceBinding, path?: string): Promise<void> {
    await this.mutate(binding, ['add', '-A', ...(path === undefined ? [] : ['--', path])])
  }

  async unstage(binding: SessionWorkspaceBinding, path?: string): Promise<void> {
    await this.mutate(binding, ['reset', '-q', ...(path === undefined ? [] : ['--', path])])
  }

  async revert(binding: SessionWorkspaceBinding, path: string): Promise<void> {
    await this.mutate(binding, ['checkout', '--', path])
  }

  private async mutate(binding: SessionWorkspaceBinding, args: readonly string[]): Promise<void> {
    await this.run(['-C', binding.worktreePath ?? binding.cwd, ...args])
  }
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

async function defaultGitRunner(args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    shell: false,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
  return result.stdout
}
