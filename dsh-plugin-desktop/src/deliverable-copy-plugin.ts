/** Cordis Host bridge for authorized conversation-deliverable clipboard actions. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {
  SessionHistoryRecord,
} from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from './runtime.ts'
import {
  DESKTOP_DELIVERABLE_COPY_ACTION,
  DESKTOP_DELIVERABLE_COPY_PATH,
  type DesktopDeliverableCopyErrorResponse,
  type DesktopDeliverableCopyRequest,
  type DesktopDeliverableCopyResponse,
} from './deliverable-copy-contract.ts'
import {
  DesktopDeliverableCopyError,
  DesktopDeliverableCopyService,
  type DesktopDeliverableHistoryEntry,
} from './deliverable-copy.ts'

export const name = 'desktop-deliverable-copy'
// WebServer is the only mount-time dependency. The API/session services are
// read at request time so a cold profile can finish composing them in either
// order without making this optional route hold the whole Host graph pending.
export const inject = ['webServer']
const MAX_REQUEST_BYTES = 4096

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: DESKTOP_DELIVERABLE_COPY_PATH,
    handler: async (req, res) => {
      if (!sameOrigin(ctx, req)) return writeError(res, 403, 'invalid-request', 'Origin rejected.')
      if (req.method !== 'POST') return writeError(res, 405, 'invalid-request', 'Method not allowed.')
      if (req.headers['x-dsh-desktop-action'] !== DESKTOP_DELIVERABLE_COPY_ACTION) {
        return writeError(res, 403, 'invalid-request', 'Action rejected.')
      }
      let request: DesktopDeliverableCopyRequest
      try {
        request = parseRequest(await readBody(req))
        await service(ctx).copy(request)
      } catch (cause) {
        if (cause instanceof DesktopDeliverableCopyError) {
          return writeError(res, 400, cause.code, cause.message)
        }
        ctx.logger.warn('dsh-plugin-desktop: deliverable copy failed: %s', cause instanceof Error ? cause.message : String(cause))
        return writeError(res, 500, 'unavailable', 'The produced file could not be copied.')
      }
      return writeJson<DesktopDeliverableCopyResponse>(res, 200, { ok: true })
    },
  }), 'dsh-plugin-desktop: authorized deliverable clipboard route')
}

function service(ctx: Context): DesktopDeliverableCopyService {
  const sessionController = ctx.get('sessionController') as Context['sessionController'] | undefined
  const desktopRuntime = ctx.get('desktopRuntime') as Context['desktopRuntime']
  const sessions = ctx.get('sessions') as Context['sessions']
  const sessionPersistence = ctx.get('sessionPersistence') as Context['sessionPersistence']
  return new DesktopDeliverableCopyService({
    history: async (sessionId, beforeSeq) => {
      if (sessionController === undefined) {
        throw new DesktopDeliverableCopyError('unavailable', 'The produced-file history is unavailable.')
      }
      const id = SessionId(sessionId)
      const inspection = await sessionController.inspect(id)
      const throughSeq = inspection.events.at(-1)?.seq ?? -1
      const page = await sessionController.page({
        address: { kind: 'session', sessionId: id },
        throughSeq,
        maxMessages: 100,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
      }, new AbortController().signal)
      return {
        entries: page.records.flatMap(record),
        hasMore: page.hasMore,
      }
    },
    sessionRoot: async (sessionId) => {
      const id = SessionId(sessionId)
      const live = sessions?.get(id)?.header.cwd
      if (live !== undefined) return live
      return (await sessionPersistence.list()).find(header => header.id === id)?.cwd
    },
    writeClipboard: text => { desktopRuntime.writeClipboardText(text) },
  })
}

function record(value: SessionHistoryRecord): DesktopDeliverableHistoryEntry[] {
  if (value.type !== 'event') return []
  return [{ event: value.event }]
}

function sameOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) {
      throw new DesktopDeliverableCopyError('invalid-request', 'The deliverable copy request is too large.')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseRequest(text: string): DesktopDeliverableCopyRequest {
  let value: unknown
  try { value = JSON.parse(text) } catch {
    throw new DesktopDeliverableCopyError('invalid-request', 'The deliverable copy request is invalid JSON.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DesktopDeliverableCopyError('invalid-request', 'The deliverable copy request is invalid.')
  }
  const request = value as Record<string, unknown>
  if (typeof request.sessionId !== 'string'
    || typeof request.path !== 'string'
    || (request.kind !== 'absolute-path' && request.kind !== 'text-content')
    || Object.keys(request).some(key => !['sessionId', 'path', 'kind'].includes(key))) {
    throw new DesktopDeliverableCopyError('invalid-request', 'The deliverable copy request is invalid.')
  }
  return { sessionId: request.sessionId, path: request.path, kind: request.kind }
}

function writeError(res: ServerResponse, status: number, code: string, message: string): void {
  writeJson<DesktopDeliverableCopyErrorResponse>(res, status, { ok: false, error: { code, message } })
}

function writeJson<T>(res: ServerResponse, status: number, value: T): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

export default apply
