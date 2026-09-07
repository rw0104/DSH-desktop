import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

describe('the actual published CLI plugin entry', () => {
  it('passes Windows hiding to its active pnpm chunk without changing exit or terminal stdio', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-cli-plugin-'))
    try {
      const lib = join(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')), 'lib')
      const active = readdirSync(lib).filter(file => /^plugin-.+\.js$/.test(file)
        && readFileSync(join(lib, file), 'utf8').includes('export { runPlugin }'))
      expect(active).toHaveLength(1)
      const home = join(fixture, 'home')
      const profile = join(home, 'profiles', 'isolated-cli')
      mkdirSync(profile, { recursive: true })
      writeFileSync(join(profile, 'package.json'), '{"private":true,"dependencies":{}}')
      const probe = join(fixture, 'probe.mjs')
      writeFileSync(probe, `
        import childProcess from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        let captured;
        childProcess.spawnSync = (command, args, options) => {
          if (command !== 'pnpm') throw new Error('Unexpected subprocess');
          captured = { command, args, options }; return { status: 17 };
        };
        syncBuiltinESMExports();
        const { runPlugin } = await import(${JSON.stringify(pathToFileURL(join(lib, active[0]!)).href)});
        const exit = runPlugin('isolated-cli', ['list', '--depth=0']);
        process.stdout.write(JSON.stringify({ exit, captured }));
      `)
      const output = execFileSync(process.execPath, [probe], {
        cwd: fixture, env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000,
      })
      expect(JSON.parse(output)).toMatchObject({ exit: 17, captured: {
        command: 'pnpm', args: ['list', '--depth=0'],
        options: { cwd: profile, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true },
      } })
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
