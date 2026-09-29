// Tests for the subprocess-local Desktop_Patch (spec windows-subprocess-runner-fix,
// tasks 4.2/4.3/4.4/4.5 property tests + 4.6 example/boundary unit tests).
//
// The patch wraps the Windows Job runner environment with `withElectronRunAsNode`
// (compiled into `@deepseek-ai/dsh-subprocess-local/lib/index.js`, function
// `launchWindowsJob`). Under Electron it injects a single canonical
// `ELECTRON_RUN_AS_NODE='1'` on the *runner's own* process env; under plain Node it is
// an identity. The Target_Command receives the separate IPC `targetEnv`, which never
// carries the injected variable, and `process.env` is never mutated.
//
// Electron condition simulation: the patch reads `process.versions.electron` at launch
// time. Since vitest runs under plain Node (`process.versions.electron === undefined`),
// we stub that single property around each launch and restore it afterwards.
//
// Spawn observation: `launchWindowsJob` spawns the runner through
// `node:child_process.spawn`; vitest inlines `@deepseek-ai/dsh-subprocess-local`
// (see vitest.config.ts `server.deps.inline`), so mocking that module lets us capture
// the runner spawn options (runner env) and drive the runner's IPC lifecycle with a
// controllable fake child — verifying the injected env, the IPC `start` payload
// (targetEnv), and exit-code passthrough without launching any real process.
//
// fast-check is not installed in this repository, so each property uses a seeded
// deterministic PRNG to drive >= 100 random iterations.

import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async original => {
  const real = await original<typeof import('node:child_process')>()
  return { ...real, spawn: vi.fn() }
})

const { LocalSubprocessRuntime } = await import('@deepseek-ai/dsh-subprocess-local')

const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'
const ITERATIONS = 120 // >= 100 random iterations per property.

type SpawnSpec = Parameters<SubprocessRuntime['spawn']>[0]
type StartMessage = { type: string; cwd: string; env: Record<string, string | undefined>; control?: unknown }

/**
 * Minimal controllable stand-in for the Windows Job runner child process. It records
 * the spawn options and the IPC `start` message, and lets the test emit the runner's
 * lifecycle events (`spawn`, `message`, `exit`) so the public handle settles without a
 * real process.
 */
class FakeRunnerChild extends EventEmitter {
  connected = true
  pid = 4321
  // fd 4/5/6 carry the target stdio; launchWindowsJob reads stdio[4..6]. Null keeps
  // the collected-output path inert (no pipe streams to observe).
  stdio: Array<unknown> = [null, null, null, null, null, null, null]
  sent: StartMessage[] = []
  send(message: StartMessage, callback?: (error: Error | null) => void): boolean {
    this.sent.push(message)
    callback?.(null)
    return true
  }
  kill(): boolean {
    this.connected = false
    return true
  }
  disconnect(): void {
    this.connected = false
    this.emit('disconnect')
  }
}

const spawnMock = vi.mocked(spawn)
const spawnedChildren: FakeRunnerChild[] = []
const disposers: Array<() => Promise<void>> = []

let originalElectron: PropertyDescriptor | undefined

function setElectron(present: boolean): void {
  if (present) (process.versions as Record<string, string>).electron = '43.4.0'
  else delete (process.versions as { electron?: string }).electron
}

function clearAmbientRunAsNode(): void {
  for (const key of Object.keys(process.env)) {
    if (key.toUpperCase() === RUN_AS_NODE) delete process.env[key]
  }
}

function runAsNodeKeys(env: Record<string, unknown>): string[] {
  return Object.keys(env).filter(key => key.toUpperCase() === RUN_AS_NODE)
}

beforeEach(() => {
  originalElectron = Object.getOwnPropertyDescriptor(process.versions, 'electron')
  spawnedChildren.length = 0
  spawnMock.mockReset()
  spawnMock.mockImplementation(((..._args: unknown[]) => {
    const child = new FakeRunnerChild()
    spawnedChildren.push(child)
    return child as unknown as ChildProcess
  }) as unknown as typeof spawn)
})

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  spawnMock.mockReset()
  clearAmbientRunAsNode()
  delete (process.versions as { electron?: string }).electron
  if (originalElectron !== undefined) Object.defineProperty(process.versions, 'electron', originalElectron)
})

async function runtime(): Promise<SubprocessRuntime> {
  const ctx = new Context()
  const fiber = ctx.plugin(LocalSubprocessRuntime)
  await fiber
  disposers.push(fiber.dispose)
  return ctx.get('subprocess')!
}

function baseSpec(env?: Record<string, string>): SpawnSpec {
  return {
    argv: [process.execPath, '-e', ''],
    cwd: process.cwd(),
    graceMs: 200,
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    ...env === undefined ? {} : { env },
  }
}

interface LaunchResult {
  command: unknown
  args: unknown
  runnerEnv: Record<string, string | undefined>
  stdio: unknown
  startMessage: StartMessage | undefined
  done: { exitCode: number | null; signal: string | null }
  envBefore: string | undefined
  envAfter: string | undefined
}

/**
 * Launch one managed subprocess through the real runtime, capturing the runner spawn
 * and driving its IPC lifecycle to completion. `electron` selects the simulated Host
 * mode; `exitCode` is the Target_Command exit code delivered over IPC.
 */
async function launch(
  service: SubprocessRuntime,
  spec: SpawnSpec,
  options: { electron: boolean; exitCode?: number },
): Promise<LaunchResult> {
  const { electron, exitCode = 0 } = options
  spawnMock.mockClear()
  spawnedChildren.length = 0
  const envBefore = process.env[RUN_AS_NODE]
  setElectron(electron)
  const handle = service.spawn(spec)
  const call = spawnMock.mock.calls[0]
  const child = spawnedChildren[0]
  if (call === undefined || child === undefined) throw new Error('runner spawn was not invoked')
  const spawnOptions = call[2] as { env?: Record<string, string | undefined>; stdio?: unknown }
  const stdio = spawnOptions.stdio
  if (!Array.isArray(stdio) || !stdio.includes('ipc')) {
    throw new Error('Windows Job runner containment was not selected (fallback path); cannot verify runner env')
  }
  // Drive the runner's IPC lifecycle: spawn -> target-exit result -> runner exit.
  child.emit('spawn')
  child.emit('message', { type: 'target-exit', exitCode })
  child.emit('exit', 0, null)
  const done = (await handle.done) as { exitCode: number | null; signal: string | null }
  const envAfter = process.env[RUN_AS_NODE]
  setElectron(false)
  return {
    command: call[0],
    args: call[1],
    runnerEnv: spawnOptions.env ?? {},
    stdio,
    startMessage: child.sent[0],
    done,
    envBefore,
    envAfter,
  }
}

// ---- seeded deterministic PRNG + generators (fast-check is unavailable) ----

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
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[randomInt(rng, 0, alphabet.length - 1)]
  return out
}

/** Random extra ambient env vars that survive the runner scrub (no sensitive/DSH_ names). */
function randomAmbientEnv(rng: () => number): Record<string, string> {
  const env: Record<string, string> = {}
  const count = randomInt(rng, 0, 4)
  for (let i = 0; i < count; i++) env[`ZZAMBIENT_${randomToken(rng, 5)}`] = randomToken(rng, 8)
  return env
}

/** Random extra caller (Target_Command) env vars, never including the runner variable. */
function randomTargetEnv(rng: () => number): Record<string, string> {
  const env: Record<string, string> = {}
  const count = randomInt(rng, 0, 4)
  for (let i = 0; i < count; i++) env[`ZZTARGET_${randomToken(rng, 5)}`] = randomToken(rng, 8)
  return env
}

/** A random casing of "electron_run_as_node" (canonical, lower, or mixed). */
function randomCasing(rng: () => number): string {
  const canonical = RUN_AS_NODE.toLowerCase()
  let out = ''
  for (const ch of canonical) out += rng() < 0.5 ? ch.toUpperCase() : ch.toLowerCase()
  return out
}

function withAmbient(env: Record<string, string>): void {
  clearAmbientRunAsNode()
  for (const [key, value] of Object.entries(env)) process.env[key] = value
}

function removeAmbient(env: Record<string, string>): void {
  for (const key of Object.keys(env)) delete process.env[key]
  clearAmbientRunAsNode()
}

describe.skipIf(process.platform !== 'win32')('subprocess-local Desktop_Patch: Electron Node-mode runner', () => {
  // Validates: Requirements 3.1
  it('Feature: windows-subprocess-runner-fix, Property 1: Electron 下 runner 环境恰含规范 Run_As_Node 变量', async () => {
    const service = await runtime()
    const rng = mulberry32(0x1a2b3c4d)
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const ambient = randomAmbientEnv(rng)
      // Half the iterations pre-seed an arbitrary-cased ELECTRON_RUN_AS_NODE so the
      // case-insensitive de-dup is exercised; the other half start with none.
      const seedVariant = rng() < 0.5
      const variantKey = seedVariant ? randomCasing(rng) : undefined
      withAmbient(ambient)
      if (variantKey !== undefined) process.env[variantKey] = randomToken(rng, 6)
      try {
        const result = await launch(service, baseSpec(), { electron: true })
        const matches = runAsNodeKeys(result.runnerEnv)
        expect(matches).toEqual([RUN_AS_NODE])
        expect(result.runnerEnv[RUN_AS_NODE]).toBe('1')
      } finally {
        removeAmbient(ambient)
      }
    }
  })

  // Validates: Requirements 3.6
  it('Feature: windows-subprocess-runner-fix, Property 2: 普通 Node 下注入为恒等', async () => {
    const service = await runtime()
    const rng = mulberry32(0x5e6f7a8b)
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const ambient = randomAmbientEnv(rng)
      withAmbient(ambient) // never seeds ELECTRON_RUN_AS_NODE -> base has none
      try {
        const plain = await launch(service, baseSpec(), { electron: false })
        // Plain Node runner env must not carry the variable in any casing (req 3.6).
        expect(runAsNodeKeys(plain.runnerEnv)).toEqual([])
        // It must be a genuine runnerEnvironment output (structural anchors).
        expect(plain.runnerEnv.DSH_SUBPROCESS_RUNNER).toBe('windows')
        expect(plain.runnerEnv.SYSTEMD_LOG_TARGET).toBe('null')
        // Identity proof: with the same ambient env, the Electron branch differs from
        // the plain branch only by the single canonical key. Stripping it reproduces
        // the plain-Node env exactly -> the plain branch adds/removes nothing.
        const electron = await launch(service, baseSpec(), { electron: true })
        const strippedElectronEnv: Record<string, string | undefined> = { ...electron.runnerEnv }
        for (const key of runAsNodeKeys(strippedElectronEnv)) delete strippedElectronEnv[key]
        expect(strippedElectronEnv).toEqual(plain.runnerEnv)
      } finally {
        removeAmbient(ambient)
      }
    }
  })

  // Validates: Requirements 4.1, 4.2, 4.5
  it('Feature: windows-subprocess-runner-fix, Property 3: Run_As_Node 变量仅作用于 runner 自身进程', async () => {
    const service = await runtime()
    const rng = mulberry32(0x9c0d1e2f)
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const ambient = randomAmbientEnv(rng)
      const target = randomTargetEnv(rng)
      withAmbient(ambient)
      try {
        const result = await launch(service, baseSpec(target), { electron: true })
        // Runner itself got the injected variable...
        expect(result.runnerEnv[RUN_AS_NODE]).toBe('1')
        // ...but the IPC start payload (Target_Command env) must not carry it (req 4.2/4.5).
        const startMessage = result.startMessage
        expect(startMessage?.type).toBe('start')
        expect(runAsNodeKeys(startMessage?.env ?? {})).toEqual([])
        // Host process.env is never mutated (req 4.1).
        expect(result.envAfter).toBe(result.envBefore)
        expect(process.env[RUN_AS_NODE]).toBeUndefined()
      } finally {
        removeAmbient(ambient)
      }
    }
  })

  // Validates: Requirements 3.4
  it('Feature: windows-subprocess-runner-fix, Property 4: 非零退出码透传', async () => {
    const service = await runtime()
    const rng = mulberry32(0xa1b2c3d4)
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const exitCode = randomInt(rng, 1, 0x7fffffff) // any non-zero safe exit code
      const result = await launch(service, baseSpec(), { electron: true, exitCode })
      expect(result.done).toMatchObject({ exitCode })
    }
  })

  // Example + boundary unit tests (task 4.6) — Requirements 3.6, 4.1, 4.2, 4.3, 4.5.
  it('injects a single canonical ELECTRON_RUN_AS_NODE for the Electron runner', async () => {
    const service = await runtime()
    clearAmbientRunAsNode()
    const result = await launch(service, baseSpec(), { electron: true })
    expect(result.command).toBe(process.execPath)
    expect(result.runnerEnv[RUN_AS_NODE]).toBe('1')
    expect(runAsNodeKeys(result.runnerEnv)).toEqual([RUN_AS_NODE])
  })

  it('leaves the runner env untouched (no variable, alpha.2 markers) under plain Node', async () => {
    const service = await runtime()
    clearAmbientRunAsNode()
    const result = await launch(service, baseSpec(), { electron: false })
    expect(runAsNodeKeys(result.runnerEnv)).toEqual([])
    expect(result.runnerEnv.DSH_SUBPROCESS_RUNNER).toBe('windows')
    expect(result.runnerEnv.SYSTEMD_LOG_TARGET).toBe('null')
  })

  it('does not mutate the Host process.env when injecting under Electron', async () => {
    const service = await runtime()
    clearAmbientRunAsNode()
    const before = process.env[RUN_AS_NODE]
    const result = await launch(service, baseSpec(), { electron: true })
    expect(result.runnerEnv[RUN_AS_NODE]).toBe('1')
    expect(result.envBefore).toBe(before)
    expect(result.envAfter).toBe(before)
    expect(process.env[RUN_AS_NODE]).toBeUndefined()
  })

  it('keeps the Target_Command IPC env free of the injected variable', async () => {
    const service = await runtime()
    clearAmbientRunAsNode()
    const result = await launch(service, baseSpec({ MY_TARGET_VAR: 'keep-me' }), { electron: true })
    expect(result.startMessage?.type).toBe('start')
    expect(result.startMessage?.env.MY_TARGET_VAR).toBe('keep-me')
    expect(runAsNodeKeys(result.startMessage?.env ?? {})).toEqual([])
  })

  it('de-duplicates a pre-existing ELECTRON_RUN_AS_NODE case variant to one canonical key', async () => {
    const service = await runtime()
    clearAmbientRunAsNode()
    process.env['Electron_Run_As_Node'] = 'stale-value'
    try {
      const result = await launch(service, baseSpec(), { electron: true })
      expect(runAsNodeKeys(result.runnerEnv)).toEqual([RUN_AS_NODE])
      expect(result.runnerEnv[RUN_AS_NODE]).toBe('1')
    } finally {
      clearAmbientRunAsNode()
    }
  })
})
