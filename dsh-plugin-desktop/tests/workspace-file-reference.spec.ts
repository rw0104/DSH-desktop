import { describe, expect, it } from 'vitest'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { workspaceFileReference } from '../src/client/workspace-file-reference.ts'
const base: InputState = { draft: 'Read @long-file.txt ', draftRev: 9, phase: 'plain', imageIds: [], queue: [], occurrences: [
  { occurrenceId: 1, source: 'files', ref: 'old', offset: 5, length: 14, label: 'long-file.txt', clipboardText: '@long-file.txt' },
] }
describe('workspace file reference append', () => {
  it('uses chip detection coordinates and the live revision without replacing existing text', () => {
    const request = workspaceFileReference(base, '.dsh-uploads/file-abc/新文件.txt', true)
    expect(request?.span).toEqual({ start: 7, end: 7, draftRev: 9 })
    expect(request?.text).toContain('新文件.txt')
    expect(base.draft).toBe('Read @long-file.txt ')
    expect(base.occurrences).toHaveLength(1)
  })
  it.each(['claimed', 'adjudicating', 'submitting'] as const)('does not insert a file reference into a %s command', phase => {
    expect(workspaceFileReference({ ...base, phase }, 'file', false)).toBeUndefined()
  })
})
