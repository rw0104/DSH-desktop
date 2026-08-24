/** Host-authorized clipboard operations for conversation deliverables. */

import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  DesktopDeliverableCopyRequest,
} from './deliverable-copy-contract.ts'

export const MAX_DELIVERABLE_TEXT_BYTES = 1024 * 1024
const MAX_HISTORY_PAGES = 128

export type DesktopDeliverableCopyErrorCode =
  | 'invalid-request'
  | 'not-produced'
  | 'outside-workspace'
  | 'not-file'
  | 'linked-path'
  | 'too-large'
  | 'binary'
  | 'changed'
  | 'unavailable'

export class DesktopDeliverableCopyError extends Error {
  constructor(readonly code: DesktopDeliverableCopyErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DesktopDeliverableCopyError'
  }
}

interface HistoryEvent {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}

export interface DesktopDeliverableHistoryEntry {
  readonly event: HistoryEvent
  readonly view?: unknown
}

export interface DesktopDeliverableHistoryPage {
  readonly entries: readonly DesktopDeliverableHistoryEntry[]
  readonly hasMore: boolean
}

export interface DesktopDeliverableCopyDependencies {
  history(sessionId: string, beforeSeq?: number): Promise<DesktopDeliverableHistoryPage>
  sessionRoot(sessionId: string): Promise<string | undefined>
  writeClipboard(text: string): void
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function callId(entry: DesktopDeliverableHistoryEntry): string | undefined {
  const data = record(entry.event.data)
  const value = data?.callId
  return typeof value === 'string' ? value : undefined
}

function resultCallId(entry: DesktopDeliverableHistoryEntry): string | undefined {
  const data = record(entry.event.data)
  const message = record(data?.message)
  const source = record(message?.source)
  const value = source?.callId
  return typeof value === 'string' ? value : undefined
}

function resultSucceeded(entry: DesktopDeliverableHistoryEntry): boolean {
  const data = record(entry.event.data)
  const message = record(data?.message)
  const content = Array.isArray(message?.content) ? message.content : []
  return record(content[0])?.isError !== true
}

function callView(entry: DesktopDeliverableHistoryEntry): Record<string, unknown> | undefined {
  const envelope = record(entry.view)
  return envelope?.for === 'call' ? record(envelope.view) : undefined
}

function producedPaths(view: Record<string, unknown> | undefined): readonly string[] {
  if (view === undefined) return []
  if (view.card !== 'diff' && !(view.card === 'generic' && view.kind === 'edit')) return []
  const locations = Array.isArray(view.locations) ? view.locations : []
  return locations.flatMap((location) => {
    const path = record(location)?.path
    return typeof path === 'string' ? [path] : []
  })
}

function contains(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

function sameFile(left: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['stat']>>, right: typeof left): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
}

export class DesktopDeliverableCopyService {
  constructor(private readonly dependencies: DesktopDeliverableCopyDependencies) {}

  async copy(request: DesktopDeliverableCopyRequest): Promise<void> {
    this.validateRequest(request)
    if (!await this.wasProduced(request.sessionId, request.path)) {
      throw new DesktopDeliverableCopyError('not-produced', 'This path is not a produced file in the selected session.')
    }
    const root = await this.dependencies.sessionRoot(request.sessionId)
    if (root === undefined) {
      throw new DesktopDeliverableCopyError('unavailable', 'The selected session has no readable workspace.')
    }
    const path = await this.authorizePath(root, request.path)
    const text = request.kind === 'absolute-path' ? path : await this.readText(path)
    this.dependencies.writeClipboard(text)
  }

  private validateRequest(request: DesktopDeliverableCopyRequest): void {
    if (request.sessionId.length === 0
      || request.path.length === 0
      || /[\0\r\n]/u.test(request.sessionId)
      || /[\0\r\n]/u.test(request.path)
      || (request.kind !== 'absolute-path' && request.kind !== 'text-content')) {
      throw new DesktopDeliverableCopyError('invalid-request', 'The deliverable copy request is invalid.')
    }
  }

  private async wasProduced(sessionId: string, path: string): Promise<boolean> {
    let beforeSeq: number | undefined
    const calls = new Map<string, Record<string, unknown> | undefined>()
    const successfulResults = new Set<string>()
    for (let pageIndex = 0; pageIndex < MAX_HISTORY_PAGES; pageIndex += 1) {
      const page = await this.dependencies.history(sessionId, beforeSeq)
      for (const entry of page.entries) {
        if (entry.event.type === 'tool/call') {
          const id = callId(entry)
          if (id !== undefined) {
            const view = callView(entry)
            calls.set(id, view)
            if (successfulResults.has(id) && producedPaths(view).includes(path)) return true
          }
          continue
        }
        if (entry.event.type !== 'tool/result' || !resultSucceeded(entry)) continue
        const id = resultCallId(entry)
        if (id !== undefined) {
          successfulResults.add(id)
          if (producedPaths(calls.get(id)).includes(path)) return true
        }
      }
      if (!page.hasMore) return false
      const firstSeq = page.entries.reduce((lowest, entry) => Math.min(lowest, entry.event.seq), Number.POSITIVE_INFINITY)
      if (!Number.isSafeInteger(firstSeq) || firstSeq <= 0) break
      beforeSeq = firstSeq
    }
    throw new DesktopDeliverableCopyError('unavailable', 'The produced-file history could not be verified.')
  }

  private async authorizePath(workspace: string, requested: string): Promise<string> {
    let root: string
    try {
      root = await realpath(workspace)
    } catch (cause) {
      throw new DesktopDeliverableCopyError('unavailable', 'The selected session workspace is unavailable.', { cause })
    }
    const candidate = resolve(root, requested)
    if (!contains(root, candidate)) {
      throw new DesktopDeliverableCopyError('outside-workspace', 'The produced file is outside the session workspace.')
    }
    const pathFromRoot = relative(root, candidate)
    let cursor = root
    try {
      for (const segment of pathFromRoot.split(sep).filter(Boolean)) {
        cursor = resolve(cursor, segment)
        if ((await lstat(cursor)).isSymbolicLink()) {
          throw new DesktopDeliverableCopyError('linked-path', 'Linked produced-file paths cannot be copied.')
        }
      }
      const canonical = await realpath(candidate)
      if (!contains(root, canonical)) {
        throw new DesktopDeliverableCopyError('outside-workspace', 'The produced file resolves outside the session workspace.')
      }
      const info = await lstat(canonical)
      if (!info.isFile() || info.isSymbolicLink()) {
        throw new DesktopDeliverableCopyError('not-file', 'The produced path is not a regular file.')
      }
      return canonical
    } catch (cause) {
      if (cause instanceof DesktopDeliverableCopyError) throw cause
      throw new DesktopDeliverableCopyError('unavailable', 'The produced file is unavailable.', { cause })
    }
  }

  private async readText(path: string): Promise<string> {
    const handle = await open(path, 'r')
    try {
      const before = await handle.stat()
      if (!before.isFile()) throw new DesktopDeliverableCopyError('not-file', 'The produced path is not a regular file.')
      if (before.size > MAX_DELIVERABLE_TEXT_BYTES) {
        throw new DesktopDeliverableCopyError('too-large', 'The produced text file exceeds the clipboard limit.')
      }
      const buffer = Buffer.alloc(MAX_DELIVERABLE_TEXT_BYTES + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
      if (bytesRead > MAX_DELIVERABLE_TEXT_BYTES) {
        throw new DesktopDeliverableCopyError('too-large', 'The produced text file exceeds the clipboard limit.')
      }
      const after = await handle.stat()
      if (!sameFile(before, after)) {
        throw new DesktopDeliverableCopyError('changed', 'The produced file changed while it was being copied.')
      }
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead))
      } catch (cause) {
        throw new DesktopDeliverableCopyError('binary', 'The produced file is not UTF-8 text.', { cause })
      }
      if (text.includes('\0')) {
        throw new DesktopDeliverableCopyError('binary', 'The produced file contains binary data.')
      }
      return text
    } finally {
      await handle.close()
    }
  }
}
