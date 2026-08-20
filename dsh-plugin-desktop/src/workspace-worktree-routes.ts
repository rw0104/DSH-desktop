import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceWorktreeError } from './workspace-worktree.ts'
import type { WorkspaceWorkbenchService } from './workspace-workbench.ts'

const WORKTREES_PATH = '/dsh-desktop/api/workspace/worktrees'
const MAX_BODY_BYTES = 16 * 1024

/** Session checkout/worktree projection; create/remove are Host-owner checked. */
export function installWorkspaceWorktreeRoutes(ctx: Context, workbench: WorkspaceWorkbenchService): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: WORKTREES_PATH,
    handler: async (req, res) => {
      try {
        if (!sameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
        const url = new URL(req.url ?? '/', `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`)
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const binding = workbench.binding(sessionId)
        if (binding === undefined) return writeJson(res, 404, { error: 'session-not-found' })
        if (req.method === 'GET') return writeJson(res, 200, await workbench.worktrees.inspect(binding))
        if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
        if (req.headers['x-dsh-workbench-action'] !== 'worktrees') return writeJson(res, 403, { error: 'action header rejected' })
        const body = await readJson(req)
        if (body.action === 'create') {
          const branch = typeof body.branch === 'string' ? body.branch : ''
          const created = await workbench.worktrees.createManaged({
            sessionId,
            profileName: binding.profileName,
            repositoryRoot: binding.repositoryRoot ?? binding.cwd,
            branch,
          })
          workbench.bindSession(created)
          return writeJson(res, 202, await workbench.worktrees.inspect(created))
        }
        if (body.action === 'remove') {
          await workbench.worktrees.removeManaged(binding)
          workbench.bindSession({
            sessionId,
            profileName: binding.profileName,
            cwd: binding.repositoryRoot ?? binding.cwd,
            ...binding.repositoryRoot === undefined ? {} : { repositoryRoot: binding.repositoryRoot },
          })
          return writeJson(res, 200, await workbench.worktrees.inspect(workbench.binding(sessionId) as typeof binding))
        }
        return writeJson(res, 400, { error: 'unsupported worktree action' })
      } catch (error) {
        const code = error instanceof WorkspaceWorktreeError ? error.code : 'worktree-unavailable'
        return writeJson(res, error instanceof WorkspaceWorktreeError ? 409 : 500, { error: code, message: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) throw new WorkspaceWorktreeError('invalid-binding', 'worktree request is too large')
    text += buffer.toString('utf8')
  }
  const value: unknown = text.trim() === '' ? {} : JSON.parse(text)
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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
