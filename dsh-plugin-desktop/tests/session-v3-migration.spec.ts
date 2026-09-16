import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { constants, zstdCompressSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { sidechatRuntime } from './fixtures/sidechat-runtime.ts'
import closedTurn from './fixtures/session-v0-closed.json' with { type: 'json' }

const { buildSidechatApi } = await vi.importActual<{
  buildSidechatApi(ctx: unknown): Record<string, (input: Record<string, unknown>) => Promise<unknown>>
}>('dsh-better-sidebar/src/sidechat-routes.ts')
const compressed = (text: string) => zstdCompressSync(Buffer.from(text), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })

const runtimes: Awaited<ReturnType<typeof sidechatRuntime>>[] = []
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose() })
async function fixture(compression: 'none' | 'zstd', events: unknown[] = closedTurn, extra: Record<string, unknown> = {}, tail = '') {
  const runtime = await sidechatRuntime(compression); runtimes.push(runtime)
  const id = SessionId('legacy-fixture')
  const dir = join(runtime.root, '_no-cwd', id)
  await mkdir(dir, { recursive: true })
  const header = JSON.stringify({ type: 'session', version: 0, id, createdAt: 1000, delegationDepth: 0, ...extra }) + '\n'
  const body = events.map(event => JSON.stringify(event) + '\n').join('')
  const suffix = compression === 'zstd' ? '.zstd' : ''
  const path = join(dir, `session.jsonl${suffix}`)
  // Released v0 writes the header as its own Zstd frame before event batches.
  const bytes = compression === 'zstd'
    ? Buffer.concat([compressed(header), ...(body ? [compressed(body)] : []), ...(tail ? [compressed(tail).subarray(0, 6)] : [])])
    : Buffer.from(header + body + tail)
  await writeFile(path, bytes)
  return { ...runtime, id, dir, path, bytes, current: join(dir, `session.v3.jsonl${suffix}`) }
}

describe.each(['none', 'zstd'] as const)('real Session v0→v3 migration (%s)', compression => {
  it('keeps raw AgentRegistry forks and nested forks isolated and invalidates the old Inbox cache', async () => {
    const f = await sidechatRuntime(compression); runtimes.push(f)
    const { agent: parent } = await f.ctx.agents.create({ sessionId: SessionId('raw-parent') })
    const pending = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'parent pending' }] })
    parent.inbox.append('next-turn', pending)
    parent.inbox.append('next-step', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'parent steering' }] }))
    const seed = parent.session.snapshotEvents()
    const first = await f.ctx.agents.create({ sessionId: SessionId('raw-child'), seed, inheritedEventCount: SessionLogOffset(seed.length), meta: { isSeeded: true, parentSession: parent.id } })
    expect([first.agent.inbox.nextTurn.length, first.agent.inbox.nextStep.length]).toEqual([0, 0])
    const checkpoint = f.ctx.sessionProjections.checkpoint(first.agent.session)
    expect(checkpoint.inbox?.ver).toBe(2)
    const restored = f.ctx.sessionProjections.restore({ inbox: {
      ver: 1, seq: SessionSeq(first.agent.session.snapshotEvents().length - 1),
      val: { 'next-turn': [pending], 'next-step': [] },
    } }, first.agent.session.snapshotEvents(), SessionLogOffset(0), first.agent.session.header, first.agent.session.inheritedEventCount)
    expect(restored.snapshot.values.inbox).toEqual({ 'next-turn': [], 'next-step': [] })
    first.agent.inbox.append('next-turn', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'child pending' }] }))
    const nestedSeed = first.agent.session.snapshotEvents()
    const nested = await f.ctx.agents.create({ sessionId: SessionId('raw-nested'), seed: nestedSeed, inheritedEventCount: SessionLogOffset(nestedSeed.length), meta: { isSeeded: true, parentSession: first.agent.id } })
    expect([nested.agent.inbox.nextTurn.length, nested.agent.inbox.nextStep.length]).toEqual([0, 0])
    expect(first.agent.inbox.nextTurn).toHaveLength(1)
    expect(parent.inbox.nextTurn).toHaveLength(1)
    expect(parent.inbox.nextStep).toHaveLength(1)
    await nested.dispose(); await first.dispose()
  })

  it('migrates a legacy seeded child without replaying the parent queue, but retains its own queued input', async () => {
    const message = (id: string, text: string) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
    const events = [
      { type: 'agent/inbox/spliced', seq: 0, time: 1, data: { target: 'next-turn', start: 0, inserted: [message('parent-pending', 'parent only input')] } },
      { type: 'session/end-seed', seq: 1, time: 2, data: {} },
      { type: 'agent/inbox/spliced', seq: 2, time: 3, data: { target: 'next-turn', start: 0, inserted: [message('child-pending', 'child owned input')] } },
    ]
    const f = await fixture(compression, events, { seedLength: 1, parentSession: 'old-parent', origin: 'subagent', delegationDepth: 1 })
    const inspected = await f.ctx.sessionPersistence.open(f.id, 'read')
    try {
      const migrated = (await inspected.read()).events
      expect(inspected.inheritedEventCount).toBe(1)
      expect(migrated[1]).toMatchObject({ type: 'session/end-seed', data: { inherited: true } })
      expect(migrated.filter(event => event.type === 'agent/inbox/spliced')).toHaveLength(2)
    } finally { await inspected.close() }
    const api = buildSidechatApi(f.ctx)
    await api['sidechat.prompt']!({ childId: f.id, text: 'resume child' })
    await f.ctx.agents.get(f.id)!.whenIdle()
    const requests = JSON.stringify(f.calls)
    expect(requests).toContain('child owned input')
    expect(requests).toContain('resume child')
    expect(requests).not.toContain('parent only input')
    expect(await readFile(f.path)).toEqual(f.bytes)
    await api['sidechat.dispose']!({ childId: f.id })
  })

  it.each([false, true])('preserves source bytes and publishes a new generation only for write: empty=%s', async empty => {
    const f = await fixture(compression, empty ? [] : closedTurn)
    const read = await f.ctx.sessionPersistence.open(f.id, 'read')
    const result = await read.read()
    expect(read.header.version).toBe(3)
    if (!empty) {
      const contents = JSON.stringify(result.events)
      expect(contents).toContain('preserve legacy request')
      expect(contents).toContain('preserve legacy response')
    }
    await read.close()
    expect(await readFile(f.path)).toEqual(f.bytes)
    expect(await readdir(f.dir)).not.toContain(`session.v3.jsonl${compression === 'zstd' ? '.zstd' : ''}`)
    const writer = await f.ctx.sessionPersistence.open(f.id, 'write')
    await writer.flush(); await writer.close()
    expect((await readFile(f.current)).length).toBeGreaterThan(0)
    expect(await readFile(f.path)).toEqual(f.bytes)
    expect((await f.ctx.sessionPersistence.list()).find(row => row.header.id === f.id)?.header.version).toBe(3)
    const reopened = await f.ctx.sessionPersistence.open(f.id, 'read')
    try { expect((await reopened.read()).events).toEqual(result.events) } finally { await reopened.close() }
  })

  it('preserves a torn source tail while publishing only the complete event prefix', async () => {
    const f = await fixture(compression, closedTurn, {}, '{"type":"unfinished')
    const writer = await f.ctx.sessionPersistence.open(f.id, 'write')
    try { expect(JSON.stringify((await writer.read()).events)).not.toContain('unfinished') } finally { await writer.close() }
    expect(await readFile(f.path)).toEqual(f.bytes)
  })

  it('rejects unknown events without replacing the source or creating a successor', async () => {
    const f = await fixture(compression, [{ type: 'future/unknown', seq: 0, time: 1, data: {} }])
    await expect(f.ctx.sessionPersistence.open(f.id, 'write')).rejects.toThrow()
    expect(await readFile(f.path)).toEqual(f.bytes)
    expect((await readdir(f.dir)).filter(name => name.includes('.v3.'))).toEqual([])
    expect((await readdir(f.dir)).filter(name => name.includes('.migration.'))).toEqual([])
  })

  it('rejects a corrupt committed sequence without changing historical bytes', async () => {
    const f = await fixture(compression, closedTurn.map((event, index) => index === 2 ? { ...event, seq: 42 } : event))
    await expect(f.ctx.sessionPersistence.open(f.id, 'write')).rejects.toThrow()
    expect(await readFile(f.path)).toEqual(f.bytes)
    expect((await readdir(f.dir)).filter(name => name.includes('.v3.') || name.includes('.migration.'))).toEqual([])
  })

  it('refuses cancellation before claiming the legacy writer and permits a later retry', async () => {
    const f = await fixture(compression)
    const reason = new Error('fixture canceled migration')
    await expect(f.ctx.sessionPersistence.open(f.id, 'write', { signal: AbortSignal.abort(reason) })).rejects.toThrow()
    expect(await readFile(f.path)).toEqual(f.bytes)
    const retry = await f.ctx.sessionPersistence.open(f.id, 'write'); await retry.close()
    expect((await readFile(f.current)).length).toBeGreaterThan(0)
  })

  it('allows readers but only one writer, closes idempotently and rejects writes through read handles', async () => {
    const f = await fixture(compression)
    const writer = await f.ctx.sessionPersistence.open(f.id, 'write')
    await expect(f.ctx.sessionPersistence.open(f.id, 'write')).rejects.toMatchObject({ name: 'SessionAlreadyOwnedError' })
    const read = await f.ctx.sessionPersistence.open(f.id, 'read')
    try {
      expect((await read.read()).events.length).toBeGreaterThan(0)
      await expect(read.append([])).rejects.toMatchObject({ name: 'SessionReadOnlyError' })
    } finally { await read.close() }
    await writer.close(); await writer.close()
    await expect(writer.read()).rejects.toMatchObject({ name: 'SessionHandleClosedError' })
    const successor = await f.ctx.sessionPersistence.open(f.id, 'write'); await successor.close()
  })

  it('refuses a future generation instead of silently selecting its older v0 sibling', async () => {
    const f = await fixture(compression)
    const suffix = compression === 'zstd' ? '.zstd' : ''
    const raw = Buffer.from(JSON.stringify({ type: 'session', version: 99, id: f.id, createdAt: 1000 }) + '\n')
    const future = join(f.dir, `session.v99.jsonl${suffix}`)
    const bytes = compression === 'zstd' ? zstdCompressSync(raw) : raw
    await writeFile(future, bytes)
    await expect(f.ctx.sessionPersistence.open(f.id, 'write')).rejects.toThrow(/format|version|generation/i)
    expect(await readFile(future)).toEqual(bytes)
    expect(await readFile(f.path)).toEqual(f.bytes)
  })
})
