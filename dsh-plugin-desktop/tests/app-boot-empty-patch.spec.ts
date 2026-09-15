import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadOptionalPatches } from '@deepseek-ai/dsh-app-boot'
import { describe, expect, it } from 'vitest'

describe('published app boot patch parser', () => {
  it.each(['', '# an intentionally empty local layer\n', 'null\n', '[]\n'])('accepts an empty patch layer: %j', content => {
    const dir = mkdtempSync(join(tmpdir(), 'empty-patch-'))
    try {
      const file = join(dir, 'cordis.patch.yml')
      writeFileSync(file, content)
      expect(loadOptionalPatches('fixture', file)).toEqual([])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it.each(['name: not-an-array\n', '[not-a-mapping]\n', 'invalid: [\n'])('continues to reject invalid nonempty layers: %j', content => {
    const dir = mkdtempSync(join(tmpdir(), 'invalid-patch-'))
    try {
      const file = join(dir, 'cordis.patch.yml')
      writeFileSync(file, content)
      expect(() => loadOptionalPatches('fixture', file)).toThrow()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
