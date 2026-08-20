import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { installWorkspaceWorktreeRoutes } from '../src/workspace-worktree-routes.ts'

describe('workspace worktree route', () => {
  it('uses the Host binding as repository authority for create and remove', async () => {
    const binding = { sessionId: 's1', profileName: 'desktop', cwd: 'C:\\repo', repositoryRoot: 'C:\\repo', createdAt: '', updatedAt: '' }
    const created = { ...binding, cwd: 'C:\\managed\\s1', worktreePath: 'C:\\managed\\s1', branch: 'feature/s1' }
    const worktrees = {
      inspect: vi.fn(async value => ({ ...value, checkoutPath: value.worktreePath ?? value.cwd, commonGitDir: 'C:\\repo\\.git', head: 'head', detached: false, ownership: value.worktreePath === undefined ? 'unmanaged' : 'managed', worktrees: [] })),
      createManaged: vi.fn(async () => created),
      removeManaged: vi.fn(async () => {}),
    }
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const workbench = {
      binding: vi.fn(() => binding),
      bindSession: vi.fn(),
      worktrees,
    } as any
    const context = {
      webServer: { host: '127.0.0.1', port: 43120, register: (route: any) => { routes.set(route.path, route.handler); return () => {} } },
    } as any
    installWorkspaceWorktreeRoutes(context, workbench)
    const handler = routes.get('/dsh-desktop/api/workspace/worktrees')
    if (handler === undefined) throw new Error('route not installed')
    const response = responseRecorder()
    await handler(request({ action: 'create', branch: 'feature/s1', repositoryRoot: 'C:\\forged' }), response)
    expect(response.statusCode).toBe(202)
    expect(worktrees.createManaged).toHaveBeenCalledWith({ sessionId: 's1', profileName: 'desktop', repositoryRoot: 'C:\\repo', branch: 'feature/s1' })
    expect(workbench.bindSession).toHaveBeenCalledWith(created)

    const removed = responseRecorder()
    await handler(request({ action: 'remove' }), removed)
    expect(removed.statusCode).toBe(200)
    expect(worktrees.removeManaged).toHaveBeenCalledWith(binding)
  })
})

function request(body: Record<string, unknown>) {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    url: '/dsh-desktop/api/workspace/worktrees?sessionId=s1',
    headers: { 'x-dsh-workbench-action': 'worktrees' },
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
