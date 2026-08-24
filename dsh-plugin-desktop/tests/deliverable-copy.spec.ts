import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DesktopDeliverableCopyError,
  DesktopDeliverableCopyService,
  MAX_DELIVERABLE_TEXT_BYTES,
  type DesktopDeliverableHistoryEntry,
} from '../src/deliverable-copy.ts'

const roots: string[] = []

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'dsh-deliverable-copy-'))
  roots.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function produced(path: string): DesktopDeliverableHistoryEntry[] {
  return [{
    event: { type: 'tool/call', seq: 1, data: { callId: 'call-1' } },
    view: { for: 'call', view: { card: 'diff', locations: [{ path }] } },
  }, {
    event: {
      type: 'tool/result',
      seq: 2,
      data: { message: { source: { callId: 'call-1' }, content: [{ isError: false }] } },
    },
  }]
}

function service(workspace: string, entries: DesktopDeliverableHistoryEntry[], copied: string[]) {
  return new DesktopDeliverableCopyService({
    history: async () => ({ entries, hasMore: false }),
    sessionRoot: async () => workspace,
    writeClipboard: text => { copied.push(text) },
  })
}

async function failure(promise: Promise<void>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof DesktopDeliverableCopyError && error.code === code,
  )
}

describe('conversation deliverable copy service', () => {
  it('copies the Host-resolved absolute path only after history proves the deliverable', async () => {
    const workspace = await root()
    await mkdir(join(workspace, 'out'))
    await writeFile(join(workspace, 'out', 'report.txt'), 'report')
    const copied: string[] = []

    await service(workspace, produced('out/report.txt'), copied).copy({
      sessionId: 'session-1',
      path: 'out/report.txt',
      kind: 'absolute-path',
    })

    expect(copied).toEqual([resolve(workspace, 'out/report.txt')])
  })

  it('copies bounded UTF-8 text including the exact one MiB boundary', async () => {
    const workspace = await root()
    const content = 'x'.repeat(MAX_DELIVERABLE_TEXT_BYTES)
    await writeFile(join(workspace, 'report.txt'), content)
    const copied: string[] = []

    await service(workspace, produced('report.txt'), copied).copy({
      sessionId: 'session-1',
      path: 'report.txt',
      kind: 'text-content',
    })

    expect(copied).toEqual([content])
  })

  it('rejects an unproduced path and a produced traversal outside the workspace', async () => {
    const workspace = await root()
    const outside = await root()
    await writeFile(join(workspace, 'inside.txt'), 'inside')
    await writeFile(join(outside, 'secret.txt'), 'secret')

    await failure(service(workspace, produced('inside.txt'), []).copy({
      sessionId: 'session-1', path: 'other.txt', kind: 'absolute-path',
    }), 'not-produced')
    await failure(service(workspace, produced('../secret.txt'), []).copy({
      sessionId: 'session-1', path: '../secret.txt', kind: 'text-content',
    }), 'outside-workspace')
  })

  it('rejects oversized, NUL-containing, and invalid UTF-8 content', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'large.txt'), Buffer.alloc(MAX_DELIVERABLE_TEXT_BYTES + 1, 0x61))
    await writeFile(join(workspace, 'nul.txt'), Buffer.from('a\0b'))
    await writeFile(join(workspace, 'invalid.txt'), Buffer.from([0xff, 0xfe]))

    for (const [path, code] of [
      ['large.txt', 'too-large'],
      ['nul.txt', 'binary'],
      ['invalid.txt', 'binary'],
    ] as const) {
      await failure(service(workspace, produced(path), []).copy({
        sessionId: 'session-1', path, kind: 'text-content',
      }), code)
    }
  })

  it('rejects linked deliverable components even when they resolve inside the workspace', async () => {
    const workspace = await root()
    await mkdir(join(workspace, 'real'))
    await writeFile(join(workspace, 'real', 'report.txt'), 'report')
    try {
      await symlink(join(workspace, 'real'), join(workspace, 'linked'), 'junction')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return
      throw error
    }

    await failure(service(workspace, produced('linked/report.txt'), []).copy({
      sessionId: 'session-1', path: 'linked/report.txt', kind: 'text-content',
    }), 'linked-path')
  })
})
