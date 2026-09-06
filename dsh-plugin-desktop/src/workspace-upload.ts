import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join, relative, isAbsolute, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SessionWorkspaceBinding, WorkspaceWorkbenchService } from './workspace-workbench.ts'

export const WORKSPACE_UPLOAD_PATH = '/dsh-desktop/api/workspace/upload'
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const MAX_UPLOAD_FILES = 10

export function uploadFilename(name: string): string {
  const cleaned = name.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, '_').replace(/[. ]+$/u, '').slice(0, 160)
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Invalid filename')
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(cleaned) ? `_${cleaned}` : cleaned
}

export interface UploadedWorkspaceFile { name: string; path: string; bytes: number }

/** Store bytes in a newly allocated directory; existing files are never overwritten. */
export async function saveWorkspaceUpload(binding: SessionWorkspaceBinding, name: string, bytes: Uint8Array): Promise<UploadedWorkspaceFile> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error('File exceeds 25 MiB')
  const filename = uploadFilename(name)
  const cwd = await realpath(binding.worktreePath ?? binding.cwd)
  const directory = join(cwd, '.dsh-uploads')
  await mkdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error })
  const info = await lstat(directory)
  const resolved = await realpath(directory)
  const child = relative(cwd, resolved)
  if (!info.isDirectory() || info.isSymbolicLink() || isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) {
    throw new Error('Upload directory must be inside the workspace and must not be a link')
  }
  const targetDirectory = await mkdtemp(join(directory, 'file-'))
  const target = join(targetDirectory, filename)
  try {
    await writeFile(target, bytes, { flag: 'wx' })
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true })
    throw error
  }
  return { name: filename, path: relative(cwd, target).split(sep).join('/'), bytes: bytes.byteLength }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += part.length
    if (size > MAX_UPLOAD_BYTES) throw new Error('File exceeds 25 MiB')
    parts.push(part)
  }
  return Buffer.concat(parts)
}

/** The session binding, never a client-supplied target path, chooses the destination. */
export function installWorkspaceUploadRoute(ctx: Context, workbench: WorkspaceWorkbenchService): () => void {
  const origin = `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
  return ctx.webServer.register({ kind: 'exact', path: WORKSPACE_UPLOAD_PATH, handler: async (req, res) => {
    if (req.headers.origin !== origin || req.headers.host !== new URL(origin).host
      || req.headers['x-dsh-desktop-action'] !== 'upload-file') return json(res, 403, { error: 'Upload origin rejected' })
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
    const url = new URL(req.url ?? '/', origin)
    const binding = workbench.binding(url.searchParams.get('sessionId') ?? '')
    if (binding === undefined) return json(res, 404, { error: 'Session workspace unavailable' })
    if (Number(req.headers['content-length']) > MAX_UPLOAD_BYTES) return json(res, 413, { error: 'File exceeds 25 MiB' })
    req.setTimeout(30_000, () => { req.destroy(new Error('Upload timed out')) })
    try {
      const bytes = await readBytes(req)
      // A disposed or rebound session may not write into a stale workspace.
      if (workbench.binding(binding.sessionId) !== binding) return json(res, 409, { error: 'Session workspace changed; retry upload' })
      const file = await saveWorkspaceUpload(binding, url.searchParams.get('name') ?? '', bytes)
      json(res, 200, file)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      json(res, message === 'File exceeds 25 MiB' ? 413 : 400, { error: message })
    } finally { req.setTimeout(0) }
  } })
}
