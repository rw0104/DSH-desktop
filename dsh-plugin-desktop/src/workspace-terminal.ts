import type { SessionEvent } from '@deepseek-ai/dsh-session'

export type WorkspaceTerminalSource = 'ui' | 'agent'
export type WorkspaceTerminalStatus = 'starting' | 'running' | 'disconnected' | 'exited' | 'closed'
export type WorkspaceTerminalEventKind = 'created' | 'attached' | 'disconnected' | 'input' | 'output' | 'resized' | 'exited' | 'closed' | 'command'

export interface WorkspaceTerminalRecord {
  readonly id: string
  readonly deepLink: { readonly surface: 'terminal'; readonly terminalId: string }
  readonly sessionId: string
  readonly source: WorkspaceTerminalSource
  readonly sourceId: string
  readonly cwd: string
  readonly title?: string
  readonly command?: string
  readonly cols: number
  readonly rows: number
  readonly status: WorkspaceTerminalStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly exitCode?: number | null
  readonly signal?: string | null
  readonly transcriptBytes: number
  readonly lastOutput?: string
}

export interface WorkspaceTerminalEvent {
  readonly id: string
  readonly terminalId: string
  readonly sessionId: string
  readonly source: WorkspaceTerminalSource
  readonly kind: WorkspaceTerminalEventKind
  readonly status: WorkspaceTerminalStatus
  readonly timestamp: string
  readonly turnSeq?: number | undefined
  readonly data?: Readonly<Record<string, unknown>>
}

export interface WorkspaceTerminalSnapshot {
  readonly terminals: readonly WorkspaceTerminalRecord[]
  readonly events: readonly WorkspaceTerminalEvent[]
}

export interface WorkspaceTerminalRegisterInput {
  readonly sessionId: string
  readonly source: WorkspaceTerminalSource
  readonly sourceId: string
  readonly cwd: string
  readonly title?: string | undefined
  readonly command?: string | undefined
  readonly cols?: number
  readonly rows?: number
}

export interface WorkspaceTerminalAdapterEvent {
  readonly sessionId: string
  readonly source: WorkspaceTerminalSource
  readonly sourceId: string
  readonly kind: Exclude<WorkspaceTerminalEventKind, 'created' | 'command'>
  readonly cwd?: string | undefined
  readonly data?: Readonly<Record<string, unknown>> | undefined
  readonly turnSeq?: number | undefined
}

type Listener = (snapshot: WorkspaceTerminalSnapshot) => void

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const MAX_EVENTS = 4_000
const MAX_PREVIEW_CHARS = 4_096
const MAX_INPUT_CHARS = 16_384

/** Host-owned identity and lifecycle projection for UI and Agent terminals. */
export class WorkspaceTerminalRegistry {
  private readonly terminals = new Map<string, WorkspaceTerminalRecord>()
  private readonly events: WorkspaceTerminalEvent[] = []
  private readonly pendingAgentCalls = new Map<string, { sessionId: string; tool: string; args: Readonly<Record<string, unknown>>; turnSeq?: number }>()
  private readonly listeners = new Set<Listener>()
  private sequence = 0
  private disposed = false

  constructor(private readonly maxEvents = MAX_EVENTS) {
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new Error('workspace terminal maxEvents must be a positive integer')
  }

  register(input: WorkspaceTerminalRegisterInput, now = new Date()): WorkspaceTerminalRecord {
    this.assertLive()
    assertTerminalInput(input)
    const id = terminalId(input.source, input.sessionId, input.sourceId)
    const previous = this.terminals.get(id)
    const createdAt = previous?.createdAt ?? now.toISOString()
    const record: WorkspaceTerminalRecord = {
      id,
      deepLink: { surface: 'terminal', terminalId: id },
      sessionId: input.sessionId,
      source: input.source,
      sourceId: input.sourceId,
      cwd: input.cwd,
      ...input.title === undefined ? {} : { title: boundText(input.title, MAX_PREVIEW_CHARS) },
      ...input.command === undefined ? {} : { command: boundText(input.command, MAX_INPUT_CHARS) },
      cols: normalizeDimension(input.cols ?? DEFAULT_COLS),
      rows: normalizeDimension(input.rows ?? DEFAULT_ROWS),
      status: previous?.status === 'exited' || previous?.status === 'closed' ? 'starting' : previous?.status ?? 'starting',
      createdAt,
      updatedAt: now.toISOString(),
      ...previous?.exitCode === undefined ? {} : { exitCode: previous.exitCode },
      ...previous?.signal === undefined ? {} : { signal: previous.signal },
      transcriptBytes: previous?.transcriptBytes ?? 0,
      ...previous?.lastOutput === undefined ? {} : { lastOutput: previous.lastOutput },
    }
    this.terminals.set(id, record)
    this.emit({ terminalId: id, sessionId: input.sessionId, source: input.source, kind: previous === undefined ? 'created' : 'attached', status: record.status, ...nowData(now) })
    return record
  }

  attach(id: string, now = new Date(), turnSeq?: number): WorkspaceTerminalRecord {
    const current = this.expect(id)
    return this.update(current, { status: 'running', updatedAt: now.toISOString() }, { kind: 'attached', turnSeq }, now)
  }

  disconnect(id: string, reason = 'socket disconnected', now = new Date()): WorkspaceTerminalRecord {
    const current = this.expect(id)
    if (current.status === 'exited' || current.status === 'closed') return current
    return this.update(current, { status: 'disconnected', updatedAt: now.toISOString() }, { kind: 'disconnected', data: { reason } }, now)
  }

  input(id: string, text: string, now = new Date(), turnSeq?: number): WorkspaceTerminalRecord {
    const current = this.expect(id)
    const bounded = boundText(text, MAX_INPUT_CHARS)
    return this.update(current, { status: current.status === 'disconnected' ? 'running' : current.status, updatedAt: now.toISOString() }, { kind: 'input', turnSeq, data: { text: bounded, chars: text.length } }, now)
  }

  output(id: string, text: string, now = new Date(), turnSeq?: number): WorkspaceTerminalRecord {
    const current = this.expect(id)
    const nextBytes = current.transcriptBytes + Buffer.byteLength(text, 'utf8')
    const preview = boundText(text, MAX_PREVIEW_CHARS)
    return this.update(current, { status: current.status === 'disconnected' ? 'running' : current.status, updatedAt: now.toISOString(), transcriptBytes: nextBytes, lastOutput: preview }, { kind: 'output', turnSeq, data: { bytes: Buffer.byteLength(text, 'utf8'), preview } }, now)
  }

  resize(id: string, cols: number, rows: number, now = new Date(), turnSeq?: number): WorkspaceTerminalRecord {
    const current = this.expect(id)
    const next = { cols: normalizeDimension(cols), rows: normalizeDimension(rows), updatedAt: now.toISOString() }
    return this.update(current, next, { kind: 'resized', turnSeq, data: next }, now)
  }

  exit(id: string, exitCode: number | null = null, signal: string | null = null, now = new Date(), turnSeq?: number): WorkspaceTerminalRecord {
    const current = this.expect(id)
    return this.update(current, { status: 'exited', updatedAt: now.toISOString(), exitCode, signal }, { kind: 'exited', turnSeq, data: { exitCode, signal } }, now)
  }

  close(id: string, reason = 'closed', now = new Date(), turnSeq?: number): WorkspaceTerminalRecord {
    const current = this.expect(id)
    return this.update(current, { status: 'closed', updatedAt: now.toISOString() }, { kind: 'closed', turnSeq, data: { reason } }, now)
  }

  /** Adapter entry point for Better Sidebar or another PTY owner. */
  applyAdapterEvent(event: WorkspaceTerminalAdapterEvent, now = new Date()): WorkspaceTerminalRecord {
    const id = terminalId(event.source, event.sessionId, event.sourceId)
    const current = this.terminals.get(id)
    if (current === undefined) {
      if (event.kind !== 'attached') throw new Error(`terminal registration required before adapter event: ${id}`)
      if (event.cwd === undefined || event.cwd.trim() === '') throw new Error(`terminal adapter event requires cwd before registration: ${id}`)
      this.register({ sessionId: event.sessionId, source: event.source, sourceId: event.sourceId, cwd: event.cwd }, now)
    }
    const resolved = this.expect(id)
    switch (event.kind) {
      case 'attached': return this.attach(resolved.id, now, event.turnSeq)
      case 'disconnected': return this.disconnect(resolved.id, typeof event.data?.reason === 'string' ? event.data.reason : 'socket disconnected', now)
      case 'input': return this.input(resolved.id, typeof event.data?.text === 'string' ? event.data.text : '', now, event.turnSeq)
      case 'output': return this.output(resolved.id, typeof event.data?.text === 'string' ? event.data.text : '', now, event.turnSeq)
      case 'resized': return this.resize(resolved.id, Number(event.data?.cols), Number(event.data?.rows), now, event.turnSeq)
      case 'exited': return this.exit(resolved.id, typeof event.data?.exitCode === 'number' ? event.data.exitCode : null, typeof event.data?.signal === 'string' ? event.data.signal : null, now, event.turnSeq)
      case 'closed': return this.close(resolved.id, typeof event.data?.reason === 'string' ? event.data.reason : 'closed', now, event.turnSeq)
    }
  }

  /** Project durable DSH terminal tool events without trusting renderer state. */
  projectAgentEvent(sessionId: string, event: SessionEvent, now = new Date()): void {
    if (event.type === 'tool/call') {
      if (!isTerminalTool(event.data.name)) return
      const args = parseArguments(event.data.arguments)
      this.pendingAgentCalls.set(`${sessionId}:${String(event.data.callId)}`, { sessionId, tool: event.data.name, args, ...turnOf(event.data) })
      const sourceId = uuidFromArgs(args)
      if (sourceId !== undefined && this.terminals.has(terminalId('agent', sessionId, sourceId))) {
        const id = terminalId('agent', sessionId, sourceId)
        this.recordCommand(id, event.data.name, args, now, turnOf(event.data).turnSeq)
      }
      return
    }
    if (event.type !== 'tool/result') return
    if (event.data.message === undefined || event.data.message.source === undefined) return
    const callId = event.data.message.source.callId
    const pending = this.pendingAgentCalls.get(`${sessionId}:${String(callId)}`)
    if (pending === undefined) return
    this.pendingAgentCalls.delete(`${sessionId}:${String(callId)}`)
    const resultText = resultTextOf(event.data.message.content)
    const uuid = uuidFromArgs(pending.args) ?? uuidFromText(resultText)
    const turnSeq = turnOf(event.data).turnSeq ?? pending.turnSeq
    if (pending.tool === 'terminal_create' || pending.tool === 'terminal_open') {
      if (uuid === undefined) return
      const existing = this.terminals.get(terminalId('agent', sessionId, uuid))
      if (existing === undefined) {
        this.register({ sessionId, source: 'agent', sourceId: uuid, cwd: typeof pending.args.cwd === 'string' ? pending.args.cwd : process.cwd(), title: typeof pending.args.title === 'string' ? pending.args.title : typeof pending.args.name === 'string' ? pending.args.name : undefined, command: typeof pending.args.command === 'string' ? pending.args.command : undefined }, now)
      }
      this.attach(terminalId('agent', sessionId, uuid), now, turnSeq)
      if (resultText !== '') this.output(terminalId('agent', sessionId, uuid), resultText, now, turnSeq)
      return
    }
    if (uuid === undefined) return
    const id = terminalId('agent', sessionId, uuid)
    if (!this.terminals.has(id)) return
    this.recordCommand(id, pending.tool, pending.args, now, turnSeq)
    if (resultText !== '') this.output(id, resultText, now, turnSeq)
    if (pending.tool === 'terminal_close') this.close(id, 'agent requested close', now, turnSeq)
  }

  recordCommand(id: string, command: string, args: Readonly<Record<string, unknown>> = {}, now = new Date(), turnSeq?: number): void {
    const current = this.expect(id)
    this.recordCommandEvent(current, command, args, now, turnSeq)
  }

  terminal(id: string): WorkspaceTerminalRecord | undefined { return this.terminals.get(id) }
  forSession(sessionId: string): readonly WorkspaceTerminalRecord[] { return [...this.terminals.values()].filter(item => item.sessionId === sessionId) }
  snapshot(): WorkspaceTerminalSnapshot { return { terminals: [...this.terminals.values()], events: [...this.events] } }
  subscribe(listener: Listener): () => void { this.assertLive(); this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  disposeSession(sessionId: string, now = new Date()): void {
    for (const item of this.forSession(sessionId)) if (item.status !== 'closed') this.close(item.id, 'session disposed', now)
    for (const key of [...this.pendingAgentCalls.keys()]) if (key.startsWith(`${sessionId}:`)) this.pendingAgentCalls.delete(key)
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.listeners.clear(); this.terminals.clear(); this.events.length = 0; this.pendingAgentCalls.clear() }

  private recordCommandEvent(current: WorkspaceTerminalRecord, command: string, args: Readonly<Record<string, unknown>>, now: Date, turnSeq?: number): void {
    this.update(current, { updatedAt: now.toISOString() }, { kind: 'command', turnSeq, data: { command, args: redactArgs(args) } }, now)
  }
  private update(current: WorkspaceTerminalRecord, changes: Partial<WorkspaceTerminalRecord>, event: Omit<WorkspaceTerminalEvent, 'id' | 'terminalId' | 'sessionId' | 'source' | 'timestamp' | 'status'> & { status?: WorkspaceTerminalStatus }, now: Date): WorkspaceTerminalRecord {
    const next = { ...current, ...changes, updatedAt: now.toISOString() }
    this.terminals.set(current.id, next)
    this.emit({ terminalId: current.id, sessionId: current.sessionId, source: current.source, status: next.status, ...event, ...nowData(now) })
    return next
  }
  private emit(event: Omit<WorkspaceTerminalEvent, 'id'> & { timestamp?: string }): void {
    const recorded: WorkspaceTerminalEvent = { ...event, id: `terminal-event:${++this.sequence}`, timestamp: event.timestamp ?? new Date().toISOString(), status: event.status ?? this.expect(event.terminalId).status }
    this.events.push(recorded)
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents)
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
  private expect(id: string): WorkspaceTerminalRecord { const record = this.terminals.get(id); if (record === undefined) throw new Error(`terminal not found: ${id}`); return record }
  private assertLive(): void { if (this.disposed) throw new Error('workspace terminal registry is disposed') }
}

function terminalId(source: WorkspaceTerminalSource, sessionId: string, sourceId: string): string { return `terminal:${source}:${sessionId}:${sourceId}` }
function assertTerminalInput(input: WorkspaceTerminalRegisterInput): void { if (input.sessionId.trim() === '' || input.sourceId.trim() === '' || input.cwd.trim() === '') throw new Error('terminal registration requires sessionId, sourceId, and cwd') }
function normalizeDimension(value: number): number { if (!Number.isFinite(value)) return DEFAULT_COLS; return Math.min(1024, Math.max(2, Math.floor(value))) }
function boundText(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…` }
function nowData(now: Date): { timestamp: string } { return { timestamp: now.toISOString() } }
function isTerminalTool(name: string): boolean { return name === 'terminal_create' || name === 'terminal_open' || name === 'terminal_send' || name === 'terminal_read' || name === 'terminal_resize' || name === 'terminal_signal' || name === 'terminal_close' || name === 'terminal_wait_for' }
function parseArguments(value: string): Readonly<Record<string, unknown>> { try { const parsed: unknown = JSON.parse(value); return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Readonly<Record<string, unknown>> : {} } catch { return {} } }
function uuidFromArgs(args: Readonly<Record<string, unknown>>): string | undefined { for (const key of ['uuid', 'sessionId']) { if (typeof args[key] === 'string' && args[key] !== '') return args[key] } return undefined }
function uuidFromText(text: string): string | undefined { const json = parseArguments(text); for (const key of ['uuid', 'sessionId']) if (typeof json[key] === 'string') return json[key]; return /(?:uuid|session(?:Id| id))\s*[:=]\s*["']?([A-Za-z0-9_-]+)/iu.exec(text)?.[1] }
function resultTextOf(content: readonly { type?: string; text?: string }[]): string { return content.filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text as string).join('\n') }
function turnOf(data: unknown): { turnSeq?: number } { if (data === null || typeof data !== 'object' || Array.isArray(data)) return {}; const value = (data as { turn?: unknown }).turn; return typeof value === 'number' && Number.isSafeInteger(value) ? { turnSeq: value } : {} }
function redactArgs(args: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, typeof value === 'string' ? boundText(value, MAX_INPUT_CHARS) : value])) }

export { terminalId }
