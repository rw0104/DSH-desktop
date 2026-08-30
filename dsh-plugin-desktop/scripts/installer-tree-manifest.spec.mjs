import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createInstallerTreeManifest, verifyInstallerTree } from './installer-tree-manifest.mjs'

test('detects missing, extra, and mixed-version file content', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-installer-tree-'))
  try {
    writeFileSync(join(root, 'one.js'), 'one\n')
    writeFileSync(join(root, 'two.js'), 'two\n')
    const manifest = await createInstallerTreeManifest(root)
    assert.equal((await verifyInstallerTree(root, manifest)).fileCount, 2)

    writeFileSync(join(root, 'one.js'), 'candidate\n')
    await assert.rejects(verifyInstallerTree(root, manifest), /changed=one\.js/u)
    writeFileSync(join(root, 'one.js'), 'one\n')
    writeFileSync(join(root, 'extra.js'), 'extra\n')
    await assert.rejects(verifyInstallerTree(root, manifest), /extra=extra\.js/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
