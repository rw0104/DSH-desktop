import { mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { WorkspaceWorkbenchService } from '../src/workspace-workbench.ts'
import { describe, expect, it } from 'vitest'
import { saveWorkspaceUpload, uploadFilename, MAX_UPLOAD_BYTES, installWorkspaceUploadRoute } from '../src/workspace-upload.ts'

describe('workspace document intake', () => {
  it('authenticates the production HTTP boundary and resolves the destination from the session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-upload-http-'))
    const binding = { sessionId: 'allowed', profileName: 'p', cwd: root, createdAt: '', updatedAt: '' }
    let route: WebRoute | undefined
    const server = createServer((req, res) => { void route?.handler(req, res) })
    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const port = (server.address() as { port: number }).port
      const origin = `http://127.0.0.1:${port}`
      const ctx = { webServer: { host: '127.0.0.1', port, register: (value: WebRoute) => { route = value; return () => {} } } } as unknown as Context
      installWorkspaceUploadRoute(ctx, { binding: (id: string) => id === 'allowed' ? binding : undefined } as unknown as WorkspaceWorkbenchService)
      const url = `${origin}/dsh-desktop/api/workspace/upload?sessionId=allowed&name=..%2Fdoc.txt`
      const headers = { origin, 'x-dsh-desktop-action': 'upload-file' }
      expect((await fetch(url, { method: 'POST', body: 'file', headers: { ...headers, origin: 'https://evil.invalid' } })).status).toBe(403)
      expect((await fetch(url, { method: 'POST', body: 'file', headers: { origin } })).status).toBe(403)
      expect((await fetch(url.replace('sessionId=allowed', 'sessionId=unknown'), { method: 'POST', body: 'file', headers })).status).toBe(404)
      expect(await readdir(root)).toEqual([])
      const response = await fetch(url, { method: 'POST', body: 'actual file bytes', headers })
      expect(response.status).toBe(200)
      const file = await response.json() as { path: string }
      expect(file.path).toMatch(/^\.dsh-uploads\/file-[^/]+\/[^/]+$/u)
      expect(await readFile(join(root, file.path), 'utf8')).toBe('actual file bytes')
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) }
  })
  it('preserves arbitrary document bytes and never overwrites duplicate names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-upload-test-'))
    const binding = { sessionId: 's', profileName: 'p', cwd: root, createdAt: '', updatedAt: '' }
    try {
      for (const name of ['说明.txt', 'report.pdf', 'table.xlsx', 'slide.pptx']) {
        const bytes = Buffer.from([0, 1, 2, 255])
        const first = await saveWorkspaceUpload(binding, name, bytes)
        const second = await saveWorkspaceUpload(binding, name, Buffer.from('second'))
        expect(first.path).not.toBe(second.path)
        expect(first.path).toMatch(/^\.dsh-uploads\/file-[^/]+\//u)
        expect(await readFile(join(root, first.path))).toEqual(bytes)
        expect(await readFile(join(root, second.path), 'utf8')).toBe('second')
      }
      await expect(saveWorkspaceUpload(binding, 'large', new Uint8Array(MAX_UPLOAD_BYTES + 1))).rejects.toThrow('25 MiB')
      expect((await readdir(join(root, '.dsh-uploads'))).length).toBe(8)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('refuses a linked upload root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-upload-test-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-upload-outside-'))
    try {
      await symlink(outside, join(root, '.dsh-uploads'), 'junction')
      await expect(saveWorkspaceUpload({ sessionId: 's', profileName: 'p', cwd: root, createdAt: '', updatedAt: '' }, 'file.txt', Buffer.from('x'))).rejects.toThrow('must not be a link')
      expect(await readdir(outside)).toEqual([])
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
  })
  it('neutralizes path components, control characters and Windows reserved names', () => {
    expect(uploadFilename('../../x.txt')).not.toContain('/')
    expect(uploadFilename('CON.txt')).toBe('_CON.txt')
    expect(uploadFilename('换行\n.txt')).toBe('换行_.txt')
    expect(() => uploadFilename('..')).toThrow()
  })
})
