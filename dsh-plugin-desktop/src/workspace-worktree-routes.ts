import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceWorkbenchService } from './workspace-workbench.ts'

const WORKTREES_PATH = '/dsh-desktop/api/workspace/worktrees'

/** Read-only Session checkout/worktree projection. Mutations land in W3.2. */
export function installWorkspaceWorktreeRoutes(ctx: Context, workbench: WorkspaceWorkbenchService): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: WORKTREES_PATH,
    handler: async (req, res) => {
      try {
        if (!sameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
        if (req.method !== 'GET') return writeJson(res, 405, { error: 'method not allowed' })
        const url = new URL(req.url ?? '/', `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`)
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const binding = workbench.binding(sessionId)
        if (binding === undefined) return writeJson(res, 404, { error: 'session-not-found' })
        const checkout = await workbench.worktrees.inspect(binding)
        return writeJson(res, 200, checkout)
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code) : 'worktree-unavailable'
        return writeJson(res, 500, { error: code })
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

export { WORKTREES_PATH }
