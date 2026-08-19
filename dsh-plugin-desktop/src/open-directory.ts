import { lstat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceWorkbenchService } from './workspace-workbench.ts'

const OPEN_DIRECTORY_PATH = '/dsh-desktop/api/open-directory'
const MAX_BODY_BYTES = 16 * 1024

/** Register a Host-validated native directory opener for the Sidebar explorer. */
export function installOpenDirectoryRoute(ctx: Context, workbench: WorkspaceWorkbenchService): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: OPEN_DIRECTORY_PATH,
    handler: async (req, res) => {
      try {
        if (!sameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
        if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
        if (req.headers['x-dsh-workbench-action'] !== 'open-directory') return writeJson(res, 403, { error: 'action header rejected' })
        const body = await readJson(req)
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
        const requested = typeof body.path === 'string' ? body.path : ''
        const binding = workbench.binding(sessionId)
        if (binding === undefined) return writeJson(res, 404, { error: 'session-not-found' })
        const root = resolve(binding.worktreePath ?? binding.cwd)
        const target = resolve(root, requested)
        if (!isWithin(root, target)) return writeJson(res, 403, { error: 'path-outside-session' })
        const info = await lstat(target)
        if (!info.isDirectory() || info.isSymbolicLink()) return writeJson(res, 400, { error: 'directory-required' })
        if (ctx.desktopRuntime.openDirectory === undefined) return writeJson(res, 501, { error: 'native-directory-opener-unavailable' })
        await ctx.desktopRuntime.openDirectory(target)
        return writeJson(res, 200, { ok: true, path: target })
      } catch (error) {
        return writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}

function isWithin(root: string, target: string): boolean {
  const child = relative(root, target)
  return child === '' || child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
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
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

export { OPEN_DIRECTORY_PATH }
