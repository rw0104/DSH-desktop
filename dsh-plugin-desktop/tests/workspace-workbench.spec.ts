import { describe, expect, it, vi } from 'vitest'
import { parseWorkspaceDiff } from '../src/workspace-changes.ts'
import { WorkspaceChangesService } from '../src/workspace-changes-service.ts'
import { WorkspaceWorkbenchService } from '../src/workspace-workbench.ts'

describe('Workspace Workbench service', () => {
  it('binds and updates a Session workspace without losing creation identity', () => {
    const service = new WorkspaceWorkbenchService()
    const first = service.bindSession({ sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo' }, new Date('2026-01-01T00:00:00Z'))
    const second = service.bindSession({ sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo\\worktree', branch: 'feature' }, new Date('2026-01-01T00:01:00Z'))
    expect(first.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt).toBe('2026-01-01T00:01:00.000Z')
    expect(service.binding('s1')?.branch).toBe('feature')
  })

  it('requires a binding before recording activity and publishes immutable snapshots', () => {
    const service = new WorkspaceWorkbenchService(2)
    expect(() => service.record({ sessionId: 'missing', kind: 'tool', status: 'started', title: 'git status' })).toThrow('bound session')
    service.bindSession({ sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo' })
    const listener = vi.fn()
    const dispose = service.subscribe(listener)
    service.record({ sessionId: 's1', kind: 'turn', status: 'started', title: 'Turn 1', turnSeq: 1 })
    service.record({ sessionId: 's1', kind: 'tool', status: 'completed', title: 'git status', turnSeq: 1, deepLink: { surface: 'changes', scope: 'unstaged' } })
    service.record({ sessionId: 's1', kind: 'file', status: 'completed', title: 'main.ts', deepLink: { surface: 'files', path: 'main.ts', line: 12 } })
    expect(listener).toHaveBeenCalledTimes(3)
    expect(service.snapshot().activity.map(event => event.title)).toEqual(['git status', 'main.ts'])
    dispose()
  })

  it('disposes subscriptions and rejects future writes', () => {
    const service = new WorkspaceWorkbenchService()
    service.bindSession({ sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo' })
    service.dispose()
    expect(() => service.bindSession({ sessionId: 's2', profileName: 'desktop', cwd: 'C:\\repo' })).toThrow('disposed')
  })
})

describe('Workspace Changes parser', () => {
  it('returns file status and stable hunk records from unified diff', () => {
    const files = parseWorkspaceDiff([
      'diff --git a/src/main.ts b/src/main.ts',
      'index 1111111..2222222 100644',
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -10,2 +10,3 @@ function main()',
      ' const value = 1',
      '-return value',
      '+const next = value + 1',
      '+return next',
    ].join('\n'))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ path: 'src/main.ts', status: 'modified' })
    expect(files[0]?.hunks[0]).toMatchObject({ id: 'hunk:src/main.ts:1', oldStart: 10, oldCount: 2, newStart: 10, newCount: 3 })
    expect(files[0]?.hunks[0]?.lines).toEqual([' const value = 1', '-return value', '+const next = value + 1', '+return next'])
  })
})

describe('Workspace Changes service', () => {
  it('reads a checkout with structured Git argv and projects staged/unstaged entries', async () => {
    const calls: string[][] = []
    const service = new WorkspaceChangesService(async args => {
      calls.push([...args])
      if (args.includes('--show-toplevel')) return 'C:\\repo\n'
      if (args.includes('--abbrev-ref')) return 'feature\n'
      if (args.includes('status')) return ' M src/main.ts\0A  src/new.ts\0'
      if (args.includes('--cached')) return 'diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n@@ -0,0 +1 @@\n+new\n'
      return 'diff --git a/src/main.ts b/src/main.ts\n@@ -1 +1 @@\n-old\n+new\n'
    })
    const snapshot = await service.snapshot({ sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo', createdAt: '', updatedAt: '' })
    expect(snapshot).toMatchObject({ repositoryRoot: 'C:\\repo', branch: 'feature' })
    expect(snapshot.entries.map(entry => [entry.path, entry.staged, entry.unstaged])).toEqual([
      ['src/main.ts', false, true],
      ['src/new.ts', true, false],
    ])
    expect(calls.every(args => args[0] === '-C' && args[1] === 'C:\\repo')).toBe(true)
  })

  it('uses structured stage, unstage, and revert argv without a shell', async () => {
    const calls: string[][] = []
    const service = new WorkspaceChangesService(async args => { calls.push([...args]); return '' })
    const binding = { sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo', createdAt: '', updatedAt: '' }
    await service.stage(binding, 'src/main.ts')
    await service.unstage(binding, 'src/main.ts')
    await service.revert(binding, 'src/main.ts')
    expect(calls).toEqual([
      ['-C', 'C:\\repo', 'add', '-A', '--', 'src/main.ts'],
      ['-C', 'C:\\repo', 'reset', '-q', '--', 'src/main.ts'],
      ['-C', 'C:\\repo', 'checkout', '--', 'src/main.ts'],
    ])
  })
})
