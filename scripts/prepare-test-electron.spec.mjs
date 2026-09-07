import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runIsolatedCheck } from './run-isolated-check.mjs'

test('global preparation finishes before both independent test workers start', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-check-fixture-'))
  try {
    const mockPackage = join(fixture, 'node_modules', 'electron')
    mkdirSync(mockPackage, { recursive: true })
    mkdirSync(join(fixture, 'cases'))
    writeFileSync(join(fixture, 'package.json'), '{"type":"module"}')
    writeFileSync(join(mockPackage, 'index.js'), `
      const fs = require('node:fs');
      fs.appendFileSync(${JSON.stringify(join(fixture, 'prepared'))}, String(process.pid) + '\\n');
      module.exports = ${JSON.stringify(join(fixture, 'fake-electron.exe'))};
    `)
    const setup = fileURLToPath(new URL('./prepare-test-electron.mjs', import.meta.url))
    const config = join(fixture, 'vitest.config.mjs')
    writeFileSync(config, `export default ${JSON.stringify({ root: fixture, test: {
      globals: true, include: ['cases/*.test.js'], maxWorkers: 2, pool: 'forks', globalSetup: [setup],
    } })}`)
    for (const name of ['a', 'b']) {
      writeFileSync(join(fixture, 'cases', `${name}.test.js`), `
        import { readFileSync } from 'node:fs';
        it('starts after preparation in the coordinator', () => {
          const lines = readFileSync(${JSON.stringify(join(fixture, 'prepared'))}, 'utf8').trim().split('\\n');
          expect(lines).toHaveLength(1);
          expect(Number(lines[0])).not.toBe(process.pid);
        });
      `)
    }
    const desktop = fileURLToPath(new URL('../dsh-plugin-desktop/', import.meta.url))
    assert.equal(runIsolatedCheck(['vitest', 'run', '--config', config], { cwd: desktop }), 0)
    assert.equal(readFileSync(join(fixture, 'prepared'), 'utf8').trim().split('\n').length, 1)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
