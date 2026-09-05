import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it('resolves profile CommonJS requests through the installation without executing modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-profile-cjs-'))
  try {
    const profile = join(root, 'profile/package.json')
    const installation = join(root, 'installation/package.json')
    const installed = join(root, 'installation/node_modules/fixture-installed')
    const profileOnly = join(root, 'profile/node_modules/fixture-profile')
    mkdirSync(join(root, 'profile'), { recursive: true })
    mkdirSync(installed, { recursive: true })
    mkdirSync(profileOnly, { recursive: true })
    writeFileSync(profile, '{"private":true}')
    writeFileSync(installation, '{"private":true}')
    writeFileSync(join(installed, 'package.json'), '{"name":"fixture-installed","exports":"./index.js"}')
    writeFileSync(join(installed, 'index.js'), 'throw new Error("resolution must not execute this module")')
    writeFileSync(join(profileOnly, 'package.json'), '{"name":"fixture-profile","exports":"./index.js"}')
    writeFileSync(join(profileOnly, 'index.js'), 'throw new Error("resolution must stay lazy")')
    const code = [
      "import { createRequire } from 'node:module';",
      "import assert from 'node:assert/strict';",
      `import { installProfilePackageResolver } from ${JSON.stringify(new URL('../src/module-resolution.ts', import.meta.url).href)};`,
      `const base=${JSON.stringify(pathToFileURL(profile).href)};`,
      `const dispose=installProfilePackageResolver(base,${JSON.stringify(pathToFileURL(installation).href)});`,
      "try {",
      "const local=createRequire(base);",
      "const loader=createRequire(import.meta.resolve('@deepseek-ai/cordis-plugin-loader'));",
      "console.log(local.resolve('fixture-installed'));",
      "assert.equal(loader.resolve('fixture-installed'),local.resolve('fixture-installed'));",
      "assert.equal(loader.resolve('fixture-profile'),local.resolve('fixture-profile'));",
      "assert.equal(loader.resolve('fs'),'fs');",
      "assert.throws(()=>local.resolve('fixture-missing'),{code:'MODULE_NOT_FOUND'});",
      "assert.throws(()=>loader.resolve('fixture-missing'),{code:'MODULE_NOT_FOUND'});",
      "} finally { dispose() }",
    ].join('\n')
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
      encoding: 'utf8', timeout: 15000, windowsHide: true,
    })
    expect(result.status, result.stderr || result.error?.message).toBe(0)
    expect(result.stdout.trim()).toBe(join(installed, 'index.js'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
