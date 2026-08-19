import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceChangesService } from './workspace-changes-service.ts'

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

type Listener = (snapshot: WorkspaceWorkbenchSnapshot) => void

/**
 * Host-owned W0 state for the desktop Workbench. It deliberately has no
 * filesystem or Git side effects: those belong to later domain services.
 */
export class WorkspaceWorkbenchService {
  readonly changes: WorkspaceChangesService
  private readonly bindings = new Map<string, SessionWorkspaceBinding>()
  private readonly activity: WorkspaceActivityEvent[] = []
  private readonly listeners = new Set<Listener>()
  private sequence = 0
  private disposed = false

  constructor(private readonly maxActivity = 2_000) {
    if (!Number.isInteger(maxActivity) || maxActivity < 1) {
      throw new Error('workspace workbench maxActivity must be a positive integer')
    }
    this.changes = new WorkspaceChangesService()
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
    const service = new WorkspaceWorkbenchService()
    ctx.workspaceWorkbench = service
    return () => {
      service.dispose()
      delete ctx.workspaceWorkbench
    }
  }, 'dsh-plugin-desktop: Workspace Workbench service')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workspaceWorkbench?: WorkspaceWorkbenchService
  }
}
