import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const entry = pathToFileURL(join(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js')).href
describe('published CLI Desktop-only plugin capability', () => {
  it.each([
    { allowed: false, argv: ['plugin', '--profile', 'desktop', 'list'], code: 1, spawn: false },
    { allowed: true, argv: ['plugin', '--profile', 'desktop', 'list'], code: 17, spawn: true },
    { allowed: true, argv: ['--profile', 'desktop', '--dump-config'], code: 1, spawn: false },
    { allowed: true, argv: ['--profile', 'desktop'], code: 1, spawn: false },
  ])('keeps the boundary for $argv with desktopPlugin=$allowed', ({ allowed, argv, code, spawn }) => {
    const home = mkdtempSync(join(tmpdir(), 'cli-profile-boundary-'))
    try {
      const profile = join(home, 'profiles/desktop')
      mkdirSync(profile, { recursive: true })
      writeFileSync(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: {} }))
      const probe = `
        import childProcess from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        childProcess.spawnSync = (command, args, options) => {
          process.stdout.write(JSON.stringify({ command, args, cwd: options.cwd, hidden: options.windowsHide }));
          return { status: 17 };
        };
        syncBuiltinESMExports();
        process.argv = [process.execPath, 'dsh', ...${JSON.stringify(argv)}];
        const { runCli } = await import(${JSON.stringify(entry)});
        await runCli(${allowed ? '{ desktopPlugin: true }' : ''});
      `
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
        env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', timeout: 15_000, windowsHide: true,
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(code)
      if (spawn) expect(JSON.parse(result.stdout)).toEqual({ command: 'pnpm', args: ['list'], cwd: profile, hidden: true })
      else {
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('managed exclusively by the Electron application')
      }
    } finally { rmSync(home, { recursive: true, force: true }) }
  })
})
