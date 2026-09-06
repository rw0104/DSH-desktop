import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runIsolatedCheck } from './run-isolated-check.mjs'

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
