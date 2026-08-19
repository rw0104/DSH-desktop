import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { parseWorkspaceDiff } from '../src/workspace-changes.ts'
import { WorkspaceChangesError, WorkspaceChangesService } from '../src/workspace-changes-service.ts'
import { createWorkspaceReviewMessage, WorkspaceReviewError, WorkspaceReviewService } from '../src/workspace-review-service.ts'
import { WorkspaceTerminalRegistry } from '../src/workspace-terminal.ts'
import { WorkspaceWorktreeService } from '../src/workspace-worktree.ts'
import { installWorkspaceWorkbench, WorkspaceWorkbenchService } from '../src/workspace-workbench.ts'

const execFileAsync = promisify(execFile)

describe('Workspace Workbench service', () => {
  it('keeps one stable identity across UI reconnects and records bounded terminal lifecycle', () => {
    const service = new WorkspaceTerminalRegistry(20)
    const first = service.register({ sessionId: 's1', source: 'ui', sourceId: 'tab-1', cwd: 'C:\\repo', title: 'shell' }, new Date('2026-01-01T00:00:00Z'))
    service.attach(first.id, new Date('2026-01-01T00:00:01Z'))
    service.input(first.id, 'echo ready', new Date('2026-01-01T00:00:02Z'))
    service.output(first.id, 'ready\n', new Date('2026-01-01T00:00:03Z'))
    service.resize(first.id, 120, 40, new Date('2026-01-01T00:00:04Z'))
    service.disconnect(first.id, 'page refresh', new Date('2026-01-01T00:00:05Z'))
    service.attach(first.id, new Date('2026-01-01T00:00:06Z'))
    expect(service.terminal(first.id)).toMatchObject({ id: first.id, status: 'running', cols: 120, rows: 40, transcriptBytes: 6, lastOutput: 'ready\n' })
    service.exit(first.id, 0, null, new Date('2026-01-01T00:00:07Z'))
    const replacement = service.register({ sessionId: 's1', source: 'ui', sourceId: 'tab-1', cwd: 'C:\\repo', title: 'shell' }, new Date('2026-01-01T00:00:08Z'))
    expect(replacement.id).toBe(first.id)
    expect(replacement.status).toBe('starting')
    expect(service.snapshot().events.map(event => event.kind)).toEqual([
      'created', 'attached', 'input', 'output', 'resized', 'disconnected', 'attached', 'exited', 'attached',
    ])
  })

  it('projects Agent terminal tool calls without crossing Session ownership', () => {
    const service = new WorkspaceTerminalRegistry()
    service.projectAgentEvent('s1', { type: 'tool/call', data: { turn: 3, step: 1, callId: 'call-1', name: 'terminal_create', arguments: JSON.stringify({ title: 'dev', command: 'npm test', cwd: 'C:\\repo' }) } } as any, new Date('2026-01-01T00:00:00Z'))
    service.projectAgentEvent('s1', { type: 'tool/result', data: { turn: 3, step: 1, message: { source: { callId: 'call-1' }, content: [{ type: 'text', text: 'Opened terminal "dev" (uuid: uuid-1).' }] } } } as any, new Date('2026-01-01T00:00:01Z'))
    const first = service.forSession('s1')[0]
    if (first === undefined) throw new Error('expected Agent terminal projection')
    expect(first).toMatchObject({ source: 'agent', sourceId: 'uuid-1', status: 'running', title: 'dev', command: 'npm test', cwd: 'C:\\repo' })
    service.projectAgentEvent('s1', { type: 'tool/call', data: { turn: 3, step: 2, callId: 'call-2', name: 'terminal_send', arguments: JSON.stringify({ uuid: 'uuid-1', text: 'pwd' }) } } as any, new Date('2026-01-01T00:00:02Z'))
    service.projectAgentEvent('s1', { type: 'tool/result', data: { turn: 3, step: 2, message: { source: { callId: 'call-2' }, content: [{ type: 'text', text: 'Sent 3 byte(s) to terminal uuid-1.' }] } } } as any, new Date('2026-01-01T00:00:03Z'))
    expect(service.terminal(first.id)?.lastOutput).toContain('Sent 3 byte')
    expect(service.forSession('s2')).toEqual([])
    expect(service.terminal(`terminal:agent:s2:uuid-1`)).toBeUndefined()
  })

  it('accepts UI PTY adapter events under the same session-scoped identity', () => {
    const service = new WorkspaceTerminalRegistry()
    service.applyAdapterEvent({ sessionId: 's1', source: 'ui', sourceId: 'tab-1', kind: 'attached', cwd: 'C:\\repo' }, new Date('2026-01-01T00:00:00Z'))
    service.applyAdapterEvent({ sessionId: 's1', source: 'ui', sourceId: 'tab-1', kind: 'input', data: { text: 'npm test' } }, new Date('2026-01-01T00:00:01Z'))
    service.applyAdapterEvent({ sessionId: 's1', source: 'ui', sourceId: 'tab-1', kind: 'output', data: { text: 'pass\n' } }, new Date('2026-01-01T00:00:02Z'))
    const terminal = service.forSession('s1')[0]
    expect(terminal).toMatchObject({ id: 'terminal:ui:s1:tab-1', deepLink: { surface: 'terminal', terminalId: 'terminal:ui:s1:tab-1' }, status: 'running', transcriptBytes: 5 })
    expect(service.snapshot().events.map(event => event.kind)).toEqual(['created', 'attached', 'input', 'output'])
  })

  it('inspects the bound checkout and parses worktree ownership without shell interpolation', async () => {
    const root = process.cwd()
    const calls: string[][] = []
    const service = new WorkspaceWorktreeService(async args => {
      calls.push([...args])
      const command = args.slice(2).join(' ')
      if (command === 'rev-parse --show-toplevel') return `${root}\n`
      if (command === 'rev-parse --git-common-dir') return '.git\n'
      if (command === 'rev-parse --verify HEAD') return '0123456789abcdef\n'
      if (command === 'branch --show-current') return 'main\n'
      if (command === 'worktree list --porcelain') return `worktree ${root}\nHEAD 0123456789abcdef\nbranch refs/heads/main\n\n`
      throw new Error(`unexpected git argv: ${args.join(' ')}`)
    })
    const checkout = await service.inspect({ sessionId: 's1', profileName: 'desktop', cwd: root, createdAt: '', updatedAt: '' })
    expect(checkout).toMatchObject({ sessionId: 's1', repositoryRoot: root, checkoutPath: root, branch: 'main', detached: false, ownership: 'unmanaged' })
    expect(checkout.worktrees).toEqual([{ path: root, head: '0123456789abcdef', branch: 'main', detached: false, bare: false }])
    expect(calls.every(args => args[0] === '-C' && args[1] === root)).toBe(true)
  })

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

  it('records a submitted review comment in the Activity Ledger', () => {
    const send = vi.fn()
    const service = new WorkspaceWorkbenchService(20, new WorkspaceReviewService(send))
    const binding = service.bindSession({ sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo', repositoryRoot: 'C:\\repo' })
    service.record({ sessionId: 's1', kind: 'turn', status: 'completed', title: 'turn/end', turnSeq: 3 })
    service.submitReviewComment(binding, {
      repository: 'C:\\repo', path: 'src/main.ts', side: 'new', line: 5, hunkId: 'hunk:12345678', comment: 'Check this branch.',
    }, { id: 'hunk:12345678', oldStart: 4, oldCount: 2, newStart: 4, newCount: 3 })
    expect(send).toHaveBeenCalledOnce()
    expect(service.activityFor('s1').at(-1)).toMatchObject({
      kind: 'file',
      turnSeq: 3,
      title: 'Review src/main.ts:5',
      deepLink: { surface: 'changes', scope: 'last-turn', path: 'src/main.ts', hunkId: 'hunk:12345678' },
    })
  })

  it('binds real Session lifecycle and projects session events into activity', () => {
    const listeners = new Map<string, (...args: any[]) => void>()
    const context = {
      effect: (register: () => () => void) => register(),
      provide: (name: string, value: unknown) => { (context as Record<string, unknown>)[name] = value; return () => { delete (context as Record<string, unknown>)[name] } },
      webServer: { host: '127.0.0.1', port: 43120, register: () => () => {} },
      on: (event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener)
        return () => { listeners.delete(event) }
      },
    } as any
    installWorkspaceWorkbench(context)
    listeners.get('session/created')?.({ id: 's1', header: { cwd: 'C:\\repo', createdAt: 1_000 } })
    listeners.get('session/event')?.(
      { id: 's1' },
      { type: 'turn/start', time: 2_000, data: { turn: 7 } },
    )
    listeners.get('session/event')?.(
      { id: 's1' },
      { type: 'tool/result', time: 3_000, data: { turn: 7, step: 1, meta: { diffs: [{ path: 'src/main.ts', oldText: 'old', newText: 'new' }] } } },
    )
    expect(context.workspaceWorkbench.snapshot()).toMatchObject({
      bindings: [{ sessionId: 's1', cwd: 'C:\\repo' }],
      activity: [
        { kind: 'turn', status: 'started', title: 'turn/start', turnSeq: 7 },
        { kind: 'tool', status: 'completed', title: 'tool/result', turnSeq: 7 },
        { kind: 'file', status: 'completed', title: 'src/main.ts', turnSeq: 7, data: { path: 'src/main.ts', changeKind: 'modified' } },
      ],
    })
    expect(context.workspaceWorkbench.lastTurn('s1')).toEqual({ available: true, turnSeq: 7, paths: ['src/main.ts'] })
    listeners.get('session/disposed')?.({ id: 's1' })
    expect(context.workspaceWorkbench.binding('s1')).toBeUndefined()
  })

  it('serves scoped Changes from the Host binding without accepting cwd authority', async () => {
    const listeners = new Map<string, (...args: any[]) => void>()
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const context = {
      effect: (register: () => () => void) => register(),
      provide: (name: string, value: unknown) => { (context as Record<string, unknown>)[name] = value; return () => { delete (context as Record<string, unknown>)[name] } },
      webServer: {
        host: '127.0.0.1',
        port: 43120,
        register: (route: { path: string; handler: (req: any, res: any) => Promise<void> }) => { routes.set(route.path, route.handler); return () => {} },
      },
      on: (event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener)
        return () => { listeners.delete(event) }
      },
    } as any
    installWorkspaceWorkbench(context)
    listeners.get('session/created')?.({ id: 's1', header: { cwd: process.cwd(), createdAt: 1_000 } })
    listeners.get('session/event')?.({ id: 's1' }, { type: 'turn/start', time: 2_000, data: { turn: 9 } })
    const handler = routes.get('/dsh-desktop/api/workspace/changes')
    if (handler === undefined) throw new Error('route was not installed')

    const response = responseRecorder()
    await handler({ headers: {}, method: 'GET', url: '/dsh-desktop/api/workspace/changes?sessionId=s1&scope=last-turn' }, response)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ sessionId: 's1', scope: 'last-turn', lastTurnSeq: 9, lastTurnAvailable: true })

    const missing = responseRecorder()
    await handler({ headers: {}, method: 'GET', url: '/dsh-desktop/api/workspace/changes?sessionId=missing&cwd=C%3A%5Cforged' }, missing)
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'session-not-found' })
    expect(context.workspaceWorkbench.binding('missing')).toBeUndefined()

    const rejectedPost = responseRecorder()
    await handler({ headers: {}, method: 'POST', url: '/dsh-desktop/api/workspace/changes?sessionId=s1' }, rejectedPost)
    expect(rejectedPost.statusCode).toBe(403)
    expect(rejectedPost.json()).toEqual({ error: 'action header rejected' })
  })

  it('serves Session-scoped terminal projections without accepting renderer cwd', async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const context = {
      effect: (register: () => () => void) => register(),
      provide: (name: string, value: unknown) => { (context as Record<string, unknown>)[name] = value; return () => { delete (context as Record<string, unknown>)[name] } },
      webServer: {
        host: '127.0.0.1',
        port: 43120,
        register: (route: { path: string; handler: (req: any, res: any) => Promise<void> }) => { routes.set(route.path, route.handler); return () => {} },
      },
      on: () => () => {},
    } as any
    installWorkspaceWorkbench(context)
    context.workspaceTerminal.register({ sessionId: 's1', source: 'ui', sourceId: 'tab-1', cwd: 'C:\\repo' })
    const handler = routes.get('/dsh-desktop/api/workspace/terminals')
    if (handler === undefined) throw new Error('terminal route was not installed')

    const response = responseRecorder()
    await handler(request('GET', '/dsh-desktop/api/workspace/terminals?sessionId=s1&cwd=C%3A%5Cforged'), response)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ sessionId: 's1', terminals: [{ id: 'terminal:ui:s1:tab-1', cwd: 'C:\\repo' }] })

    const missing = responseRecorder()
    await handler(request('GET', '/dsh-desktop/api/workspace/terminals?sessionId=missing'), missing)
    expect(missing.statusCode).toBe(200)
    expect(missing.json()).toEqual({ sessionId: 'missing', terminals: [] })
  })

  it('serves a read-only Session worktree inspection route', async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const context = {
      effect: (register: () => () => void) => register(),
      provide: (name: string, value: unknown) => { (context as Record<string, unknown>)[name] = value; return () => { delete (context as Record<string, unknown>)[name] } },
      webServer: {
        host: '127.0.0.1',
        port: 43120,
        register: (route: { path: string; handler: (req: any, res: any) => Promise<void> }) => { routes.set(route.path, route.handler); return () => {} },
      },
      on: () => () => {},
    } as any
    installWorkspaceWorkbench(context)
    context.workspaceWorkbench.bindSession({ sessionId: 's1', profileName: 'desktop', cwd: process.cwd() })
    const handler = routes.get('/dsh-desktop/api/workspace/worktrees')
    if (handler === undefined) throw new Error('worktree route was not installed')

    const response = responseRecorder()
    await handler(request('GET', '/dsh-desktop/api/workspace/worktrees?sessionId=s1&cwd=C%3A%5Cforged'), response)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ sessionId: 's1', checkoutPath: process.cwd(), ownership: 'unmanaged' })

    const missing = responseRecorder()
    await handler(request('GET', '/dsh-desktop/api/workspace/worktrees?sessionId=missing'), missing)
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'session-not-found' })
  })

  it('validates a real hunk and injects a structured review comment into the current Agent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-workbench-review-'))
    const file = join(directory, 'review.txt')
    const inject = vi.fn()
    try {
      await git(directory, 'init')
      await git(directory, 'config', 'user.name', 'DSH Test')
      await git(directory, 'config', 'user.email', 'dsh@example.invalid')
      await writeFile(file, 'first\nsecond\nthird\n', 'utf8')
      await git(directory, 'add', 'review.txt')
      await git(directory, 'commit', '-m', 'baseline')
      await writeFile(file, 'first\nchanged\nthird\n', 'utf8')

      const listeners = new Map<string, (...args: any[]) => void>()
      const routes = new Map<string, (req: any, res: any) => Promise<void>>()
      const context = {
        effect: (register: () => () => void) => register(),
        provide: (name: string, value: unknown) => { (context as Record<string, unknown>)[name] = value; return () => { delete (context as Record<string, unknown>)[name] } },
        agents: { get: (id: string) => id === 's1' ? { inject } : undefined },
        webServer: {
          host: '127.0.0.1',
          port: 43120,
          register: (route: { path: string; handler: (req: any, res: any) => Promise<void> }) => { routes.set(route.path, route.handler); return () => {} },
        },
        on: (event: string, listener: (...args: any[]) => void) => {
          listeners.set(event, listener)
          return () => { listeners.delete(event) }
        },
      } as any
      installWorkspaceWorkbench(context)
      listeners.get('session/created')?.({ id: 's1', header: { cwd: directory, createdAt: 1_000 } })
      const handler = routes.get('/dsh-desktop/api/workspace/changes')
      if (handler === undefined) throw new Error('route was not installed')
      const getResponse = responseRecorder()
      await handler(request('GET', '/dsh-desktop/api/workspace/changes?sessionId=s1&scope=unstaged'), getResponse)
      const snapshot = getResponse.json() as { repositoryRoot: string; entries: { path: string; hunks: { id: string; newStart: number }[] }[] }
      const hunk = snapshot.entries[0]?.hunks[0]
      if (hunk === undefined) throw new Error('expected a real review hunk')

      const postResponse = responseRecorder()
      await handler(request('POST', '/dsh-desktop/api/workspace/changes?sessionId=s1&scope=unstaged', {
        action: 'comment',
        repository: snapshot.repositoryRoot,
        path: 'review.txt',
        side: 'new',
        line: hunk.newStart,
        hunkId: hunk.id,
        comment: 'Please verify this branch.',
      }, { 'x-dsh-workbench-action': 'changes' }), postResponse)
      expect(postResponse.statusCode).toBe(200)
      expect(inject).toHaveBeenCalledOnce()
      const message = inject.mock.calls[0]?.[0] as ReturnType<typeof createWorkspaceReviewMessage>
      expect(message.source).toMatchObject({ kind: 'plugin', plugin: 'dsh-desktop-workbench', form: 'notice' })
      expect(JSON.parse((message.content[0] as { text: string }).text)).toMatchObject({
        type: 'workspace-review-comment', path: 'review.txt', line: hunk.newStart, comment: 'Please verify this branch.',
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15_000)
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
    expect(files[0]?.hunks[0]).toMatchObject({ id: expect.stringMatching(/^hunk:[0-9a-f]{8}$/u), oldStart: 10, oldCount: 2, newStart: 10, newCount: 3 })
    expect(files[0]?.hunks[0]?.lines).toEqual([' const value = 1', '-return value', '+const next = value + 1', '+return next'])
    expect(parseWorkspaceDiff([
      'diff --git a/src/main.ts b/src/main.ts',
      '@@ -10,2 +10,3 @@ function main()',
      ' const value = 1',
      '-return value',
      '+const next = value + 1',
      '+return next',
    ].join('\n'))[0]?.hunks[0]?.id).toBe(files[0]?.hunks[0]?.id)
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
    const binding = { sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo', createdAt: '', updatedAt: '' }
    const unstaged = await service.snapshot(binding, { scope: 'unstaged' })
    const staged = await service.snapshot(binding, { scope: 'staged' })
    const lastTurn = await service.snapshot(binding, { scope: 'last-turn', lastTurnPaths: ['src/main.ts'], lastTurnSeq: 4, lastTurnAvailable: true })
    expect(unstaged).toMatchObject({ repositoryRoot: 'C:\\repo', branch: 'feature', scope: 'unstaged' })
    expect(unstaged.entries.map(entry => [entry.path, entry.staged, entry.unstaged])).toEqual([['src/main.ts', false, true]])
    expect(staged.entries.map(entry => entry.path)).toEqual(['src/new.ts'])
    expect(lastTurn).toMatchObject({ scope: 'last-turn', lastTurnSeq: 4, lastTurnAvailable: true })
    expect(lastTurn.entries.map(entry => entry.path)).toEqual(['src/main.ts'])
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

  it('stages, unstages, and reverts one real Git hunk without touching the other', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-workbench-git-'))
    const file = join(directory, 'sample.txt')
    const original = Array.from({ length: 24 }, (_, index) => `line ${String(index + 1)}`).join('\n') + '\n'
    try {
      await git(directory, 'init')
      await git(directory, 'config', 'user.name', 'DSH Test')
      await git(directory, 'config', 'user.email', 'dsh@example.invalid')
      await writeFile(file, original, 'utf8')
      await git(directory, 'add', 'sample.txt')
      await git(directory, 'commit', '-m', 'baseline')
      const modified = original.replace('line 2\n', 'line two\n').replace('line 20\n', 'line twenty\n')
      await writeFile(file, modified, 'utf8')

      const service = new WorkspaceChangesService()
      const binding = { sessionId: 's1', profileName: 'desktop', cwd: directory, createdAt: '', updatedAt: '' }
      const initial = await service.snapshot(binding, { scope: 'unstaged' })
      expect(initial.entries[0]?.hunks).toHaveLength(2)
      const first = initial.entries[0]?.hunks[0]
      const second = initial.entries[0]?.hunks[1]
      if (first === undefined || second === undefined) throw new Error('expected two hunks')

      await service.mutateHunk(binding, { scope: 'unstaged', path: 'sample.txt', hunkId: first.id, action: 'stage' })
      expect((await git(directory, 'diff', '--cached'))).toContain('line two')
      expect((await git(directory, 'diff'))).toContain('line twenty')
      expect((await git(directory, 'diff'))).not.toContain('line two')

      const staged = await service.snapshot(binding, { scope: 'staged' })
      const stagedHunk = staged.entries[0]?.stagedHunks[0]
      if (stagedHunk === undefined) throw new Error('expected staged hunk')
      await service.mutateHunk(binding, { scope: 'staged', path: 'sample.txt', hunkId: stagedHunk.id, action: 'unstage' })
      expect(await git(directory, 'diff', '--cached')).toBe('')

      const refreshed = await service.snapshot(binding, { scope: 'unstaged' })
      const last = refreshed.entries[0]?.hunks.find(hunk => hunk.lines.some(line => line.includes('line twenty')))
      if (last === undefined) throw new Error('expected second hunk after unstage')
      await service.mutateHunk(binding, { scope: 'unstaged', path: 'sample.txt', hunkId: last.id, action: 'revert' })
      const text = await readFile(file, 'utf8')
      expect(text).toContain('line two')
      expect(text).toContain('line 20')
      expect(text).not.toContain('line twenty')
      await expect(service.mutateHunk(binding, { scope: 'unstaged', path: 'sample.txt', hunkId: last.id, action: 'revert' }))
        .rejects.toMatchObject({ code: 'hunk-not-found' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15_000)

  it('rejects absolute and escaping file mutation paths', async () => {
    const service = new WorkspaceChangesService(async () => '')
    const binding = { sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo', createdAt: '', updatedAt: '' }
    await expect(service.stage(binding, '..\\outside.txt')).rejects.toMatchObject({ code: 'invalid-path' } satisfies Partial<WorkspaceChangesError>)
    await expect(service.revert(binding, 'C:\\outside.txt')).rejects.toMatchObject({ code: 'invalid-path' } satisfies Partial<WorkspaceChangesError>)
  })

  it('reports Git inspection failures instead of presenting a false clean tree', async () => {
    const service = new WorkspaceChangesService(async () => { throw new Error('not a repository') })
    await expect(service.snapshot({ sessionId: 's1', profileName: 'desktop', cwd: 'C:\\not-a-repo', createdAt: '', updatedAt: '' }))
      .rejects.toMatchObject({ code: 'git-unavailable' } satisfies Partial<WorkspaceChangesError>)
  })
})

describe('Workspace review service', () => {
  const binding = { sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo', repositoryRoot: 'C:\\repo', createdAt: '', updatedAt: '' }
  const comment = { repository: 'C:\\repo', path: 'src/main.ts', side: 'new' as const, line: 12, hunkId: 'hunk:12345678', comment: 'Handle the empty case.' }
  const hunk = { id: 'hunk:12345678', oldStart: 10, oldCount: 3, newStart: 10, newCount: 4 }

  it('sends a validated structured comment to the current Session', () => {
    const send = vi.fn()
    const service = new WorkspaceReviewService(send)
    service.submit(binding, comment, hunk)
    expect(send).toHaveBeenCalledWith('s1', comment)
    const message = createWorkspaceReviewMessage(comment)
    expect(message.source).toMatchObject({ kind: 'plugin', plugin: 'dsh-desktop-workbench', form: 'notice' })
    expect(JSON.parse((message.content[0] as { text: string }).text)).toMatchObject({ type: 'workspace-review-comment', path: 'src/main.ts', line: 12 })
  })

  it('fails closed for stale lines and checkout mismatches', () => {
    const service = new WorkspaceReviewService(vi.fn())
    expect(() => service.submit(binding, { ...comment, line: 99 }, hunk)).toThrowError(WorkspaceReviewError)
    expect(() => service.submit(binding, { ...comment, repository: 'C:\\other' }, hunk)).toThrowError(expect.objectContaining({ code: 'checkout-mismatch' }))
    expect(() => service.submit(binding, { ...comment, path: '..\\outside.ts' }, hunk)).toThrowError(expect.objectContaining({ code: 'checkout-mismatch' }))
    expect(() => service.submit(binding, { ...comment, comment: 'x'.repeat(16_385) }, hunk)).toThrowError(expect.objectContaining({ code: 'invalid-comment' }))
  })
})

async function git(directory: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', directory, ...args], { windowsHide: true, encoding: 'utf8' })
  return result.stdout
}

function responseRecorder() {
  let body = ''
  return {
    statusCode: 0,
    setHeader: vi.fn(),
    end: (value: string) => { body = value },
    json: () => JSON.parse(body) as unknown,
  }
}

function request(method: string, url: string, body?: Record<string, unknown>, headers: Record<string, string> = {}) {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  return Object.assign(stream, { method, url, headers })
}
