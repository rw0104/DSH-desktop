import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareDesktopProfile } from '../src/profile.ts'
import { seedPollutedSharedProfile } from './fixtures/polluted-profile.ts'
// @ts-expect-error The shared JavaScript cleanup helper has no declaration file.
import { removeIsolatedTree } from '../../scripts/remove-isolated-tree.mjs'

const homes: string[] = []
const temporaryHome = () => {
  const home = mkdtempSync(join(tmpdir(), 'profile-shared-isolation-'))
  homes.push(home)
  return home
}
afterEach(() => { for (const home of homes.splice(0)) removeIsolatedTree(home) })

describe('Desktop leaves shared Profile dependency trees untouched', () => {
  it('does not create a shared dependency projection for a fresh home, including repeated and diagnostic preparation', () => {
    const home = temporaryHome()
    for (const experience of ['desktop', 'desktop', 'upstream-diagnostic'] as const) {
      const prepared = prepareDesktopProfile('1', home, 'win32', 'desktop', undefined, { experience })
      expect(prepared.profile.layers.length).toBeGreaterThan(1)
      expect(existsSync(join(home, 'profiles', 'node_modules'))).toBe(false)
    }
  })

  it('ignores old/new shared Junctions and a broken target without rewriting any shared bytes or metadata', () => {
    const home = temporaryHome()
    const contamination = seedPollutedSharedProfile(home)
    const sharedOnly = '@deepseek-ai/dsh-client-ui-shared-only-fixture'
    writeFileSync(join(home, 'cordis.patch.yml'), `- insert:\n    - id: shared-only\n      name: '${sharedOnly}'\n`)
    for (const experience of ['desktop', 'upstream-diagnostic', 'desktop'] as const) {
      const prepared = prepareDesktopProfile('1', home, 'win32', 'desktop', undefined, { experience })
      expect(prepared.profile.layers.map(layer => layer.packageName)).toContain('@deepseek-ai/dsh-base')
      expect(prepared.skippedOptionalEntries).toContainEqual({ id: 'shared-only', name: sharedOnly })
      contamination.assertUnchanged()
    }
  })
})
