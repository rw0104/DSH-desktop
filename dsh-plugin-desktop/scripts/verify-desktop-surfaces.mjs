/** Render production surfaces in an isolated, hidden Electron window. */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const require = createRequire(new URL('../package.json', import.meta.url))
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
const root = join(tmpdir(), 'desktop-surfaces')
mkdirSync(root, { recursive: true })
const aliases = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-store']
  .map(name => ({ find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: require.resolve(name) }))
const result = await build({ configFile: false, logLevel: 'error', resolve: { alias: aliases }, build: {
  write: false, minify: false, lib: { entry: fileURLToPath(new URL('../tests/browser/desktop-surfaces.tsx', import.meta.url)), formats: ['iife'], name: 'DesktopSurfaces' },
}, define: { 'process.env.NODE_ENV': '"production"' } })
writeFileSync(join(root, 'fixture.js'), result[0].output.find(item => item.type === 'chunk').code)
const css = result[0].output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n')
writeFileSync(join(root, 'index.html'), `<!doctype html><html><meta charset="utf-8"><style>${css}
body{margin:0;background:#f5f6f8;color:#20242a;font:14px system-ui;--dsw-alias-bg-mask-1:#0000003d;--dsw-mask-blur:blur(2px);--dsw-elevation-prominent:0 0 0 .5px #60606020,0 3px 8px #0000000a,0 0 20px #0000000d;--dsw-alias-bg-base:#fafbfc;--dsw-alias-bg-layer-1:#f0f2f4;--dsw-alias-bg-layer-2:#fafbfc;--dsw-alias-label-primary:#20242a;--dsw-alias-label-secondary:#555d68;--dsw-alias-border-l2:#d1d5dc;--dsw-alias-interactive-label-primary:#1761bc}
#settings-root{position:absolute;left:24px;bottom:24px}.background{padding:32px}body[data-ds-dark-theme]{background:#1c2026;--dsw-alias-bg-base:#242a32;--dsw-alias-bg-layer-2:#242a32;--dsw-alias-label-primary:#eef0f4;--dsw-alias-label-secondary:#b6c0cc;--dsw-alias-bg-mask-1:#00000080}
</style><body><div class="background"><h1>DSH Desktop</h1><p>工作区与会话保持清晰</p><input aria-label="背景输入"><button>背景操作</button></div><div id="settings-root"></div><script>window.__surfaceErrors=[];addEventListener('error',e=>__surfaceErrors.push(e.message));addEventListener('unhandledrejection',e=>__surfaceErrors.push(String(e.reason)))</script><script src="fixture.js"></script></body></html>`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawnSync(require('electron'), [fileURLToPath(new URL('../tests/browser/run-surfaces.cjs', import.meta.url)), join(root, 'index.html')], {
  windowsHide: true, env, stdio: 'inherit', timeout: 180_000,
})
if (child.error) throw child.error
process.exitCode = child.status ?? 1
