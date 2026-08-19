import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceWorkbenchService } from './workspace-workbench.ts'

const CHANGES_PATH = '/dsh-desktop/api/workspace/changes'

/** Register the session-scoped Changes API consumed by the desktop Workbench tab. */
export function installWorkspaceChangesRoutes(ctx: Context, workbench: WorkspaceWorkbenchService): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: CHANGES_PATH,
    handler: async (req, res) => {
      try {
        if (!isSameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
        const url = new URL(req.url ?? '/', `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`)
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const cwd = url.searchParams.get('cwd') ?? ''
        if (sessionId === '' || cwd === '') return writeJson(res, 400, { error: 'sessionId and cwd are required' })
        const binding = workbench.bindSession({ sessionId, profileName: 'desktop', cwd })
        if (req.method === 'GET') return writeJson(res, 200, await workbench.changes.snapshot(binding))
        if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
        const body = await readJson(req)
        const action = body.action
        const path = typeof body.path === 'string' && body.path !== '' ? body.path : undefined
        if (action === 'stage') await workbench.changes.stage(binding, path)
        else if (action === 'unstage') await workbench.changes.unstage(binding, path)
        else if (action === 'revert' && path !== undefined) await workbench.changes.revert(binding, path)
        else return writeJson(res, 400, { error: 'unsupported changes action' })
        return writeJson(res, 200, await workbench.changes.snapshot(binding))
      } catch (error) {
        return writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}

function isSameOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  for await (const chunk of req) text += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
  if (text.trim() === '') return {}
  const value: unknown = JSON.parse(text)
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}
