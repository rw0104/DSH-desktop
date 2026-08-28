import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopExternalNavigationAction } from '../external-navigation-contract.ts'
import {
  INITIAL_DESKTOP_UPDATE_UI_STATE,
  type DesktopUpdateUiState,
} from '../update-ui-state.ts'

/** Namespace for the desktop-owned About section copy. */
export const DESKTOP_ABOUT_LOCALE = 'dsh-desktop-about'

export type DesktopAboutSectionProps = PropsRuntime<'settings.section'> & {
  about: { t: (key: string) => string }
  productVersion: string
  checkForUpdates: () => Promise<void>
  readUpdateState: (signal?: AbortSignal) => Promise<DesktopUpdateUiState>
  subscribeUpdateState: (listener: (state: DesktopUpdateUiState) => void) => () => void
  openExternal: (action: DesktopExternalNavigationAction) => Promise<void>
}

/** Render product identity, update behavior, repository, and release notes. */
export function DesktopAboutSection({
  about,
  productVersion,
  checkForUpdates,
  readUpdateState,
  subscribeUpdateState,
  openExternal,
}: DesktopAboutSectionProps) {
  const { t } = about
  const [requestPending, setRequestPending] = useState(false)
  const [updateState, setUpdateState] = useState<DesktopUpdateUiState>(INITIAL_DESKTOP_UPDATE_UI_STATE)
  useEffect(() => {
    const controller = new AbortController()
    const accept = (state: DesktopUpdateUiState): void => {
      setUpdateState(current => updateStateIsNewer(current, state) ? state : current)
    }
    const unsubscribe = subscribeUpdateState(accept)
    void readUpdateState(controller.signal).then(accept).catch(() => {})
    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [readUpdateState, subscribeUpdateState])
  const runExternal = (action: DesktopExternalNavigationAction): void => {
    void openExternal(action).catch(() => {})
  }
  const busy = requestPending || ['checking', 'awaiting-download-confirmation', 'downloading', 'verifying', 'launching-installer']
    .includes(updateState.phase)
  const runCheck = (): void => {
    if (busy) return
    setRequestPending(true)
    void checkForUpdates().finally(() => { setRequestPending(false) })
  }
  return (
    <section className="dshDesktopAbout" aria-labelledby="dsh-desktop-about-title">
      <div className="dshDesktopAboutIntro">
        <h2 id="dsh-desktop-about-title" className="dshDesktopAboutTitle">{t('title')}</h2>
        <p className="dshDesktopAboutSubtitle">{t('subtitle')}</p>
      </div>
      <div className="dshDesktopAboutRows">
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('version')}</span>
          <span className="dshDesktopAboutValue"><code>v{productVersion}</code></span>
        </div>
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('updateMethod')}</span>
          <span className="dshDesktopAboutValue">{t('confirmedInstall')}</span>
        </div>
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('repository')}</span>
          <button className="dshDesktopAboutLink dshDesktopAboutValue" type="button" data-external-action="repository" onClick={() => { runExternal('repository') }}>github.com/rw0104/DSH-desktop</button>
        </div>
      </div>
      <div className="dshDesktopAboutActions">
        <button className="dshDesktopAboutAction" type="button" disabled={busy} onClick={runCheck}>
          {busy ? t('checkingUpdates') : t('checkUpdates')}
        </button>
        <button className="dshDesktopAboutAction" type="button" data-external-action="release-notes" onClick={() => { runExternal('release-notes') }}>{t('viewRelease')}</button>
      </div>
      <DesktopUpdateStatus state={updateState} t={t} />
    </section>
  )
}

/** Render one accessible update status row; idle occupies no layout height. */
export function DesktopUpdateStatus({
  state,
  t,
}: {
  state: DesktopUpdateUiState
  t: (key: string) => string
}) {
  if (state.phase === 'idle') return null
  const text = updateStatusText(state, t)
  const percentage = downloadPercentage(state)
  const showProgress = state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'verifying'
  const failed = state.phase === 'failed'
  return (
    <div
      className={`dshDesktopUpdateStatus${failed ? ' dshDesktopUpdateStatusFailed' : ''}`}
      data-update-phase={state.phase}
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
    >
      <span className="dshDesktopUpdateStatusText">{text}</span>
      {showProgress && (
        <div
          className="dshDesktopUpdateProgress"
          role="progressbar"
          aria-label={t('updateProgress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          aria-valuetext={text}
          data-indeterminate={percentage === undefined ? 'true' : 'false'}
        >
          <span
            className="dshDesktopUpdateProgressValue"
            style={{ width: percentage === undefined ? '36%' : `${String(percentage)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function updateStateIsNewer(current: DesktopUpdateUiState, incoming: DesktopUpdateUiState): boolean {
  return incoming.generation > current.generation
    || (incoming.generation === current.generation && incoming.revision >= current.revision)
}

function downloadPercentage(state: DesktopUpdateUiState): number | undefined {
  if (state.phase !== 'downloading' || state.totalBytes === undefined || state.totalBytes <= 0) return undefined
  const raw = Math.floor((state.receivedBytes / state.totalBytes) * 100)
  // Integrity and PE/DMG validation happen after the stream finishes. Keep
  // the download phase below 100%; ready-to-install is the verified terminal state.
  return Math.max(0, Math.min(99, raw))
}

function updateStatusText(state: DesktopUpdateUiState, t: (key: string) => string): string {
  switch (state.phase) {
    case 'idle': return ''
    case 'checking': return t('statusChecking')
    case 'available': return format(t('statusAvailable'), { version: state.version })
    case 'awaiting-download-confirmation':
      return format(t('statusAwaitingConfirmation'), { version: state.version })
    case 'downloading': {
      const percentage = downloadPercentage(state)
      if (percentage === undefined || state.totalBytes === undefined) {
        return format(t('statusDownloadingUnknown'), {
          version: state.version,
          received: formatBytes(state.receivedBytes),
        })
      }
      return format(t('statusDownloading'), {
        version: state.version,
        percent: String(percentage),
        received: formatBytes(state.receivedBytes),
        total: formatBytes(state.totalBytes),
      })
    }
    case 'verifying': return format(t('statusVerifying'), { version: state.version })
    case 'ready-to-install': return format(t('statusReady'), { version: state.version })
    case 'launching-installer': return format(t('statusLaunching'), { version: state.version })
    case 'failed': return t('statusFailed')
    case 'cancelled': return t('statusCancelled')
  }
}

function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/gu, (_match, key: string) => values[key] ?? '')
}

function formatBytes(value: number): string {
  const megabyte = 1024 * 1024
  if (value >= megabyte) return `${String(Math.round(value / megabyte))} MB`
  if (value >= 1024) return `${String(Math.round(value / 1024))} KB`
  return `${String(value)} B`
}
