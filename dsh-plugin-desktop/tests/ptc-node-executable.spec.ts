// Tests for the ptc-runtime-node Desktop_Patch (spec windows-subprocess-runner-fix,
// task 5.2 Property 5 + contrast unit examples).
//
// The patch adds one guarded line to `NodePtcRuntime.execute()` (compiled into
// `@deepseek-ai/dsh-ptc-runtime-node/lib/index.js`):
//     if (process.versions.electron !== void 0 && executable === process.execPath)
//         env.ELECTRON_RUN_AS_NODE = "1";
// so the managed Node worker runs as Node only when the Host is Electron AND the
// resolved interpreter is the Electron binary itself (i.e. `nodeExecutable` defaulted
// to `process.execPath`). When `nodeExecutable` is explicitly configured,
// `resolveExecutable` returns that absolute path unchanged, so `executable` differs
// from `process.execPath` and nothing is injected — preserving the alpha.2 environment
// handling (Requirement 7.2).
//
// We invoke the real patched `execute()` on a hand-built instance (bypassing cordis
// composition) with a fake `ctx.subprocess`. `resolveExecutable` is modelled as the
// identity on an absolute path — exactly its documented behavior for an absolute
// command (candidates=[command], returned unchanged after stat/access) — which isolates
// the env/executable-selection logic under test from filesystem existence. We use
// `danger-full-access` policy (no `ctx.sandbox`) and set an absolute `bootstrapPath`
// (no `ctx.fs`), then capture the `ctx.subprocess.spawn` spec and settle the run through
// a controllable fake handle.
//
// The Electron condition is simulated by stubbing `process.versions.electron` (vitest
// runs under plain Node, where the guard is trivially false). fast-check is not
// installed, so a seeded deterministic PRNG drives >= 100 random iterations.

import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodePtcRuntime } from '@deepseek-ai/dsh-ptc-runtime-node'

const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'
const ITERATIONS = 120 // >= 100 random iterations.

let originalElectron: PropertyDescriptor | undefined

function setElectron(present: boolean): void {
  if (present) (process.versions as Record<string, string>).electron = '43.4.0'
  else delete (process.versions as { electron?: string }).electron
}

function runAsNodeKeys(env: Record<string, unknown>): string[] {
  return Object.keys(env).filter(key => key.toUpperCase() === RUN_AS_NODE)
}

beforeEach(() => {
  originalElectron = Object.getOwnPropertyDescriptor(process.versions, 'electron')
})

afterEach(() => {
  delete (process.versions as { electron?: string }).electron
  if (originalElectron !== undefined) Object.defineProperty(process.versions, 'electron', originalElectron)
})

interface CapturedSpawn {
  argv: string[]
  env: Record<string, string | undefined>
}

// A fake ctx.subprocess handle that satisfies execute()'s control/stdout/stderr
// requirement and settles immediately.
function fakeHandle() {
  const control = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  stdout.end(); stdout.resume()
  stderr.end(); stderr.resume()
  return {
    control,
    stdout,
    stderr,
    done: Promise.resolve({ exitCode: 0, signal: null }),
    terminate(): void {},
    terminateForHostExit(): void {},
    waitForExit: async (): Promise<boolean> => true,
  }
}

interface RunOptions {
  nodeExecutable: string
  electron: boolean
}

// `execute` is declared `private` (compile-time only); reach it via a cast on the
// prototype so we can invoke the real patched method on a hand-built instance.
const runtimePrototype = NodePtcRuntime.prototype as unknown as {
  execute: (
    this: unknown,
    spec: unknown,
    policy: unknown,
    bindings: unknown,
    controller: AbortController,
  ) => Promise<unknown>
}
const executeMethod = runtimePrototype.execute

/**
 * Drive the real patched `NodePtcRuntime.execute()` once and capture the spawn spec
 * (argv + env) handed to the subprocess service.
 */
async function runOnce(options: RunOptions): Promise<CapturedSpawn> {
  const { nodeExecutable, electron } = options
  const captured: CapturedSpawn[] = []
  const fakeSubprocess = {
    // resolveExecutable identity on an absolute path (its documented behavior).
    resolveExecutable: async (command: string): Promise<string> => command,
    spawn: (spec: { argv: string[]; env: Record<string, string | undefined> }) => {
      captured.push({ argv: spec.argv, env: spec.env })
      return fakeHandle()
    },
  }
  const instance = {
    config: {
      timeoutMs: 120000,
      maxTimeoutMs: 600000,
      maxOutputBytes: 67108864,
      maxOldGenerationSizeMb: 512,
      maxMessageBytes: 134217728,
      maxPendingCalls: 128,
      graceMs: 25,
      nodeExecutable,
      bootstrapPath: process.platform === 'win32' ? 'C:\\dsh\\bootstrap.mjs' : '/dsh/bootstrap.mjs',
    },
    ctx: { subprocess: fakeSubprocess, fs: {} },
  }
  const spec = { program: '', cwd: process.cwd(), timeoutMs: null }
  const policy = { mode: 'danger-full-access', workspaceRoot: process.cwd() }
  setElectron(electron)
  try {
    await executeMethod.call(instance, spec, policy, new Map(), new AbortController())
  } finally {
    setElectron(false)
  }
  const call = captured[0]
  if (call === undefined) throw new Error('ptc runtime did not spawn a worker process')
  return call
}

// ---- seeded deterministic PRNG (fast-check is unavailable) ----

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function randomToken(rng: () => number, length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[randomInt(rng, 0, alphabet.length - 1)]
  return out
}

/** A random absolute node-executable path that is never equal to process.execPath. */
function randomNodeExecutable(rng: () => number): string {
  const segments = randomInt(rng, 1, 3)
  let path = process.platform === 'win32' ? 'C:\\node' : '/opt/node'
  for (let i = 0; i < segments; i++) path += (process.platform === 'win32' ? '\\' : '/') + randomToken(rng, 6)
  path += process.platform === 'win32' ? `\\node-${randomToken(rng, 4)}.exe` : `/node-${randomToken(rng, 4)}`
  return path === process.execPath ? path + '-x' : path
}

describe('ptc-runtime-node Desktop_Patch: configured nodeExecutable', () => {
  // Validates: Requirements 7.2
  it('Feature: windows-subprocess-runner-fix, Property 5: 已配置 nodeExecutable 时保持原行为', async () => {
    const rng = mulberry32(0xc0ffee42)
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const nodeExecutable = randomNodeExecutable(rng)
      expect(nodeExecutable).not.toBe(process.execPath)
      // Under a simulated Electron Host, an explicitly configured (non-execPath)
      // interpreter must be used verbatim and must NOT receive the injection.
      const captured = await runOnce({ nodeExecutable, electron: true })
      expect(captured.argv[0]).toBe(nodeExecutable)
      expect(runAsNodeKeys(captured.env)).toEqual([])
    }
  })

  it('produces identical env for a configured executable whether or not the Host is Electron', async () => {
    const nodeExecutable = process.platform === 'win32' ? 'C:\\tools\\node\\node.exe' : '/usr/local/bin/node'
    const underElectron = await runOnce({ nodeExecutable, electron: true })
    const underPlainNode = await runOnce({ nodeExecutable, electron: false })
    expect(underElectron.argv[0]).toBe(nodeExecutable)
    expect(underPlainNode.argv[0]).toBe(nodeExecutable)
    expect(runAsNodeKeys(underElectron.env)).toEqual([])
    expect(runAsNodeKeys(underPlainNode.env)).toEqual([])
    expect(underElectron.env).toEqual(underPlainNode.env)
  })

  it('injects ELECTRON_RUN_AS_NODE only for the defaulted execPath interpreter under Electron', async () => {
    // Contrast: nodeExecutable defaulted to process.execPath + Electron -> injection.
    const underElectron = await runOnce({ nodeExecutable: process.execPath, electron: true })
    expect(underElectron.argv[0]).toBe(process.execPath)
    expect(underElectron.env[RUN_AS_NODE]).toBe('1')
    expect(runAsNodeKeys(underElectron.env)).toEqual([RUN_AS_NODE])
    // Same defaulted interpreter under plain Node -> no injection (alpha.2 behavior).
    const underPlainNode = await runOnce({ nodeExecutable: process.execPath, electron: false })
    expect(underPlainNode.argv[0]).toBe(process.execPath)
    expect(runAsNodeKeys(underPlainNode.env)).toEqual([])
  })
})
