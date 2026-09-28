import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { runIsolatedDevelopment } from './run-isolated-dev.mjs'
import { removeIsolatedTree } from './remove-isolated-tree.mjs'

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dev-fixture-'))
  const workspaceRoot = join(root, 'checkout')
  const harnessHome = join(root, 'protected-home')
  const desktop = join(workspaceRoot, 'dsh-plugin-desktop')
  await mkdir(join(harnessHome, 'profiles', 'node_modules'), { recursive: true })
  await mkdir(join(desktop, 'lib'), { recursive: true })
  await mkdir(join(desktop, 'node_modules', 'electron'), { recursive: true })
  await writeFile(join(desktop, 'package.json'), '{"type":"module"}')
  // Use Node as a fake Electron executable: exercise the real child process,
  // import ordering and cleanup without displaying a graphical application.
  await writeFile(join(desktop, 'node_modules', 'electron', 'index.js'), `module.exports = ${JSON.stringify(process.execPath)}`)
  await writeFile(join(harnessHome, 'sentinel'), 'protected user data')
  const env = { ...process.env, DSH_HOME: harnessHome, DEV_PROBE_RESULT: join(root, 'result.json') }
  try { await callback({ root, workspaceRoot, harnessHome, desktop, env }) }
  finally { removeIsolatedTree(root) }
}

for (const exitCode of [0, 23]) {
  test(`runtime imports see isolated home, temp, user-data and cwd; exit ${exitCode} cleans only owned state`, async () => fixture(async f => {
    const target = join(f.root, 'keep')
    await mkdir(target)
    await writeFile(join(target, 'sentinel'), 'keep target')
    const snapshotBefore = { DSH_HOME: process.env.DSH_HOME, TEMP: process.env.TEMP }
    await writeFile(join(f.desktop, 'lib', 'main.js'), `
      import { writeFileSync, symlinkSync } from 'node:fs'
      import { dirname, join } from 'node:path'
      import { tmpdir } from 'node:os'
      const stateRoot = dirname(process.env.DSH_HOME)
      writeFileSync(process.env.DEV_PROBE_RESULT, JSON.stringify({
        stateRoot, home: process.env.DSH_HOME, temporary: tmpdir(), temp: process.env.TEMP,
        tmp: process.env.TMP, tmpdir: process.env.TMPDIR, cwd: process.cwd(), args: process.argv.slice(2),
        inheritedRuntime: process.env.DSH_RUNTIME_PACKAGE_DIR, nodeMode: process.env.ELECTRON_RUN_AS_NODE,
        nodePath: process.env.NODE_PATH,
      }))
      writeFileSync(join(process.env.DSH_HOME, 'session'), 'disposable session')
      symlinkSync(${JSON.stringify(target)}, join(process.env.DSH_HOME, 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
      process.exitCode = ${exitCode}
    `)
    const code = await runIsolatedDevelopment(['--upstream-diagnostic'], {
      workspaceRoot: f.workspaceRoot,
      env: { ...f.env, DSH_RUNTIME_PACKAGE_DIR: 'protected-runtime', ELECTRON_RUN_AS_NODE: '1',
        NODE_PATH: f.harnessHome, NODE_OPTIONS: '--require=missing-protected-preloader' },
    })
    assert.equal(code, exitCode)
    const snapshot = JSON.parse(await readFile(f.env.DEV_PROBE_RESULT, 'utf8'))
    assert.ok(isAbsolute(snapshot.home))
    assert.notEqual(snapshot.home, f.harnessHome)
    assert.equal(snapshot.home, join(snapshot.stateRoot, 'harness-home'))
    assert.equal(snapshot.cwd, join(snapshot.stateRoot, 'workspace'))
    assert.equal(snapshot.temporary, join(snapshot.stateRoot, 'tmp'))
    assert.equal(snapshot.temp, snapshot.temporary)
    assert.equal(snapshot.tmp, snapshot.temporary)
    assert.equal(snapshot.tmpdir, snapshot.temporary)
    assert.deepEqual(snapshot.args, [`--user-data-dir=${join(snapshot.stateRoot, 'electron-user-data')}`, '--upstream-diagnostic'])
    assert.equal(snapshot.inheritedRuntime, undefined)
    assert.equal(snapshot.nodeMode, undefined)
    assert.equal(snapshot.nodePath, undefined)
    assert.equal(existsSync(snapshot.stateRoot), false)
    assert.equal(await readFile(join(target, 'sentinel'), 'utf8'), 'keep target')
    assert.equal(await readFile(join(f.harnessHome, 'sentinel'), 'utf8'), 'protected user data')
    assert.deepEqual({ DSH_HOME: process.env.DSH_HOME, TEMP: process.env.TEMP }, snapshotBefore)
  }))
}

test('a failing build receives isolation before executing and never launches Electron', async () => fixture(async f => {
  const buildEntry = join(f.root, 'yarn.cjs')
  await writeFile(buildEntry, `
    const fs = require('node:fs'), path = require('node:path')
    fs.writeFileSync(process.env.DEV_PROBE_RESULT, JSON.stringify({ home: process.env.DSH_HOME, temp: process.env.TEMP, cwd: process.cwd(), args: process.argv.slice(2) }))
    process.exitCode = 17
  `)
  const code = await runIsolatedDevelopment(['--build'], { workspaceRoot: f.workspaceRoot, env: { ...f.env, npm_execpath: buildEntry } })
  assert.equal(code, 17)
  const snapshot = JSON.parse(await readFile(f.env.DEV_PROBE_RESULT, 'utf8'))
  assert.notEqual(snapshot.home, f.harnessHome)
  assert.equal(snapshot.temp, join(dirname(snapshot.home), 'tmp'))
  assert.equal(snapshot.cwd, f.workspaceRoot)
  assert.deepEqual(snapshot.args, ['run', 'build'])
  assert.equal(existsSync(dirname(snapshot.home)), false)
}))

test('a protected Profile link into this checkout refuses before any build or launch', async () => fixture(async f => {
  await symlink(f.desktop, join(f.harnessHome, 'profiles', 'node_modules', 'coupled'), 'junction')
  await assert.rejects(runIsolatedDevelopment(['--build'], { workspaceRoot: f.workspaceRoot, env: f.env }), /coupling is detected/)
  assert.equal(existsSync(f.env.DEV_PROBE_RESULT), false)
  assert.equal(await readFile(join(f.harnessHome, 'sentinel'), 'utf8'), 'protected user data')
}))

test('caller cannot replace disposable user-data or home through launch arguments', async () => {
  await assert.rejects(runIsolatedDevelopment(['--user-data-dir=C:\\protected']), /State paths are always disposable/)
})

for (const [initial, restartCode, expectedDiagnostic] of [[[], 76, true], [['--upstream-diagnostic'], 75, false]]) {
  test(`development restart ${restartCode} keeps state and propagates diagnostic selection`, async () => fixture(async f => {
    await writeFile(join(f.desktop, 'lib', 'main.js'), `
      import { existsSync, readFileSync, writeFileSync } from 'node:fs'
      import { join } from 'node:path'
      const counter = join(process.env.DSH_HOME, 'restart-marker')
      if (!existsSync(counter)) {
        writeFileSync(counter, process.env.DSH_HOME)
        process.exitCode = ${restartCode}
      } else {
        writeFileSync(process.env.DEV_PROBE_RESULT, JSON.stringify({
          home: process.env.DSH_HOME, firstHome: readFileSync(counter, 'utf8'),
          args: process.argv.slice(2), marker: process.env.DSH_DESKTOP_ISOLATED_DEV,
        }))
      }
    `)
    assert.equal(await runIsolatedDevelopment(initial, { workspaceRoot: f.workspaceRoot, env: f.env }), 0)
    const snapshot = JSON.parse(await readFile(f.env.DEV_PROBE_RESULT, 'utf8'))
    assert.equal(snapshot.home, snapshot.firstHome)
    assert.equal(snapshot.marker, '1')
    assert.equal(snapshot.args.includes('--upstream-diagnostic'), expectedDiagnostic)
    assert.equal(existsSync(dirname(snapshot.home)), false)
  }))
}
