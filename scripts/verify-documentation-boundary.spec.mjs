import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { hasLocalDocumentationLink, publicationViolation, verifyDocumentationBoundary } from './verify-documentation-boundary.mjs'

test('local development notes and generated dependencies cannot become publication inputs', () => {
  for (const path of ['docs/local/audit/report.md', 'docs/2026-09-06_development.md', 'docs/2026-09-06-development.md', 'docs/02-development-plan.md', 'docs/development-plan.md', 'docs/evidence/new-local-capture.png', 'dsh-plugin-desktop/dist/test.exe', 'dsh-plugin-desktop/node_modules/a/package.json', '.tmp-release/installer.exe']) {
    assert.ok(publicationViolation(path), path)
  }
  for (const path of ['docs/local/.gitkeep', 'docs/releases/v2.2.7.md', 'docs/upstream-sync.md', 'docs/plugin-development.md', 'docs/evidence/electron/directory-picker-2.0.8.png', 'README.md', '.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md', '.yarn/patches/fix.patch']) {
    assert.equal(publicationViolation(path), undefined, path)
  }
})

test('public documentation rejects relative and encoded local links while allowing policy prose', () => {
  assert.equal(hasLocalDocumentationLink('[notes](local/a.md)', 'docs/README.md'), true)
  assert.equal(hasLocalDocumentationLink('[notes](../local/a.md)', 'docs/releases/v2.2.7.md'), true)
  assert.equal(hasLocalDocumentationLink('<a href="/docs%2flocal/a.md">notes</a>', 'README.md'), true)
  assert.equal(hasLocalDocumentationLink('Keep notes under `docs/local/`.', 'README.md'), false)
  assert.equal(hasLocalDocumentationLink('[guide](user-guide.md)', 'docs/README.md'), false)
})

test('force-adding a local note is rejected from the actual Git index', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-doc-boundary-test-'))
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    mkdirSync(join(root, 'docs', 'local'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), 'docs/local/\n')
    writeFileSync(join(root, 'docs', 'local', 'private.md'), 'local only\n')
    execFileSync('git', ['add', '-f', 'docs/local/private.md'], { cwd: root })
    assert.throws(() => verifyDocumentationBoundary(root), /local development material/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
