import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { localProfilePackageManifest } from '../src/profile-package-ownership.ts'

it('keeps real local and linked plugins but excludes managed projections and shared ancestors', () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-ownership-'))
  const profile = join(root, 'profiles/desktop')
  const pkg = (path: string, extra = {}) => {
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name: 'fixture', ...extra }))
  }
  pkg(join(root, 'profiles/node_modules/shared'))
  pkg(join(profile, 'node_modules/local'))
  pkg(join(root, 'linked-plugin'))
  pkg(join(profile, '.dsh-module-fallback/node_modules/projected'))
  pkg(join(profile, 'node_modules/proxy'), { dsh: { moduleFallback: { targets: { '.': 'file:///old-install' } } } })
  const linked = join(profile, 'node_modules/linked')
  const projected = join(profile, 'node_modules/projected')
  mkdirSync(dirname(linked), { recursive: true })
  symlinkSync(join(root, 'linked-plugin'), linked, process.platform === 'win32' ? 'junction' : 'dir')
  symlinkSync(join(profile, '.dsh-module-fallback/node_modules/projected'), projected, process.platform === 'win32' ? 'junction' : 'dir')
  expect(localProfilePackageManifest(profile, 'local/private')).toBe(join(profile, 'node_modules/local/package.json'))
  expect(localProfilePackageManifest(profile, 'linked')).toBe(join(linked, 'package.json'))
  for (const name of ['shared', 'projected', 'proxy', 'missing']) expect(localProfilePackageManifest(profile, name)).toBeUndefined()
})
