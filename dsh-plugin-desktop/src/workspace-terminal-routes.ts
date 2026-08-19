import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceTerminalRegistry } from './workspace-terminal.ts'

const TERMINALS_PATH = '/dsh-desktop/api/workspace/terminals'

/** Read-only terminal projection consumed by desktop-owned workbench surfaces. */
export function installWorkspaceTerminalRoutes(ctx: Context, registry: WorkspaceTerminalRegistry): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: TERMINALS_PATH,
    handler: async (req, res) => {
      try {
        if (!sameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
        if (req.method !== 'GET') return writeJson(res, 405, { error: 'method not allowed' })
        const url = new URL(req.url ?? '/', `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`)
        const sessionId = url.searchParams.get('sessionId') ?? ''
        if (sessionId.trim() === '') return writeJson(res, 400, { error: 'sessionId is required' })
        return writeJson(res, 200, {
          sessionId,
          terminals: registry.forSession(sessionId),
        })
      } catch {
        return writeJson(res, 500, { error: 'terminal projection failed' })
      }
    },
  })
}

function sameOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}
