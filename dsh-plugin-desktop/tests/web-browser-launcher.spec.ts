import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const entry = pathToFileURL(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-web-app')).href
describe('published explicit Web browser handoff', () => {
  it.each([false, true])('keeps the helper in Node mode only for an Electron Host: %s', electron => {
    const probe = `
      import cp from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      import { EventEmitter } from 'node:events';
      import { PassThrough } from 'node:stream';
      if (${electron}) Object.defineProperty(process.versions, 'electron', { value: '43.4.0', configurable: true });
      process.env.DEEPSEEK_API_KEY = 'fixture-not-a-real-secret';
      let captured;
      cp.spawn = (command, args, options) => {
        captured = { command, runAsNode: options.env.ELECTRON_RUN_AS_NODE ?? null,
          credentialForwarded: Object.hasOwn(options.env, 'DEEPSEEK_API_KEY'),
          cleansChildMode: args[2].includes("delete process.env[name]"), hidden: options.windowsHide };
        const child = new EventEmitter(); child.stderr = new PassThrough();
        queueMicrotask(() => child.emit('close', 0)); return child;
      };
      syncBuiltinESMExports();
      const { internals } = await import(${JSON.stringify(entry)});
      await internals.openBrowser('https://example.invalid/fixture');
      process.stdout.write(JSON.stringify(captured));
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ command: process.execPath, runAsNode: electron ? '1' : null, credentialForwarded: false, cleansChildMode: true, hidden: true })
  })
})
