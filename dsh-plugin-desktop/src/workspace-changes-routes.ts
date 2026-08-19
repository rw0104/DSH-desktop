import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceChangesError, type WorkspaceChangesScope, type WorkspaceChangesSnapshot, type WorkspaceHunkAction } from './workspace-changes-service.ts'
import { WorkspaceReviewError, type WorkspaceReviewComment } from './workspace-review-service.ts'
import type { SessionWorkspaceBinding, WorkspaceWorkbenchService } from './workspace-workbench.ts'

const CHANGES_PATH = '/dsh-desktop/api/workspace/changes'
const MAX_REQUEST_BYTES = 64 * 1024
const SCOPES = new Set<WorkspaceChangesScope>(['unstaged', 'staged', 'last-turn'])
const HUNK_ACTIONS = new Set<WorkspaceHunkAction>(['stage', 'unstage', 'revert'])

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
        if (sessionId === '') return writeJson(res, 400, { error: 'sessionId is required' })
        const binding = workbench.binding(sessionId)
        if (binding === undefined) return writeJson(res, 404, { error: 'session-not-found' })
        const scope = parseScope(url.searchParams.get('scope'))
        if (req.method === 'GET') {
          return writeJson(res, 200, await snapshotFor(workbench, binding, scope))
        }
        if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
        if (req.headers['x-dsh-workbench-action'] !== 'changes') return writeJson(res, 403, { error: 'action header rejected' })
        const body = await readJson(req)
        const action = typeof body.action === 'string' ? body.action : ''
        const path = typeof body.path === 'string' && body.path !== '' ? body.path : undefined
        if (action === 'stage' && path !== undefined) await workbench.changes.stage(binding, path)
        else if (action === 'unstage' && path !== undefined) await workbench.changes.unstage(binding, path)
        else if (action === 'revert' && path !== undefined && body.confirmed === true) await workbench.changes.revert(binding, path)
        else if ((action === 'hunk' || action === 'stage-hunk' || action === 'unstage-hunk' || action === 'revert-hunk') && path !== undefined) {
          const hunkAction = parseHunkAction(body, action)
          const hunkId = typeof body.hunkId === 'string' ? body.hunkId : ''
          const hunkScope = parseHunkScope(body.scope)
          if (hunkId === '' || hunkAction === undefined || hunkScope === undefined) return writeJson(res, 400, { error: 'hunk action requires scope, path, hunkId, and action' })
          if (hunkAction === 'revert' && body.confirmed !== true) return writeJson(res, 400, { error: 'revert confirmation is required' })
          await workbench.changes.mutateHunk(binding, { scope: hunkScope, path, hunkId, action: hunkAction })
        } else if (action === 'comment') {
          const comment = parseComment(body)
          if (comment === undefined) return writeJson(res, 400, { error: 'invalid review comment' })
          const hunk = await workbench.changes.findHunk(binding, comment.path, comment.hunkId)
          workbench.submitReviewComment(binding, comment, hunk)
        } else {
          return writeJson(res, 400, { error: 'unsupported changes action' })
        }
        return writeJson(res, 200, await snapshotFor(workbench, binding, scope))
      } catch (error) {
        const code = errorCode(error)
        return writeJson(res, errorStatus(error), { error: code, message: code === 'internal' ? 'Workspace request failed' : error instanceof Error ? error.message : String(error) })
      }
    },
  })
}

async function snapshotFor(workbench: WorkspaceWorkbenchService, binding: SessionWorkspaceBinding, scope: WorkspaceChangesScope): Promise<WorkspaceChangesSnapshot> {
  const lastTurn = workbench.lastTurn(binding.sessionId)
  const snapshot = await workbench.changes.snapshot(binding, {
    scope,
    ...scope === 'last-turn' ? { lastTurnPaths: lastTurn.paths, lastTurnSeq: lastTurn.turnSeq, lastTurnAvailable: lastTurn.available } : {},
  })
  if (snapshot.repositoryRoot !== binding.repositoryRoot || snapshot.branch !== binding.branch) {
    workbench.bindSession({
      sessionId: binding.sessionId,
      profileName: binding.profileName,
      cwd: binding.cwd,
      ...snapshot.repositoryRoot === undefined ? {} : { repositoryRoot: snapshot.repositoryRoot },
      ...binding.worktreePath === undefined ? {} : { worktreePath: binding.worktreePath },
      branch: snapshot.branch,
    })
  }
  return snapshot
}

function parseScope(value: string | null): WorkspaceChangesScope {
  return value !== null && SCOPES.has(value as WorkspaceChangesScope) ? value as WorkspaceChangesScope : 'unstaged'
}

function parseHunkScope(value: unknown): 'unstaged' | 'staged' | undefined {
  return value === 'unstaged' || value === 'staged' ? value : undefined
}

function parseHunkAction(body: Record<string, unknown>, action: string): WorkspaceHunkAction | undefined {
  if (action !== 'hunk') {
    const parsed = action.replace(/-hunk$/u, '')
    return HUNK_ACTIONS.has(parsed as WorkspaceHunkAction) ? parsed as WorkspaceHunkAction : undefined
  }
  return typeof body.hunkAction === 'string' && HUNK_ACTIONS.has(body.hunkAction as WorkspaceHunkAction)
    ? body.hunkAction as WorkspaceHunkAction
    : undefined
}

function parseComment(body: Record<string, unknown>): WorkspaceReviewComment | undefined {
  const repository = body.repository
  const path = body.path
  const side = body.side
  const line = body.line
  const hunkId = body.hunkId
  const comment = body.comment
  if (typeof repository !== 'string' || typeof path !== 'string' || (side !== 'old' && side !== 'new') || typeof line !== 'number' || typeof hunkId !== 'string' || typeof comment !== 'string') return undefined
  return { repository, path, side, line, hunkId, comment }
}

function isSameOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    bytes += buffer.byteLength
    if (bytes > MAX_REQUEST_BYTES) throw new WorkspaceReviewError('invalid-comment', 'Workspace request body is too large')
    text += buffer.toString('utf8')
  }
  if (text.trim() === '') return {}
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new WorkspaceReviewError('invalid-comment', 'Workspace request body is not valid JSON', { cause: error })
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function errorCode(error: unknown): string {
  if (error instanceof WorkspaceChangesError || error instanceof WorkspaceReviewError) return error.code
  return 'internal'
}

function errorStatus(error: unknown): number {
  if (error instanceof WorkspaceReviewError && error.code === 'session-not-found') return 404
  if (error instanceof WorkspaceReviewError || error instanceof WorkspaceChangesError) return 409
  return 500
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}
