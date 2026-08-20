import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { WorkspaceWorktreeError, WorkspaceWorktreeService } from '../src/workspace-worktree.ts'

const execFileAsync = promisify(execFile)

describe('managed workspace worktrees', () => {
  it('creates and removes a clean Host-owned worktree below the managed root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-root-'))
    const managedRoot = join(root, 'managed')
    try {
      await git(root, 'init')
      await git(root, 'config', 'user.name', 'DSH Test')
      await git(root, 'config', 'user.email', 'dsh@example.invalid')
      await writeFile(join(root, 'README.md'), 'baseline\n', 'utf8')
      await git(root, 'add', 'README.md')
      await git(root, 'commit', '-m', 'baseline')
      const service = new WorkspaceWorktreeService(undefined, managedRoot)
      const binding = await service.createManaged({ sessionId: 'session/one', profileName: 'desktop', repositoryRoot: root, branch: 'feature/session-one' })
      expect(binding.worktreePath.startsWith(managedRoot)).toBe(true)
      expect((await readFile(join(binding.worktreePath, 'README.md'), 'utf8')).replace(/\r\n/gu, '\n')).toBe('baseline\n')
      await expect(service.inspect(binding)).resolves.toMatchObject({ ownership: 'managed', branch: 'feature/session-one' })
      await service.removeManaged(binding)
      await expect(service.inspect(binding)).rejects.toBeInstanceOf(WorkspaceWorktreeError)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('refuses to remove a dirty managed worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-dirty-'))
    const managedRoot = join(root, 'managed')
    try {
      await git(root, 'init')
      await git(root, 'config', 'user.name', 'DSH Test')
      await git(root, 'config', 'user.email', 'dsh@example.invalid')
      await writeFile(join(root, 'README.md'), 'baseline\n', 'utf8')
      await git(root, 'add', 'README.md')
      await git(root, 'commit', '-m', 'baseline')
      const service = new WorkspaceWorktreeService(undefined, managedRoot)
      const binding = await service.createManaged({ sessionId: 's1', profileName: 'desktop', repositoryRoot: root, branch: 'feature/dirty' })
      await writeFile(join(binding.worktreePath, 'README.md'), 'changed\n', 'utf8')
      await expect(service.removeManaged(binding)).rejects.toMatchObject({ code: 'worktree-in-use' } satisfies Partial<WorkspaceWorktreeError>)
      await git(root, 'worktree', 'remove', '--force', '--', binding.worktreePath)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('rejects a branch that already exists even when it is not checked out', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-branch-'))
    try {
      await git(root, 'init')
      await git(root, 'config', 'user.name', 'DSH Test')
      await git(root, 'config', 'user.email', 'dsh@example.invalid')
      await writeFile(join(root, 'README.md'), 'baseline\n', 'utf8')
      await git(root, 'add', 'README.md')
      await git(root, 'commit', '-m', 'baseline')
      await git(root, 'branch', 'feature/existing')
      const service = new WorkspaceWorktreeService(undefined, join(root, 'managed'))
      await expect(service.createManaged({ sessionId: 's1', profileName: 'desktop', repositoryRoot: root, branch: 'feature/existing' })).rejects.toMatchObject({ code: 'branch-exists' } satisfies Partial<WorkspaceWorktreeError>)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('does not treat an unmanaged checkout as removable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-unmanaged-'))
    try {
      const service = new WorkspaceWorktreeService(undefined, join(root, 'managed'))
      await expect(service.removeManaged({ sessionId: 's1', profileName: 'desktop', cwd: root, createdAt: '', updatedAt: '' })).rejects.toMatchObject({ code: 'path-outside-managed-root' } satisfies Partial<WorkspaceWorktreeError>)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

async function git(directory: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', directory, ...args], { windowsHide: true, encoding: 'utf8' })
  return result.stdout
}
