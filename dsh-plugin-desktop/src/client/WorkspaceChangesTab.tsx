import { useCallback, useEffect, useState } from 'react'
import { IconBranchOutline16, IconChevronDownOutline14, IconRefreshOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

type ChangesScope = 'unstaged' | 'staged' | 'last-turn'

interface WorkspaceChangesTabProps {
  scope: { sessionId: string; cwd?: string }
}

interface ChangeHunk {
  id: string
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
}

interface ChangeEntry {
  path: string
  xy: string
  staged: boolean
  unstaged: boolean
  status: string
  hunks: ChangeHunk[]
  stagedHunks: ChangeHunk[]
}

interface ChangesSnapshot {
  repositoryRoot?: string
  branch: string
  scope: ChangesScope
  lastTurnSeq?: number
  lastTurnAvailable?: boolean
  entries: ChangeEntry[]
}

interface ReviewDraft {
  side: 'old' | 'new'
  line: string
  comment: string
}

interface DiffLineRow {
  text: string
  oldLine?: number
  newLine?: number
}

const scopeLabels: readonly [ChangesScope, string][] = [
  ['unstaged', 'Unstaged'],
  ['staged', 'Staged'],
  ['last-turn', 'Last turn'],
]

/** Session-scoped Changes/Review surface backed entirely by the Host API. */
export function WorkspaceChangesTab({ scope }: WorkspaceChangesTabProps) {
  const [activeScope, setActiveScope] = useState<ChangesScope>('unstaged')
  const [snapshot, setSnapshot] = useState<ChangesSnapshot | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<{ path: string; hunk: ChangeHunk } | null>(null)
  const [draft, setDraft] = useState<ReviewDraft>({ side: 'new', line: '', comment: '' })

  const load = useCallback(async (action?: Record<string, unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const url = new URL('/dsh-desktop/api/workspace/changes', window.location.origin)
      url.searchParams.set('sessionId', scope.sessionId)
      url.searchParams.set('scope', activeScope)
      const request: RequestInit = {
        method: action === undefined ? 'GET' : 'POST',
        headers: action === undefined ? {} : { 'content-type': 'application/json', 'x-dsh-workbench-action': 'changes' },
      }
      if (action !== undefined) request.body = JSON.stringify(action)
      const response = await fetch(url, request)
      const value: unknown = await response.json()
      if (!response.ok) {
        const message = value !== null && typeof value === 'object' && 'message' in value
          ? String(value.message)
          : value !== null && typeof value === 'object' && 'error' in value ? String(value.error) : `Changes request failed (${response.status})`
        throw new Error(message)
      }
      if (action?.action === 'comment') setReview(null)
      setSnapshot(value as ChangesSnapshot)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [activeScope, scope.sessionId])

  useEffect(() => { void load() }, [load])

  const toggleEntry = (path: string): void => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const mutateHunk = (path: string, hunk: ChangeHunk, action: 'stage' | 'unstage' | 'revert'): void => {
    if (action === 'revert' && !window.confirm(`Revert this hunk in ${path}?`)) return
    void load({ action: 'hunk', hunkAction: action, scope: activeScope, path, hunkId: hunk.id, ...(action === 'revert' ? { confirmed: true } : {}) })
  }

  const openReview = (path: string, hunk: ChangeHunk, side: ReviewDraft['side'], line: number): void => {
    setReview({ path, hunk })
    setDraft({ side, line: String(line), comment: '' })
  }

  const submitComment = (): void => {
    if (review === null || snapshot?.repositoryRoot === undefined) return
    const line = Number(draft.line)
    if (!Number.isSafeInteger(line) || line < 1 || draft.comment.trim() === '') {
      setError('Enter a valid line and comment')
      return
    }
    void load({
      action: 'comment',
      repository: snapshot.repositoryRoot,
      path: review.path,
      side: draft.side,
      line,
      hunkId: review.hunk.id,
      comment: draft.comment.trim(),
    })
  }

  return (
    <section className="dshWorkspaceChanges" aria-label="Changes">
      <header className="dshWorkspaceChangesHeader">
        <div className="dshWorkspaceChangesBranch"><IconBranchOutline16 size={15} /> {snapshot?.branch ?? (error === null ? 'Loading' : 'Unavailable')}</div>
        <button type="button" className="dshWorkspaceChangesIcon" aria-label="Refresh changes" title="Refresh changes" disabled={busy} onClick={() => { void load() }}><IconRefreshOutline16 size={15} /></button>
      </header>
      <nav className="dshWorkspaceChangesScopes" aria-label="Change scope">
        {scopeLabels.map(([value, label]) => <button key={value} type="button" className={value === activeScope ? 'dshWorkspaceChangesScope is-active' : 'dshWorkspaceChangesScope'} aria-pressed={value === activeScope} onClick={() => { setActiveScope(value) }}>{label}</button>)}
      </nav>
      {activeScope === 'last-turn' && snapshot?.lastTurnAvailable === false && <div className="dshWorkspaceChangesEmpty">Last turn attribution is unavailable</div>}
      {error !== null && <div className="dshWorkspaceChangesError" role="alert">{error}</div>}
      {snapshot?.entries.length === 0 && snapshot?.lastTurnAvailable !== false && <div className="dshWorkspaceChangesEmpty">Working tree clean</div>}
      {snapshot?.entries.map(entry => {
        const hunks = activeScope === 'staged' ? entry.stagedHunks : activeScope === 'last-turn' ? [...entry.hunks, ...entry.stagedHunks] : entry.hunks
        const isExpanded = expanded.has(entry.path)
        return (
          <div className="dshWorkspaceChangesFile" key={`${entry.xy}:${entry.path}`}>
            <div className="dshWorkspaceChangesRow">
              <button type="button" className="dshWorkspaceChangesDisclosure" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${entry.path}`} title={`${isExpanded ? 'Collapse' : 'Expand'} ${entry.path}`} onClick={() => { toggleEntry(entry.path) }}><IconChevronDownOutline14 size={14} /></button>
              <span className="dshWorkspaceChangesBadge">{entry.xy}</span>
              <span className="dshWorkspaceChangesPath" title={entry.path}>{entry.path}</span>
              {activeScope !== 'last-turn' && <button type="button" className="dshWorkspaceChangesAction" aria-label={entry.staged ? `Unstage ${entry.path}` : `Stage ${entry.path}`} disabled={busy} onClick={() => { void load({ action: entry.staged ? 'unstage' : 'stage', path: entry.path }) }}>{entry.staged ? 'Unstage' : 'Stage'}</button>}
              {entry.unstaged && activeScope !== 'staged' && <button type="button" className="dshWorkspaceChangesIcon" aria-label={`Revert ${entry.path}`} title={`Revert ${entry.path}`} disabled={busy} onClick={() => { if (window.confirm(`Revert all changes in ${entry.path}?`)) void load({ action: 'revert', path: entry.path, confirmed: true }) }}><IconTrashOutline16 size={14} /></button>}
            </div>
            {isExpanded && <div className="dshWorkspaceChangesHunks">
              {hunks.length === 0 && <div className="dshWorkspaceChangesHunkEmpty">No textual hunk available</div>}
              {hunks.map(hunk => <div className="dshWorkspaceChangesHunk" key={hunk.id}>
                <code className="dshWorkspaceChangesHunkHeader">{hunk.header}</code>
                <div className="dshWorkspaceChangesHunkLines">{diffRows(hunk).map((row, index) => {
                  const side: ReviewDraft['side'] = row.newLine === undefined ? 'old' : 'new'
                  const line = row.newLine ?? row.oldLine
                  return <button key={`${hunk.id}:${String(index)}`} type="button" className={`dshWorkspaceChangesDiffLine ${diffLineClass(row.text)}`} disabled={line === undefined} aria-label={line === undefined ? row.text : `Comment on ${side} line ${String(line)}`} onClick={() => { if (line !== undefined) openReview(entry.path, hunk, side, line) }}><span>{row.oldLine ?? ''}</span><span>{row.newLine ?? ''}</span><code>{row.text}</code></button>
                })}</div>
                <div className="dshWorkspaceChangesHunkActions">
                  {activeScope === 'unstaged' && <button type="button" className="dshWorkspaceChangesAction" disabled={busy} onClick={() => { mutateHunk(entry.path, hunk, 'stage') }}>Stage hunk</button>}
                  {activeScope === 'staged' && <button type="button" className="dshWorkspaceChangesAction" disabled={busy} onClick={() => { mutateHunk(entry.path, hunk, 'unstage') }}>Unstage hunk</button>}
                  {activeScope === 'unstaged' && <button type="button" className="dshWorkspaceChangesAction" disabled={busy} onClick={() => { mutateHunk(entry.path, hunk, 'revert') }}>Revert hunk</button>}
                  <button type="button" className="dshWorkspaceChangesAction" disabled={busy || snapshot?.repositoryRoot === undefined} onClick={() => { openReview(entry.path, hunk, hunk.newCount > 0 ? 'new' : 'old', Math.max(1, hunk.newCount > 0 ? hunk.newStart : hunk.oldStart)) }}>Comment</button>
                </div>
                {review?.path === entry.path && review.hunk.id === hunk.id && <div className="dshWorkspaceChangesReview" aria-label="Review comment">
                  <div className="dshWorkspaceChangesReviewFields">
                    <select aria-label="Comment side" value={draft.side} onChange={event => { setDraft(previous => ({ ...previous, side: event.target.value as ReviewDraft['side'] })) }}><option value="new">New</option><option value="old">Old</option></select>
                    <input aria-label="Comment line" type="number" min={1} value={draft.line} onChange={event => { setDraft(previous => ({ ...previous, line: event.target.value })) }} />
                  </div>
                  <textarea aria-label="Review comment" value={draft.comment} onChange={event => { setDraft(previous => ({ ...previous, comment: event.target.value })) }} placeholder="Leave a comment for the current Session" />
                  <div className="dshWorkspaceChangesHunkActions"><button type="button" className="dshWorkspaceChangesAction" disabled={busy} onClick={submitComment}>Send to Session</button><button type="button" className="dshWorkspaceChangesAction" onClick={() => { setReview(null) }}>Cancel</button></div>
                </div>}
              </div>)}
            </div>}
          </div>
        )
      })}
    </section>
  )
}

function diffRows(hunk: ChangeHunk): DiffLineRow[] {
  let oldLine = hunk.oldStart
  let newLine = hunk.newStart
  return hunk.lines.map(text => {
    if (text.startsWith('+')) return { text, newLine: newLine++ }
    if (text.startsWith('-')) return { text, oldLine: oldLine++ }
    if (text.startsWith(' ')) return { text, oldLine: oldLine++, newLine: newLine++ }
    return { text }
  })
}

function diffLineClass(text: string): string {
  if (text.startsWith('+')) return 'is-addition'
  if (text.startsWith('-')) return 'is-deletion'
  return 'is-context'
}
