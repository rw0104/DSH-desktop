import type { Context } from '@deepseek-ai/cordis'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { createWorkspaceReviewMessage, WorkspaceReviewService, type WorkspaceReviewComment } from './workspace-review-service.ts'
import { WorkspaceChangesService } from './workspace-changes-service.ts'
import { installWorkspaceChangesRoutes } from './workspace-changes-routes.ts'
import { WorkspaceTerminalRegistry } from './workspace-terminal.ts'
import { installWorkspaceTerminalRoutes } from './workspace-terminal-routes.ts'
import { WorkspaceWorktreeService } from './workspace-worktree.ts'
import { installWorkspaceWorktreeRoutes } from './workspace-worktree-routes.ts'

/** The stable identity of one Session's filesystem checkout. */
export interface SessionWorkspaceBinding {
  readonly sessionId: string
  readonly profileName: string
  readonly cwd: string
  readonly repositoryRoot?: string
  readonly worktreePath?: string
  readonly branch?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** A bounded, deep-linkable event projected into the Workbench activity ledger. */
export interface WorkspaceActivityEvent {
  readonly id: string
  readonly sessionId: string
  readonly kind: 'turn' | 'tool' | 'approval' | 'file' | 'terminal' | 'artifact' | 'task' | 'subagent'
  readonly status: 'started' | 'running' | 'completed' | 'failed' | 'cancelled'
  readonly turnSeq?: number
  readonly timestamp: string
  readonly title: string
  readonly deepLink?: WorkspaceDeepLink
  readonly data?: Readonly<Record<string, unknown>>
}

/** A typed location that lets one Workbench surface focus another surface. */
export type WorkspaceDeepLink =
  | { readonly surface: 'files'; readonly path: string; readonly line?: number; readonly column?: number }
  | { readonly surface: 'changes'; readonly scope: 'unstaged' | 'staged' | 'last-turn'; readonly path?: string; readonly hunkId?: string }
  | { readonly surface: 'terminal'; readonly terminalId: string; readonly line?: number }
  | { readonly surface: 'artifact'; readonly artifactId: string }
  | { readonly surface: 'tasks'; readonly taskId?: string }

export interface WorkspaceWorkbenchSnapshot {
  readonly bindings: readonly SessionWorkspaceBinding[]
  readonly activity: readonly WorkspaceActivityEvent[]
}

export interface WorkspaceLastTurn {
  readonly available: boolean
  readonly turnSeq?: number
  readonly paths: readonly string[]
}

type Listener = (snapshot: WorkspaceWorkbenchSnapshot) => void

/**
 * Host-owned W0 state for the desktop Workbench. It deliberately has no
 * filesystem or Git side effects: those belong to later domain services.
 */
export class WorkspaceWorkbenchService {
  readonly changes: WorkspaceChangesService
  readonly review: WorkspaceReviewService
  readonly terminals: WorkspaceTerminalRegistry
  readonly worktrees: WorkspaceWorktreeService
  private readonly bindings = new Map<string, SessionWorkspaceBinding>()
  private readonly activity: WorkspaceActivityEvent[] = []
  private readonly listeners = new Set<Listener>()
  private sequence = 0
  private disposed = false

  constructor(private readonly maxActivity = 2_000, review?: WorkspaceReviewService) {
    if (!Number.isInteger(maxActivity) || maxActivity < 1) {
      throw new Error('workspace workbench maxActivity must be a positive integer')
    }
    this.changes = new WorkspaceChangesService()
    this.review = review ?? new WorkspaceReviewService()
    this.terminals = new WorkspaceTerminalRegistry()
    this.worktrees = new WorkspaceWorktreeService()
  }

  submitReviewComment(binding: SessionWorkspaceBinding, comment: WorkspaceReviewComment, hunk: Parameters<WorkspaceReviewService['submit']>[2]): void {
    this.review.submit(binding, comment, hunk)
    const turnSeq = this.lastTurn(binding.sessionId).turnSeq
    this.record({
      sessionId: binding.sessionId,
      kind: 'file',
      status: 'completed',
      title: `Review ${comment.path}:${String(comment.line)}`,
      ...turnSeq === undefined ? {} : { turnSeq },
      deepLink: { surface: 'changes', scope: 'last-turn', path: comment.path, hunkId: comment.hunkId },
      data: { reviewComment: comment },
    })
  }

  bindSession(input: Omit<SessionWorkspaceBinding, 'createdAt' | 'updatedAt'>, now = new Date()): SessionWorkspaceBinding {
    this.assertLive()
    if (input.sessionId.trim() === '' || input.profileName.trim() === '' || input.cwd.trim() === '') {
      throw new Error('workspace binding requires sessionId, profileName, and cwd')
    }
    const previous = this.bindings.get(input.sessionId)
    const createdAt = previous?.createdAt ?? now.toISOString()
    const binding: SessionWorkspaceBinding = { ...input, createdAt, updatedAt: now.toISOString() }
    this.bindings.set(input.sessionId, binding)
    this.publish()
    return binding
  }

  unbindSession(sessionId: string): boolean {
    this.assertLive()
    const removed = this.bindings.delete(sessionId)
    if (removed) this.publish()
    return removed
  }

  binding(sessionId: string): SessionWorkspaceBinding | undefined {
    return this.bindings.get(sessionId)
  }

  record(event: Omit<WorkspaceActivityEvent, 'id' | 'timestamp'>, now = new Date()): WorkspaceActivityEvent {
    this.assertLive()
    if (!this.bindings.has(event.sessionId)) {
      throw new Error(`workspace activity requires a bound session: ${event.sessionId}`)
    }
    const recorded: WorkspaceActivityEvent = {
      ...event,
      id: `activity:${++this.sequence}`,
      timestamp: now.toISOString(),
    }
    this.activity.push(recorded)
    if (this.activity.length > this.maxActivity) this.activity.splice(0, this.activity.length - this.maxActivity)
    this.publish()
    return recorded
  }

  activityFor(sessionId: string): readonly WorkspaceActivityEvent[] {
    return this.activity.filter(event => event.sessionId === sessionId)
  }

  /** Return only file paths attributed to the latest real DSH Turn. */
  lastTurn(sessionId: string): WorkspaceLastTurn {
    const events = this.activityFor(sessionId)
    const turnSeqs = events
      .map(event => event.turnSeq)
      .filter((value): value is number => value !== undefined)
    if (turnSeqs.length === 0) return { available: false, paths: [] }
    const turnSeq = Math.max(...turnSeqs)
    const paths = [...new Set(events
      .filter(event => event.kind === 'file' && event.turnSeq === turnSeq)
      .map(event => event.data?.path)
      .filter((value): value is string => typeof value === 'string' && value !== ''))]
      .sort()
    return { available: true, turnSeq, paths }
  }

  snapshot(): WorkspaceWorkbenchSnapshot {
    return {
      bindings: [...this.bindings.values()],
      activity: [...this.activity],
    }
  }

  subscribe(listener: Listener): () => void {
    this.assertLive()
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.bindings.clear()
    this.activity.length = 0
    this.terminals.dispose()
  }

  private publish(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('workspace workbench is disposed')
  }
}

/** Install one Workbench service for the lifetime of the desktop Host generation. */
export function installWorkspaceWorkbench(ctx: Context): void {
  ctx.effect(() => {
    const service = new WorkspaceWorkbenchService(2_000, new WorkspaceReviewService((sessionId, comment) => {
      const agents = (ctx as unknown as { agents?: { get(id: string): { inject(message: unknown): void } | undefined } }).agents
      const agent = agents?.get(sessionId)
      if (agent === undefined) throw new Error(`no Agent is attached to Session ${sessionId}`)
      agent.inject(createWorkspaceReviewMessage(comment))
    }))
    const disposeService = ctx.provide('workspaceWorkbench', service)
    const disposeTerminalService = ctx.provide('workspaceTerminal', service.terminals)
    const disposeWorktreeService = ctx.provide('workspaceWorktree', service.worktrees)
    const disposeRoutes = installWorkspaceChangesRoutes(ctx, service)
    const disposeTerminalRoutes = installWorkspaceTerminalRoutes(ctx, service.terminals)
    const disposeWorktreeRoutes = installWorkspaceWorktreeRoutes(ctx, service)
    const onCreated = ctx.on('session/created', session => {
      service.bindSession({
        sessionId: String(session.id),
        profileName: 'desktop',
        cwd: session.header.cwd ?? process.cwd(),
      }, new Date(session.header.createdAt))
    })
    const onDisposed = ctx.on('session/disposed', session => {
      service.terminals.disposeSession(String(session.id))
      service.unbindSession(String(session.id))
    })
    const onEvent = ctx.on('session/event', (session, event) => {
      const sessionId = String(session.id)
      if (service.binding(sessionId) === undefined) return
      const turnSeq = eventTurnSeq(event.data)
      service.terminals.projectAgentEvent(sessionId, event, new Date(event.time))
      const kind = activityKind(event.type)
      if (kind !== undefined) {
        service.record({
          sessionId,
          kind,
          status: activityStatus(event.type),
          title: event.type,
          ...turnSeq === undefined ? {} : { turnSeq },
          data: event.data as Readonly<Record<string, unknown>>,
        }, new Date(event.time))
      }
      const binding = service.binding(sessionId)
      if (binding === undefined) return
      for (const change of fileChangesFromEvent(event.type, event.data)) {
        const path = workspaceRelativePath(binding, change.path)
        if (path === undefined) continue
        service.record({
          sessionId,
          kind: 'file',
          status: 'completed',
          title: path,
          ...turnSeq === undefined ? {} : { turnSeq },
          data: { ...change, path },
          deepLink: { surface: 'files', path },
        }, new Date(event.time))
      }
    })
    return () => {
      onCreated()
      onDisposed()
      onEvent()
      disposeRoutes()
      disposeTerminalRoutes()
      disposeWorktreeRoutes()
      service.dispose()
      void disposeService()
      void disposeTerminalService()
      void disposeWorktreeService()
    }
  }, 'dsh-plugin-desktop: Workspace Workbench service')
}

function activityKind(type: string): WorkspaceActivityEvent['kind'] | undefined {
  if (type.startsWith('turn/')) return 'turn'
  if (type.startsWith('tool/')) return 'tool'
  if (type.startsWith('approval/')) return 'approval'
  if (type.startsWith('file/')) return 'file'
  if (type.startsWith('terminal/')) return 'terminal'
  if (type.startsWith('artifact/')) return 'artifact'
  if (type.startsWith('job/')) return 'task'
  if (type.startsWith('subagent/')) return 'subagent'
  return undefined
}

function activityStatus(type: string): WorkspaceActivityEvent['status'] {
  if (type.endsWith('/start') || type.endsWith('/started') || type.endsWith('/request')) return 'started'
  if (type.endsWith('/complete') || type.endsWith('/completed') || type.endsWith('/result') || type.endsWith('/end')) return 'completed'
  if (type.endsWith('/error') || type.endsWith('/failed')) return 'failed'
  if (type.endsWith('/cancel') || type.endsWith('/cancelled') || type.endsWith('/interrupt')) return 'cancelled'
  return 'running'
}

function eventTurnSeq(data: unknown): number | undefined {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined
  const value = (data as { turn?: unknown }).turn
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function fileChangesFromEvent(type: string, data: unknown): readonly { path: string; changeKind: string }[] {
  if (type !== 'tool/result' || data === null || typeof data !== 'object' || Array.isArray(data)) return []
  const meta = (data as { meta?: unknown }).meta
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) return []
  const diffs = (meta as { diffs?: unknown }).diffs
  if (!Array.isArray(diffs)) return []
  return diffs.flatMap(value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
    const path = (value as { path?: unknown }).path
    if (typeof path !== 'string' || path.trim() === '') return []
    const oldText = (value as { oldText?: unknown }).oldText
    const changeKind = oldText === null ? 'added' : 'modified'
    return [{ path, changeKind }]
  })
}

function workspaceRelativePath(binding: SessionWorkspaceBinding, path: string): string | undefined {
  const cwd = resolve(binding.worktreePath ?? binding.cwd)
  const target = isAbsolute(path) ? resolve(path) : resolve(cwd, path)
  const child = relative(cwd, target)
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) return undefined
  return child.replaceAll('\\', '/')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workspaceWorkbench?: WorkspaceWorkbenchService
    workspaceTerminal?: WorkspaceTerminalRegistry
    workspaceWorktree?: WorkspaceWorktreeService
  }
}
