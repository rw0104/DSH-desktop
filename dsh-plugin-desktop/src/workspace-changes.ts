/** One changed file represented by the Workbench Changes service. */
export interface WorkspaceChangeFile {
  readonly path: string
  readonly oldPath?: string
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown'
  readonly hunks: readonly WorkspaceChangeHunk[]
}

/** One unified-diff hunk with stable identity within a file snapshot. */
export interface WorkspaceChangeHunk {
  readonly id: string
  readonly header: string
  readonly oldStart: number
  readonly oldCount: number
  readonly newStart: number
  readonly newCount: number
  readonly lines: readonly string[]
}

/** Build a deterministic, content-sensitive identity for one diff hunk. */
function hunkId(path: string, header: string, lines: readonly string[]): string {
  // FNV-1a keeps this module portable to the client build while still making
  // a changed hunk fail closed instead of reusing a stale UI id.
  let hash = 2166136261
  const input = `${path}\n${header}\n${lines.join('\n')}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return `hunk:${hash.toString(16).padStart(8, '0')}`
}

/** Parse a Git unified diff into stable file/hunk records without shell parsing. */
export function parseWorkspaceDiff(diff: string): readonly WorkspaceChangeFile[] {
  const files: WorkspaceChangeFile[] = []
  let current: { path: string; oldPath?: string; status: WorkspaceChangeFile['status']; hunks: WorkspaceChangeHunk[] } | undefined
  let hunk: { id: string; readonly header: string; readonly oldStart: number; readonly oldCount: number; readonly newStart: number; readonly newCount: number; lines: string[] } | undefined
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current !== undefined) files.push(current)
      const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line)
      current = {
        path: match?.[2] ?? 'unknown',
        ...(match !== null && match[1] !== match[2] ? { oldPath: match[1] } : {}),
        status: 'modified',
        hunks: [],
      }
      hunk = undefined
      continue
    }
    if (current === undefined) continue
    if (line.startsWith('new file mode')) current.status = 'added'
    else if (line.startsWith('deleted file mode')) current.status = 'deleted'
    else if (line.startsWith('similarity index')) current.status = 'renamed'
    else if (line.startsWith('copy from ')) current.status = 'copied'
    else if (line.startsWith('rename from ')) current.status = 'renamed'
    else if (line.startsWith('@@ ')) {
      const header = line
      const match = /^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@/u.exec(line)
      if (match === null) continue
      hunk = {
        id: hunkId(current.path, header, []),
        header,
        oldStart: Number(match[1]),
        oldCount: Number(match[2] ?? 1),
        newStart: Number(match[3]),
        newCount: Number(match[4] ?? 1),
        lines: [],
      }
      current.hunks.push(hunk)
    } else if (hunk !== undefined && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\'))) {
      hunk.lines = [...hunk.lines, line]
      // The id includes the complete line payload. Recompute it after each
      // line because the parser deliberately does not retain the raw patch.
      hunk.id = hunkId(current.path, hunk.header, hunk.lines)
    }
  }
  if (current !== undefined) files.push(current)
  return files
}
