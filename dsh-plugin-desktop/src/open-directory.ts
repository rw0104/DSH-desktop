import { lstat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceWorkbenchService } from './workspace-workbench.ts'

export const OPEN_DIRECTORY_PATH = '/dsh-desktop/api/open-directory'
const MAX_BODY_BYTES = 16 * 1024

/** Open a real directory only when it belongs to the authoritative Session checkout. */
export function installOpenDirectoryRoute(ctx: Context, workbench: WorkspaceWorkbenchService): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: OPEN_DIRECTORY_PATH,
    handler: async (req, res) => {
      try {
        if (!sameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
        if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
        if (req.headers['x-dsh-workbench-action'] !== 'open-directory') {
          return writeJson(res, 403, { error: 'action header rejected' })
        }
        const body = await readJson(req)
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        const requested = typeof body.path === 'string' ? body.path : ''
        if (requested.trim() === '') return writeJson(res, 400, { error: 'path-required' })
        const requestedAbsolute = sessionId === '' && !isAbsolute(requested)
          ? undefined
          : resolve(requested)
        const binding = sessionId === ''
          ? requestedAbsolute === undefined ? undefined : bindingForPath(workbench, requestedAbsolute)
          : workbench.binding(sessionId)
        if (binding === undefined) return writeJson(res, 404, { error: sessionId === '' ? 'workspace-not-found' : 'session-not-found' })
        const root = resolve(binding.worktreePath ?? binding.cwd)
        const target = requestedAbsolute ?? resolve(root, requested)
        if (!isWithin(root, target)) return writeJson(res, 403, { error: 'path-outside-session' })
        const info = await lstat(target)
        if (!info.isDirectory() || info.isSymbolicLink()) {
          return writeJson(res, 400, { error: 'directory-required' })
        }
        if (ctx.desktopRuntime.openDirectory === undefined) {
          return writeJson(res, 501, { error: 'native-directory-opener-unavailable' })
        }
        await ctx.desktopRuntime.openDirectory(target)
        return writeJson(res, 200, { ok: true, path: target })
      } catch (cause) {
        return writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) })
      }
    },
  })
}

function isWithin(root: string, target: string): boolean {
  const child = relative(root, target)
  return child === '' || child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

/** Resolve a workspace-row absolute path without trusting a renderer-supplied session id. */
function bindingForPath(workbench: WorkspaceWorkbenchService, target: string) {
  return workbench.snapshot().bindings
    .filter(binding => isWithin(resolve(binding.worktreePath ?? binding.cwd), target))
    .sort((left, right) => {
      const leftRoot = resolve(left.worktreePath ?? left.cwd)
      const rightRoot = resolve(right.worktreePath ?? right.cwd)
      return rightRoot.length - leftRoot.length
    })[0]
}

function sameOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) throw new Error('directory-request-too-large')
    text += buffer.toString('utf8')
  }
  const value: unknown = text.trim() === '' ? {} : JSON.parse(text)
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}
