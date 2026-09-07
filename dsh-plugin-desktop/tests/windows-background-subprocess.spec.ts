import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { spawn } from 'node:child_process'

vi.mock('node:child_process', async original => {
  const real = await original<typeof import('node:child_process')>()
  return { ...real, spawn: vi.fn(real.spawn) }
})
const { LocalSubprocessRuntime } = await import('@deepseek-ai/dsh-subprocess-local')
const disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  vi.mocked(spawn).mockClear()
})
async function runtime(): Promise<SubprocessRuntime> {
  const ctx = new Context()
  const fiber = ctx.plugin(LocalSubprocessRuntime)
  await fiber
  disposers.push(fiber.dispose)
  return ctx.get('subprocess')!
}

describe('published non-terminal subprocess runtime with the Desktop patch', () => {
  it('hides background children while retaining both output streams and failure status', async () => {
    const service = await runtime()
    const child = service.spawn({
      argv: [process.execPath, '-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 7'],
      cwd: process.cwd(), graceMs: 200, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    child.stdout!.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr!.on('data', chunk => stderr.push(Buffer.from(chunk)))
    expect(await child.done).toMatchObject({ exitCode: 7 })
    expect(Buffer.concat(stdout).toString()).toBe('out')
    expect(Buffer.concat(stderr).toString()).toBe('err')
    expect(vi.mocked(spawn).mock.calls[0]?.[2]).toMatchObject({ windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  })
  it('still terminates a cancelled background child', async () => {
    const service = await runtime()
    const abort = new AbortController()
    const child = service.spawn({
      argv: [process.execPath, '-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'],
      cwd: process.cwd(), graceMs: 200, signal: abort.signal, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    })
    await new Promise(resolve => child.stdout!.once('data', resolve))
    abort.abort()
    await child.done
    expect(await child.waitForExit()).toBe(true)
  })
  it.skipIf(process.platform !== 'win32')('has no visible console in an actual Windows child', async () => {
    const service = await runtime()
    const koffi = createRequire(import.meta.url).resolve('koffi')
    const script = `
      const koffi = require(${JSON.stringify(koffi)});
      const consoleWindow = koffi.load('kernel32.dll').func('void* __stdcall GetConsoleWindow()');
      const isVisible = koffi.load('user32.dll').func('int __stdcall IsWindowVisible(void*)');
      process.stdout.write(JSON.stringify({ visible: Boolean(isVisible(consoleWindow())), pid: process.pid }));
    `
    const child = service.spawn({ argv: [process.execPath, '-e', script], cwd: process.cwd(), graceMs: 200,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' } })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    child.stdout!.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr!.on('data', chunk => stderr.push(Buffer.from(chunk)))
    expect(await child.done, Buffer.concat(stderr).toString()).toMatchObject({ exitCode: 0 })
    expect(JSON.parse(Buffer.concat(stdout).toString())).toMatchObject({ visible: false, pid: child.pid })
  })
})
