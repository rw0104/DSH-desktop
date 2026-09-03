import { defineConfig } from 'tsdown'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = 'dsh-plugin-desktop'
const packageRoot = dirname(fileURLToPath(import.meta.url))

function buildCommit(): string {
  const supplied = process.env.DSH_BUILD_COMMIT?.trim()
  if (supplied && /^[0-9a-f]{7,40}$/iu.test(supplied)) return supplied
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: resolve(packageRoot, '..'), encoding: 'utf8' }).trim()
  } catch {
    return 'development'
  }
}

const buildDefines = { __DSH_BUILD_COMMIT__: JSON.stringify(buildCommit()) }

export default defineConfig([
  {
    name: PACKAGE_NAME,
    entry: {
      index: 'src/index.ts',
      'module-resolution': 'src/module-resolution.ts',
      profile: 'src/profile.ts',
      'profile-manager': 'src/profile-manager.ts',
      'profile-service': 'src/profile-service.ts',
      'desktop-plugins': 'src/desktop-plugins.ts',
      pnpm: 'src/pnpm.ts',
      profiles: 'src/profiles.ts',
      diagnostics: 'src/diagnostics.ts',
      notifications: 'src/notifications.ts',
      'diagnostic-export-worker': 'src/diagnostic-export-worker.ts',
      runtime: 'src/runtime.ts',
      'electron-runtime': 'src/electron-runtime.ts',
      'desktop-runtime-environment': 'src/desktop-runtime-environment.ts',
      'desktop-terminal': 'src/desktop-terminal.ts',
      'desktop-cli': 'src/desktop-cli.ts',
      terminal: 'src/terminal.ts',
      'update-checker': 'src/update-checker.ts',
      'update-download': 'src/update-download.ts',
      updates: 'src/updates.ts',
      'deliverable-copy': 'src/deliverable-copy-plugin.ts',
      'windows-agent-presets': 'src/windows-agent-presets.ts',
      'windows-pwsh-sandbox': 'src/windows-pwsh-sandbox.ts',
      'windows-acl-runner': 'src/windows-acl-runner.ts',
      main: 'src/main.ts',
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    define: buildDefines,
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
  },
  {
    name: `${PACKAGE_NAME}/bin`,
    entry: { bin: 'src/bin.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    define: buildDefines,
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    outputOptions: {
      banner: '#!/usr/bin/env node',
    },
  },
  {
    name: `${PACKAGE_NAME}/client`,
    entry: { client: 'src/client/index.ts' },
    tsconfig: 'tsconfig.client.json',
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    define: buildDefines,
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    external: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-web',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
    noExternal: (id: string) => id.startsWith('@deepseek-ai/') ? undefined : true,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
  {
    name: `${PACKAGE_NAME}/preload`,
    entry: { preload: 'src/preload.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    define: buildDefines,
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    external: ['electron'],
    outputOptions: {
      entryFileNames: 'preload.cjs',
    },
  },
])
