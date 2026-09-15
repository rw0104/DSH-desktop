import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import provenance from './fixtures/upstream-rc2-preset-assets.json' with { type: 'json' }

function filesUnder(root: string, prefix = ''): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? filesUnder(join(root, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`])
}

describe('published CLI preset assets from the fixed official rc.2 tree', () => {
  const manifestPath = createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')
  const root = join(dirname(manifestPath), 'config/agent-presets')
  it('includes exactly the reviewed files in the package publication surface', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(manifest.version).toBe('0.1.5-rc.2')
    expect(manifest.files).toContain('config/agent-presets/**')
    expect(filesUnder(root).sort()).toEqual(provenance.files.map(file => file.path).sort())
  })
  it.each(provenance.files)('preserves the official Git blob for $path', file => {
    const bytes = readFileSync(join(root, file.path))
    expect(bytes.length).toBe(file.bytes)
    const blobHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    expect(blobHash).toBe(file.gitBlob)
  })
})
