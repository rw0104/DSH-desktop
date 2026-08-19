import { useCallback, useEffect, useState } from 'react'
import { IconBranchOutline16, IconRefreshOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

interface WorkspaceChangesTabProps {
  scope: { sessionId: string; cwd?: string }
}

interface ChangeEntry {
  path: string
  xy: string
  staged: boolean
  unstaged: boolean
  status: string
}

interface ChangesSnapshot {
  branch: string
  entries: ChangeEntry[]
}

/** First W1 projection: session-scoped status and safe file-level Git actions. */
export function WorkspaceChangesTab({ scope }: WorkspaceChangesTabProps) {
  const [snapshot, setSnapshot] = useState<ChangesSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (action?: string, path?: string): Promise<void> => {
    if (scope.cwd === undefined || scope.cwd === '') {
      setError('Workspace path is unavailable')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const url = new URL('/dsh-desktop/api/workspace/changes', window.location.origin)
      url.searchParams.set('sessionId', scope.sessionId)
      url.searchParams.set('cwd', scope.cwd)
      const request: RequestInit = {
        method: action === undefined ? 'GET' : 'POST',
        headers: action === undefined ? {} : { 'content-type': 'application/json', 'x-dsh-workbench-action': 'changes' },
      }
      if (action !== undefined) request.body = JSON.stringify({ action, path })
      const response = await fetch(url, request)
      const value: unknown = await response.json()
      if (!response.ok) throw new Error(value !== null && typeof value === 'object' && 'error' in value ? String(value.error) : `Changes request failed (${response.status})`)
      setSnapshot(value as ChangesSnapshot)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [scope.cwd, scope.sessionId])

  useEffect(() => { void load() }, [load])

  return (
    <section className="dshWorkspaceChanges" aria-label="Changes">
      <header className="dshWorkspaceChangesHeader">
        <div className="dshWorkspaceChangesBranch"><IconBranchOutline16 size={15} /> {snapshot?.branch ?? 'Loading'}</div>
        <button type="button" className="dshWorkspaceChangesIcon" aria-label="Refresh changes" title="Refresh changes" disabled={busy} onClick={() => { void load() }}><IconRefreshOutline16 size={15} /></button>
      </header>
      {error !== null && <div className="dshWorkspaceChangesError" role="alert">{error}</div>}
      {snapshot?.entries.length === 0 && <div className="dshWorkspaceChangesEmpty">Working tree clean</div>}
      {snapshot?.entries.map(entry => (
        <div className="dshWorkspaceChangesRow" key={`${entry.xy}:${entry.path}`}>
          <span className="dshWorkspaceChangesBadge">{entry.xy}</span>
          <span className="dshWorkspaceChangesPath" title={entry.path}>{entry.path}</span>
          <button type="button" className="dshWorkspaceChangesAction" aria-label={entry.staged ? `Unstage ${entry.path}` : `Stage ${entry.path}`} disabled={busy} onClick={() => { void load(entry.staged ? 'unstage' : 'stage', entry.path) }}>{entry.staged ? 'Unstage' : 'Stage'}</button>
          {entry.unstaged && <button type="button" className="dshWorkspaceChangesIcon" aria-label={`Revert ${entry.path}`} title={`Revert ${entry.path}`} disabled={busy} onClick={() => { void load('revert', entry.path) }}><IconTrashOutline16 size={14} /></button>}
        </div>
      ))}
    </section>
  )
}
