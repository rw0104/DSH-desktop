import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import {
  IconBranchOutline16,
  IconCloseOutline16,
  IconCodeOutline16,
  IconFolderOpenOutline16,
  IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopClientEnvironment } from './environment.ts'
import type {} from './contracts.ts'
import { WorkspaceChangesTab } from './WorkspaceChangesTab.tsx'

type WorkbenchTab = 'changes' | 'terminals' | 'worktree'

interface DesktopWorkbenchFace {
  environment: DesktopClientEnvironment
  openPath(path: string): Promise<void>
}

export type DesktopWorkbenchProps = PropsRuntime<'shell.overlay'> & {
  desktopWorkbench: DesktopWorkbenchFace
}

interface WorkbenchPreference {
  open: boolean
  width: number
}

interface WorkspaceContextMenu {
  x: number
  y: number
  path: string
}

interface TerminalRecord {
  id: string
  source: 'ui' | 'agent'
  cwd: string
  title?: string
  command?: string
  status: string
  exitCode?: number | null
  lastOutput?: string
}

interface WorktreeEntry {
  path: string
  branch?: string
  detached: boolean
  bare: boolean
}

interface WorktreeSnapshot {
  repositoryRoot: string
  checkoutPath: string
  branch?: string
  head: string
  detached: boolean
  ownership: 'managed' | 'unmanaged'
  worktrees: readonly WorktreeEntry[]
}

const STORAGE_KEY = 'dsh.desktop.workbench.v1'
export const WORKBENCH_DEFAULT_WIDTH = 380
export const WORKBENCH_MIN_WIDTH = 320
export const WORKBENCH_MAX_WIDTH = 560

const COPY = {
  en: {
    title: 'Workbench', open: 'Open workbench', close: 'Close workbench', changes: 'Changes', terminals: 'Terminals', worktree: 'Worktree',
    noSession: 'Select or create a session to use this workbench.', openFolder: 'Open folder', loading: 'Loading…', refresh: 'Refresh',
    noTerminals: 'No terminal activity for this session.', branch: 'Branch', checkout: 'Checkout', repository: 'Repository', status: 'Status',
    managed: 'Managed by DSH Desktop', unmanaged: 'Existing checkout', createBranch: 'New branch name', createWorktree: 'Create managed worktree',
    removeWorktree: 'Remove managed worktree', removeQuestion: 'Remove this managed worktree? The branch is kept.', confirmRemove: 'Remove', cancel: 'Cancel',
  },
  zh: {
    title: '工作台', open: '打开工作台', close: '关闭工作台', changes: '更改', terminals: '终端', worktree: '工作树',
    noSession: '选择或创建会话后即可使用工作台。', openFolder: '打开目录', loading: '正在加载…', refresh: '刷新',
    noTerminals: '当前会话没有终端活动。', branch: '分支', checkout: '检出目录', repository: '仓库', status: '状态',
    managed: '由 DSH Desktop 管理', unmanaged: '现有工作区', createBranch: '新分支名称', createWorktree: '创建受管工作树',
    removeWorktree: '移除受管工作树', removeQuestion: '确定移除此受管工作树？分支会保留。', confirmRemove: '移除', cancel: '取消',
  },
} as const

type WorkbenchCopy = typeof COPY.en | typeof COPY.zh

function copy(): WorkbenchCopy {
  const language = document.documentElement.lang || navigator.language
  return language.toLowerCase().startsWith('zh') ? COPY.zh : COPY.en
}

/** Clamp a persisted or pointer-resized Workbench width to its supported range. */
export function clampWorkbenchWidth(width: number): number {
  if (!Number.isFinite(width)) return WORKBENCH_DEFAULT_WIDTH
  return Math.min(WORKBENCH_MAX_WIDTH, Math.max(WORKBENCH_MIN_WIDTH, Math.round(width)))
}

/** Parse the versioned Workbench preference without trusting local storage. */
export function parseWorkbenchPreference(value: string | null): WorkbenchPreference | undefined {
  if (value === null) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const open = (parsed as { open?: unknown }).open
    const width = (parsed as { width?: unknown }).width
    if (typeof open !== 'boolean' || typeof width !== 'number') return undefined
    return { open, width: clampWorkbenchWidth(width) }
  } catch {
    return undefined
  }
}

function initialPreference(): WorkbenchPreference {
  try {
    const persisted = parseWorkbenchPreference(window.localStorage.getItem(STORAGE_KEY))
    if (persisted !== undefined) return persisted
  } catch {}
  return { open: window.innerWidth >= 1180, width: WORKBENCH_DEFAULT_WIDTH }
}

/** Desktop-owned right Workbench plus the workspace-row context menu. */
export function DesktopWorkbench({ desktopWorkbench, useSessions }: DesktopWorkbenchProps) {
  const t = copy()
  const session = useSessions(state => {
    const current = state.current
    return current === undefined ? undefined : state.byId[current]
  })
  const [preference, setPreference] = useState(initialPreference)
  const [tab, setTab] = useState<WorkbenchTab>('changes')
  const [contextMenu, setContextMenu] = useState<WorkspaceContextMenu | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference)) } catch {}
  }, [preference])

  useEffect(() => {
    const body = document.body
    if (preference.open) {
      body.dataset.dshDesktopWorkbenchOpen = ''
      body.style.setProperty('--dsh-desktop-workbench-width', `${String(preference.width)}px`)
    } else {
      delete body.dataset.dshDesktopWorkbenchOpen
      body.style.removeProperty('--dsh-desktop-workbench-width')
    }
    return () => {
      delete body.dataset.dshDesktopWorkbenchOpen
      body.style.removeProperty('--dsh-desktop-workbench-width')
    }
  }, [preference.open, preference.width])

  useEffect(() => {
    const close = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('.dshDesktopWorkspaceContextMenu') !== null) return
      setContextMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    const onContextMenu = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return
      const row = event.target.closest<HTMLElement>('[data-dsh-workspace-path]')
      const path = row?.dataset.dshWorkspacePath?.trim()
      if (path === undefined || path === '') return
      event.preventDefault()
      event.stopPropagation()
      setContextError(null)
      setContextMenu({
        x: Math.min(event.clientX, Math.max(8, window.innerWidth - 196)),
        y: Math.min(event.clientY, Math.max(8, window.innerHeight - 56)),
        path,
      })
    }
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [])

  const resizeOrigin = useRef(0)
  const resizeWidth = useRef(0)
  const onResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    resizeOrigin.current = event.clientX
    resizeWidth.current = preference.width
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [preference.width])
  const onResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const width = clampWorkbenchWidth(resizeWidth.current + resizeOrigin.current - event.clientX)
    setPreference(previous => ({ ...previous, width }))
  }, [])

  const openDirectory = (): void => {
    const path = contextMenu?.path
    if (path === undefined) return
    setContextMenu(null)
    void desktopWorkbench.openPath(path).catch((reason: unknown) => {
      setContextError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return <>
    {!preference.open && <button type="button" className="dshDesktopWorkbenchLauncher" aria-label={t.open} title={t.open} onClick={() => { setPreference(previous => ({ ...previous, open: true })) }}><IconCodeOutline16 /></button>}
    {preference.open && <aside className="dshDesktopWorkbench" style={{ width: preference.width }} aria-label={t.title} data-desktop-platform={desktopWorkbench.environment.platform}>
      <div className="dshDesktopWorkbenchResize" role="separator" aria-orientation="vertical" aria-label={`${t.title} width`} onPointerDown={onResizeStart} onPointerMove={onResizeMove} />
      <header className="dshDesktopWorkbenchHeader">
        <strong>{t.title}</strong>
        <button type="button" className="dshDesktopWorkbenchIcon" aria-label={t.close} title={t.close} onClick={() => { setPreference(previous => ({ ...previous, open: false })) }}><IconCloseOutline16 /></button>
      </header>
      <nav className="dshDesktopWorkbenchTabs" aria-label={t.title}>
        <WorkbenchTabButton id="changes" active={tab === 'changes'} label={t.changes} onSelect={setTab}><IconBranchOutline16 /></WorkbenchTabButton>
        <WorkbenchTabButton id="terminals" active={tab === 'terminals'} label={t.terminals} onSelect={setTab}><IconCodeOutline16 /></WorkbenchTabButton>
        <WorkbenchTabButton id="worktree" active={tab === 'worktree'} label={t.worktree} onSelect={setTab}><IconFolderOpenOutline16 /></WorkbenchTabButton>
      </nav>
      <div className="dshDesktopWorkbenchBody">
        {session === undefined && <div className="dshDesktopWorkbenchEmpty">{t.noSession}</div>}
        {session !== undefined && tab === 'changes' && <WorkspaceChangesTab scope={{ sessionId: String(session.id), ...(session.cwd === undefined ? {} : { cwd: session.cwd }) }} />}
        {session !== undefined && tab === 'terminals' && <TerminalsPanel sessionId={String(session.id)} t={t} />}
        {session !== undefined && tab === 'worktree' && <WorktreePanel sessionId={String(session.id)} t={t} />}
      </div>
    </aside>}
    {contextMenu !== null && <div className="dshDesktopWorkspaceContextMenu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={event => { event.stopPropagation() }}>
      <button type="button" role="menuitem" onClick={openDirectory}><IconFolderOpenOutline16 /><span>{t.openFolder}</span></button>
    </div>}
    {contextError !== null && <div className="dshDesktopWorkbenchToast" role="alert">{contextError}</div>}
  </>
}

function WorkbenchTabButton(props: { id: WorkbenchTab; active: boolean; label: string; onSelect(id: WorkbenchTab): void; children: React.ReactNode }) {
  return <button type="button" className={`dshDesktopWorkbenchTab${props.active ? ' is-active' : ''}`} aria-selected={props.active} role="tab" title={props.label} onClick={() => { props.onSelect(props.id) }}>{props.children}<span>{props.label}</span></button>
}

function TerminalsPanel({ sessionId, t }: { sessionId: string; t: WorkbenchCopy }) {
  const [terminals, setTerminals] = useState<readonly TerminalRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setError(null)
    try {
      const url = new URL('/dsh-desktop/api/workspace/terminals', window.location.origin)
      url.searchParams.set('sessionId', sessionId)
      const response = await fetch(url)
      const value = await response.json() as { terminals?: readonly TerminalRecord[]; error?: string }
      if (!response.ok) throw new Error(value.error ?? `Terminal request failed (${String(response.status)})`)
      setTerminals(value.terminals ?? [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [sessionId])
  useEffect(() => { void load() }, [load])
  return <section className="dshDesktopWorkbenchPanel" aria-label={t.terminals}>
    <PanelToolbar title={t.terminals} refresh={t.refresh} onRefresh={() => { void load() }} />
    {error !== null && <div className="dshDesktopWorkbenchError">{error}</div>}
    {terminals === null && error === null && <div className="dshDesktopWorkbenchEmpty">{t.loading}</div>}
    {terminals?.length === 0 && <div className="dshDesktopWorkbenchEmpty">{t.noTerminals}</div>}
    {terminals?.map(terminal => <article className="dshDesktopTerminalRow" key={terminal.id}>
      <div><strong>{terminal.title ?? terminal.command ?? terminal.source}</strong><span className={`dshDesktopTerminalStatus is-${terminal.status}`}>{terminal.status}</span></div>
      <code>{terminal.cwd}</code>
      {terminal.lastOutput !== undefined && <pre>{terminal.lastOutput}</pre>}
    </article>)}
  </section>
}

function WorktreePanel({ sessionId, t }: { sessionId: string; t: WorkbenchCopy }) {
  const [snapshot, setSnapshot] = useState<WorktreeSnapshot | null>(null)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useCallback(async (action?: { action: 'create'; branch: string } | { action: 'remove' }) => {
    setBusy(true)
    setError(null)
    try {
      const url = new URL('/dsh-desktop/api/workspace/worktrees', window.location.origin)
      url.searchParams.set('sessionId', sessionId)
      const response = await fetch(url, action === undefined ? undefined : {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-workbench-action': 'worktrees' },
        body: JSON.stringify(action),
      })
      const value = await response.json() as WorktreeSnapshot & { error?: string; message?: string }
      if (!response.ok) throw new Error(value.message ?? value.error ?? `Worktree request failed (${String(response.status)})`)
      setSnapshot(value)
      setConfirmRemove(false)
      if (action?.action === 'create') setBranch('')
    } catch (reason) {
      setSnapshot(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [sessionId])
  useEffect(() => { void request() }, [request])
  return <section className="dshDesktopWorkbenchPanel" aria-label={t.worktree}>
    <PanelToolbar title={t.worktree} refresh={t.refresh} onRefresh={() => { void request() }} disabled={busy} />
    {error !== null && <div className="dshDesktopWorkbenchError">{error}</div>}
    {snapshot === null && error === null && <div className="dshDesktopWorkbenchEmpty">{t.loading}</div>}
    {snapshot !== null && <>
      <dl className="dshDesktopWorktreeFacts">
        <div><dt>{t.branch}</dt><dd>{snapshot.branch ?? snapshot.head.slice(0, 12)}</dd></div>
        <div><dt>{t.checkout}</dt><dd><code>{snapshot.checkoutPath}</code></dd></div>
        <div><dt>{t.repository}</dt><dd><code>{snapshot.repositoryRoot}</code></dd></div>
        <div><dt>{t.status}</dt><dd>{snapshot.ownership === 'managed' ? t.managed : t.unmanaged}</dd></div>
      </dl>
      {snapshot.ownership === 'unmanaged' && <div className="dshDesktopWorktreeAction">
        <input value={branch} aria-label={t.createBranch} placeholder={t.createBranch} disabled={busy} onChange={event => { setBranch(event.target.value) }} />
        <button type="button" disabled={busy || branch.trim() === ''} onClick={() => { void request({ action: 'create', branch: branch.trim() }) }}>{t.createWorktree}</button>
      </div>}
      {snapshot.ownership === 'managed' && !confirmRemove && <div className="dshDesktopWorktreeAction"><button type="button" disabled={busy} onClick={() => { setConfirmRemove(true) }}>{t.removeWorktree}</button></div>}
      {snapshot.ownership === 'managed' && confirmRemove && <div className="dshDesktopWorktreeConfirm"><p>{t.removeQuestion}</p><div><button type="button" disabled={busy} onClick={() => { void request({ action: 'remove' }) }}>{t.confirmRemove}</button><button type="button" disabled={busy} onClick={() => { setConfirmRemove(false) }}>{t.cancel}</button></div></div>}
    </>}
  </section>
}

function PanelToolbar({ title, refresh, onRefresh, disabled = false }: { title: string; refresh: string; onRefresh(): void; disabled?: boolean }) {
  return <div className="dshDesktopWorkbenchPanelToolbar"><strong>{title}</strong><button type="button" className="dshDesktopWorkbenchIcon" disabled={disabled} aria-label={refresh} title={refresh} onClick={onRefresh}><IconRefreshOutline16 /></button></div>
}
