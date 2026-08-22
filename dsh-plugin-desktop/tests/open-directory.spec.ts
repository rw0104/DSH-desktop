import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { installOpenDirectoryRoute } from '../src/open-directory.ts'
import { WorkspaceWorkbenchService } from '../src/workspace-workbench.ts'

describe('native directory opener route', () => {
  it('opens only real directories inside the bound Session checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-open-directory-'))
    const child = join(root, 'child')
    await mkdir(child)
    const workbench = new WorkspaceWorkbenchService()
    workbench.bindSession({ sessionId: 's1', profileName: 'desktop', cwd: root })
    const openDirectory = vi.fn(async (_path: string) => {})
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const context = {
      webServer: { host: '127.0.0.1', port: 43120, register: (route: any) => { routes.set(route.path, route.handler); return () => {} } },
      desktopRuntime: { openDirectory },
    } as any
    installOpenDirectoryRoute(context, workbench)
    const handler = routes.get('/dsh-desktop/api/open-directory')
    if (handler === undefined) throw new Error('route not installed')
    try {
      const response = responseRecorder()
      await handler(request({ sessionId: 's1', path: child }), response)
      expect(response.statusCode).toBe(200)
      expect(openDirectory).toHaveBeenCalledWith(child)

      const rejected = responseRecorder()
      await handler(request({ sessionId: 's1', path: join(root, '..') }), rejected)
      expect(rejected.statusCode).toBe(403)
      expect(openDirectory).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resolves an absolute Workspace row path without routing through host.openPath', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-open-workspace-directory-'))
    const workbench = new WorkspaceWorkbenchService()
    workbench.bindSession({ sessionId: 's-workspace', profileName: 'desktop', cwd: root })
    const openDirectory = vi.fn(async (_path: string) => {})
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const context = {
      webServer: { host: '127.0.0.1', port: 43120, register: (route: any) => { routes.set(route.path, route.handler); return () => {} } },
      desktopRuntime: { openDirectory },
    } as any
    installOpenDirectoryRoute(context, workbench)
    const handler = routes.get('/dsh-desktop/api/open-directory')
    if (handler === undefined) throw new Error('route not installed')
    try {
      const response = responseRecorder()
      await handler(request({ path: root }), response)
      expect(response.statusCode).toBe(200)
      expect(openDirectory).toHaveBeenCalledWith(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function request(body: Record<string, unknown>) {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    url: '/dsh-desktop/api/open-directory',
    headers: { 'x-dsh-workbench-action': 'open-directory' },
  })
}

function responseRecorder() {
  let body = ''
  return {
    statusCode: 0,
    setHeader: vi.fn(),
    end: (value: string) => { body = value },
    json: () => JSON.parse(body) as unknown,
  }
}
