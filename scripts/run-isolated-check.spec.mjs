import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { runIsolatedCheck } from './run-isolated-check.mjs'
import { removeIsolatedTree } from './remove-isolated-tree.mjs'

test('failed checks clean isolated state, preserve linked targets and leave parent environment intact', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-check-fixture-'))
  const original = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR, DSH_HOME: process.env.DSH_HOME }
  try {
    mkdirSync(join(fixture, 'kept'))
    writeFileSync(join(fixture, 'kept', 'sentinel'), 'keep')
    writeFileSync(join(fixture, 'probe.mjs'), `
      import { writeFileSync, symlinkSync } from 'node:fs'
      import { tmpdir } from 'node:os'
      import { dirname, join } from 'node:path'
      const stateRoot = dirname(process.env.DSH_HOME)
      writeFileSync('result.json', JSON.stringify({ stateRoot, temporary: tmpdir(), home: process.env.DSH_HOME }))
      writeFileSync(join(process.env.DSH_HOME, 'session'), 'test only')
      symlinkSync(join(process.cwd(), 'kept'), join(tmpdir(), 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
      process.exitCode = 23
    `)
    assert.equal(runIsolatedCheck(['probe.mjs'], { cwd: fixture }), 23)
    const snapshot = JSON.parse(readFileSync(join(fixture, 'result.json'), 'utf8'))
    assert.equal(snapshot.temporary, join(snapshot.stateRoot, 'tmp'))
    assert.equal(snapshot.home, join(snapshot.stateRoot, 'harness-home'))
    assert.equal(existsSync(snapshot.stateRoot), false)
    assert.equal(readFileSync(join(fixture, 'kept', 'sentinel'), 'utf8'), 'keep')
    assert.deepEqual({ TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR, DSH_HOME: process.env.DSH_HOME }, original)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

for (const runtime of process.platform === 'win32' ? ['node', 'electron'] : ['node']) {
  test(`${runtime} cleanup preserves nested and read-only link targets on success and failure`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-check-fixture-'))
    const sentinel = join(fixture, 'kept', 'sentinel')
    try {
      mkdirSync(join(fixture, 'kept'))
      writeFileSync(sentinel, 'protected target bytes')
      chmodSync(sentinel, 0o444)
      const mode = statSync(sentinel).mode
      writeFileSync(join(fixture, 'probe.mjs'), `
        import { chmodSync, mkdirSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs'
        import { join, dirname } from 'node:path'
        const root = dirname(process.env.DSH_HOME)
        const target = join(process.cwd(), 'kept')
        const kind = process.platform === 'win32' ? 'junction' : 'dir'
        mkdirSync(join(process.env.DSH_HOME, 'nested'))
        symlinkSync(target, join(process.env.DSH_HOME, 'nested', 'outside'), kind)
        const dangling = join(root, 'removed-target')
        mkdirSync(dangling)
        symlinkSync(dangling, join(process.env.DSH_HOME, 'dangling'), kind)
        rmdirSync(dangling)
        const local = join(process.env.DSH_HOME, 'readonly')
        writeFileSync(local, 'disposable'); chmodSync(local, 0o444)
        writeFileSync('snapshot.json', JSON.stringify({ root, electron: process.versions.electron }))
        process.exitCode = Number(process.env.FIXTURE_EXIT)
      `)
      const launcher = new URL('./run-isolated-check.mjs', import.meta.url).href
      writeFileSync(join(fixture, 'runner.mjs'), `
        import { runIsolatedCheck } from ${JSON.stringify(launcher)}
        process.exitCode = runIsolatedCheck(['probe.mjs'])
      `)
      const executable = runtime === 'electron'
        ? createRequire(new URL('../dsh-plugin-desktop/package.json', import.meta.url))('electron')
        : process.execPath
      for (const exitCode of [0, 23]) {
        const result = spawnSync(executable, [join(fixture, 'runner.mjs')], {
          cwd: fixture, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FIXTURE_EXIT: String(exitCode) },
          windowsHide: true, encoding: 'utf8', timeout: 30_000,
        })
        assert.equal(result.error, undefined, result.stderr)
        assert.equal(result.status, exitCode, result.stderr)
        const snapshot = JSON.parse(readFileSync(join(fixture, 'snapshot.json'), 'utf8'))
        if (runtime === 'electron') assert.ok(snapshot.electron)
        assert.equal(existsSync(snapshot.root), false, `Cleanup left ${snapshot.root}`)
        assert.equal(readFileSync(sentinel, 'utf8'), 'protected target bytes')
        assert.equal(statSync(sentinel).mode, mode)
      }
    } finally {
      if (existsSync(sentinel)) chmodSync(sentinel, 0o666)
      rmSync(fixture, { recursive: true, force: true })
    }
  })
}

for (const replacement of ['root', 'ancestor']) {
  test(`refuses a replaced ${replacement} without touching the replacement target`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-check-fixture-'))
    try {
      const temp = join(fixture, 'temp')
      mkdirSync(temp)
      writeFileSync(join(fixture, 'probe.mjs'), `
        import { mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
        import { basename, dirname, join, relative, isAbsolute } from 'node:path'
        const fixture = process.cwd()
        const root = dirname(process.env.DSH_HOME)
        if (dirname(root) !== join(fixture, 'temp')) throw new Error('unexpected test root')
        const protectedDir = join(fixture, 'protected')
        mkdirSync(protectedDir)
        const replacement = ${JSON.stringify(replacement)}
        const moved = join(fixture, 'moved')
        const source = replacement === 'root' ? root : dirname(root)
        if (isAbsolute(relative(fixture, source)) || relative(fixture, source).startsWith('..')) throw new Error('fixture path escaped')
        renameSync(source, moved)
        const sentinelDir = replacement === 'root' ? protectedDir : join(protectedDir, basename(root))
        mkdirSync(sentinelDir, { recursive: true })
        writeFileSync(join(sentinelDir, 'keep'), 'replacement is protected')
        writeFileSync('guard.json', JSON.stringify({ sentinel: join(sentinelDir, 'keep') }))
        symlinkSync(protectedDir, source, process.platform === 'win32' ? 'junction' : 'dir')
      `)
      const launcher = new URL('./run-isolated-check.mjs', import.meta.url).href
      writeFileSync(join(fixture, 'runner.mjs'), `import { runIsolatedCheck } from ${JSON.stringify(launcher)}; runIsolatedCheck(['probe.mjs']);`)
      const result = spawnSync(process.execPath, [join(fixture, 'runner.mjs')], {
        cwd: fixture, env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
        windowsHide: true, encoding: 'utf8', timeout: 30_000,
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /Refusing to clean a replaced or escaped check directory/)
      const { sentinel } = JSON.parse(readFileSync(join(fixture, 'guard.json'), 'utf8'))
      assert.equal(readFileSync(sentinel, 'utf8'), 'replacement is protected')
    } finally {
      removeIsolatedTree(fixture)
    }
  })
}

test('locked links fail after bounded retries and leave their targets unchanged', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-check-fixture-'))
  const owned = join(fixture, 'owned'), target = join(fixture, 'target'), link = join(owned, 'link')
  mkdirSync(owned); mkdirSync(target)
  writeFileSync(join(target, 'sentinel'), 'keep locked target')
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  const failure = Object.assign(new Error('fixture junction is busy'), { code: 'EBUSY' })
  const originalUnlink = fs.unlinkSync
  const unlink = mock.method(fs, 'unlinkSync', path => {
    if (String(path) === link) throw failure
    return originalUnlink(path)
  })
  const wait = mock.method(Atomics, 'wait', () => 'timed-out')
  syncBuiltinESMExports()
  try {
    assert.throws(() => removeIsolatedTree(owned), failure)
    assert.equal(unlink.mock.calls.filter(call => String(call.arguments[0]) === link).length, 4)
    assert.equal(wait.mock.calls.length, 3)
    assert.equal(readFileSync(join(target, 'sentinel'), 'utf8'), 'keep locked target')
    assert.equal(existsSync(link), true)
  } finally {
    mock.restoreAll(); syncBuiltinESMExports()
    removeIsolatedTree(fixture)
  }
})
