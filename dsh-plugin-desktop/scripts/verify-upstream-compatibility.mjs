import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(desktopRoot, '..')
const upstream = readJson(join(repoRoot, 'upstream.json'))
const desktop = readJson(join(desktopRoot, 'package.json'))
const upstreamManifest = readJson(join(repoRoot, 'deepseek-harness', 'package.json'))
const expected = upstream.sourceVersion
if (typeof expected !== 'string' || expected !== '0.1.0-rc.7') {
  throw new Error(`verify-upstream-compatibility: upstream.json must pin rc7, got ${String(expected)}`)
}
if (upstreamManifest.version !== expected) {
  throw new Error(`verify-upstream-compatibility: submodule is ${String(upstreamManifest.version)}, expected ${expected}`)
}
const mismatches = Object.entries({ ...desktop.dependencies, ...desktop.devDependencies })
  .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
  .filter(([, version]) => version !== expected)
if (mismatches.length > 0) {
  throw new Error(`verify-upstream-compatibility: desktop rc7 dependency drift: ${mismatches.map(([name, value]) => `${name}=${String(value)}`).join(', ')}`)
}
const pluginPeers = []
for (const name of ['@anionex/dsh-vision-toolkit', 'dsh-better-sidebar']) {
  const manifest = readJson(join(desktopRoot, 'node_modules', ...name.split('/'), 'package.json'))
  for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (peer.startsWith('@deepseek-ai/dsh-') && !String(range).includes('rc.7')) {
      pluginPeers.push(`${name}:${peer}@${String(range)}`)
    }
  }
}
if (pluginPeers.length > 0) {
  process.stdout.write(`verify-upstream-compatibility: warnings for plugins not declaring rc7 peers: ${pluginPeers.join(', ')}\n`)
}
process.stdout.write(`verify-upstream-compatibility: upstream ${expected} @ ${upstream.commit}; desktop dependencies aligned\n`)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
